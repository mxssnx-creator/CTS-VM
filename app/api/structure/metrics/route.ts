import { NextResponse } from "next/server"
import { getRedisClient, getAllConnections } from "@/lib/redis-db"

function toNumber(val: any, fallback = 0): number {
  const n = parseFloat(val)
  return isNaN(n) ? fallback : n
}

export async function GET() {
  try {
    const client = getRedisClient()
    const allConnections = await getAllConnections()
    const enabledConnections = allConnections.filter(
      (c) => c.is_enabled === "1" || c.is_enabled === true
    )
    const enabledConnIds = new Set(enabledConnections.map((c) => c.id))

    // 1. Active connections
    const activeConnections = enabledConnections.length

    // 2. Indications (total and active)
    let totalIndications = 0
    for (const conn of enabledConnections) {
      const count = await client.scard(`indications:${conn.id}`).catch(() => 0)
      totalIndications += count
    }
    const indicationsTotal = totalIndications
    const indicationsActive = totalIndications // no separate active flag

    // 3. Strategies (total and active)
    let totalStrategies = 0
    let activeStrategies = 0
    for (const conn of enabledConnections) {
      const stratIds = await client.smembers(`strategies:${conn.id}`).catch(() => [])
      totalStrategies += stratIds.length
      // Check each strategy's is_active field
      for (const sid of stratIds) {
        const strat = await client.hgetall(`strategy:${sid}`).catch(() => null)
        if (strat && (strat.is_active === "1" || strat.is_active === true)) {
          activeStrategies++
        }
      }
    }

    // 4. Real positions (live)
    const livePositions = await client.scard("positions:open").catch(() => 0)

    // 5. Pseudo positions metrics
    let totalPositions = 0
    let pseudoActive = 0
    const activeSymbols = new Set<string>()
    let totalVolume24h = 0
    let tradesPerHour = 0

    const closedPositions: { closedAt: Date; data: any }[] = []
    const now = Date.now()
    const hourAgo = now - 60 * 60 * 1000
    const twentyHoursAgo = now - 20 * 60 * 60 * 1000

    for (const conn of enabledConnections) {
      // Non-preset positions
      const nonPresetIds = await client
        .smembers(`pseudo_positions:${conn.id}`)
        .catch(() => [])
      // Preset positions for this connection
      const presetIds = await client
        .smembers(`preset_pseudo_positions:connection:${conn.id}`)
        .catch(() => [])

      const allPosIds = [...nonPresetIds, ...presetIds]
      totalPositions += allPosIds.length

      // Fetch all positions in parallel
      const posPromises = allPosIds.map(async (posId) => {
        // Try non-preset key first
        let data = await client
          .hgetall(`pseudo_position:${conn.id}:${posId}`)
          .catch(() => null)
        if (!data || Object.keys(data).length === 0) {
          data = await client
            .hgetall(`preset_pseudo_position:${posId}`)
            .catch(() => null)
        }
        return data || null
      })

      const posDataList = await Promise.all(posPromises)

      for (const data of posDataList) {
        if (!data) continue

        const entryPrice = toNumber(data.entry_price || data.entryPrice)
        const quantity = toNumber(data.quantity)
        const status = data.status // "open", "active", "closed"
        const symbol = data.symbol
        const side = data.side || data.direction || "long"
        const currentPrice = toNumber(
          data.current_price || data.currentPrice || data.entry_price
        )

        const isActive = status === "open" || status === "active"
        if (isActive) {
          pseudoActive++
          if (symbol) activeSymbols.add(symbol)
          totalVolume24h += entryPrice * quantity
        }

        // Trades per hour: opened_at or created_at within last hour
        const openedAtStr = data.opened_at || data.created_at
        if (openedAtStr) {
          const openedAt = new Date(openedAtStr).getTime()
          if (openedAt >= hourAgo) {
            tradesPerHour++
          }
        }

        // If closed, collect for profit metrics
        if (status === "closed") {
          const closedAtStr = data.closed_at
          if (closedAtStr) {
            const closedAt = new Date(closedAtStr)
            // Only include if closed within the last 20 hours (for 20h metric) - we'll filter later
            closedPositions.push({ closedAt, data })
          }
        }
      }
    }

    // Compute profit metrics from closed positions
    closedPositions.sort((a, b) => b.closedAt.getTime() - a.closedAt.getTime()) // most recent first

    // Helper to compute profit percent for a position
    const computeProfitPercent = (pos: any): number => {
      const entry = toNumber(pos.entry_price || pos.entryPrice)
      const qty = toNumber(pos.quantity)
      if (entry === 0 || qty === 0) return 0

      // Prefer stored percentage if available
      const storedPercent =
        toNumber(pos.realized_pnl_percent || pos.realizedPnlPercent) ||
        toNumber(pos.unrealized_pnl_percent || pos.unrealizedPnlPercent)
      if (storedPercent !== 0) return storedPercent

      // Compute from P&L
      let pnl = 0
      if (pos.realized_pnl) {
        pnl = toNumber(pos.realized_pnl)
      } else {
        const current = toNumber(pos.current_price || pos.currentPrice)
        const side = pos.side || pos.direction || "long"
        pnl = side === "long" ? (current - entry) * qty : (entry - current) * qty
      }
      return (pnl / (entry * qty)) * 100
    }

    // Last 20h (only consider closed positions within that window)
    const last20h = closedPositions.filter((p) => p.closedAt.getTime() >= twentyHoursAgo)
    const pfLast20h =
      last20h.length > 0
        ? last20h.reduce((sum, p) => sum + computeProfitPercent(p.data), 0) / last20h.length
        : 0

    // Last 50 closed positions
    const last50Closed = closedPositions.slice(0, 50)
    const pfLast50 =
      last50Closed.length > 0
        ? last50Closed.reduce((sum, p) => sum + computeProfitPercent(p.data), 0) /
          last50Closed.length
        : 0

    // Last 25 closed positions
    const last25Closed = closedPositions.slice(0, 25)
    const pfLast25 =
      last25Closed.length > 0
        ? last25Closed.reduce((sum, p) => sum + computeProfitPercent(p.data), 0) /
          last25Closed.length
        : 0

    // System load
    const memUsage = process.memoryUsage()
    const cpuUsage = (memUsage.heapUsed / memUsage.heapTotal) * 100

    // Database size
    const dbSize = await client.dbSize().catch(() => 0)

    // Return metrics (keep unused fields as 0)
    return NextResponse.json({
      activeConnections: activeConnections,
      totalPositions: totalPositions,
      dailyPnL: 0,
      totalBalance: 0,
      indicationsActive: indicationsActive,
      indicationsTotal: indicationsTotal,
      strategiesActive: activeStrategies,
      strategiesTotal: totalStrategies,
      systemLoad: Math.round(cpuUsage),
      databaseSize: dbSize,
      activeSymbols: activeSymbols.size,
      realPositions: 0,
      pseudoPositionsBase: 0,
      pseudoPositionsMain: 0,
      pseudoPositionsReal: 0,
      pseudoPositionsActive: pseudoActive,
      profitFactorLast20h: pfLast20h,
      profitFactorLast50: pfLast50,
      profitFactorLast25: pfLast25,
      livePositions: livePositions,
      pseudoBasePF20h: 0,
      pseudoBasePF25: 0,
      pseudoMainPF20h: pfLast20h,
      pseudoMainPF25: pfLast25,
      pseudoRealPF20h: 0,
      pseudoRealPF25: 0,
      pseudoActivePF20h: 0,
      pseudoActivePF25: 0,
    })
  } catch (error) {
    console.error("[v0] Error fetching structure metrics:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch structure metrics",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
