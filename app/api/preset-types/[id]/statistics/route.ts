import { type NextRequest, NextResponse } from "next/server"
import { getRedisClient, initRedis } from "@/lib/redis-db"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initRedis()
    const { id } = await params
    const client = getRedisClient()

    // Get preset type info
    const presetTypeData = await client.hgetall(`preset_type:${id}`)
    if (!presetTypeData || Object.keys(presetTypeData).length === 0) {
      return NextResponse.json({ error: "Preset type not found" }, { status: 404 })
    }
    const presetType = { ...presetTypeData, id }

    // Get configuration sets links for this preset type
    const linkIds = await client.smembers("preset_type_sets") || []
    const links: any[] = []
    for (const linkId of linkIds) {
      const linkData = await client.hgetall(`preset_type_set:${linkId}`)
      if (linkData && linkData.preset_type_id === id) {
        links.push({ ...linkData, id: linkId })
      }
    }

    // Count sets
    let totalSets = links.length
    let activeSets = 0
    for (const link of links) {
      if (link.is_active === "1" || link.is_active === true) activeSets++
    }

    // Fetch all preset real trades for this preset type
    const tradeIds = await client.smembers("preset_real_trades") || []
    const trades: any[] = []
    for (const tradeId of tradeIds) {
      const tradeData = await client.hgetall(`preset_real_trade:${tradeId}`)
      if (tradeData && tradeData.preset_type_id === id) {
        trades.push({ ...tradeData, id: tradeId })
      }
    }

    // Trades stats
    let totalTrades = trades.length
    let closedTrades = 0
    let openTrades = 0
    let winningTrades = 0
    let losingTrades = 0
    let totalPnl = 0
    let winSum = 0
    let lossSum = 0

    for (const t of trades) {
      const status = t.status
      if (status === "closed") {
        closedTrades++
      } else if (status === "open") {
        openTrades++
      }
      const profitLoss = parseFloat(t.profit_loss || "0")
      if (profitLoss > 0) {
        winningTrades++
        winSum += profitLoss
      } else if (profitLoss < 0) {
        losingTrades++
        lossSum += profitLoss // negative
      }
      if (status === "closed") {
        totalPnl += profitLoss
      }
    }

    const avgWin = winningTrades > 0 ? winSum / winningTrades : 0
    const avgLoss = losingTrades > 0 ? Math.abs(lossSum) / losingTrades : 0
    const winRate = closedTrades > 0 ? (winningTrades / closedTrades) * 100 : 0
    const profitFactor = (losingTrades > 0 && avgLoss > 0) ? (winningTrades * avgWin) / (losingTrades * avgLoss) : 0

    // Set performance
    const setPerformance = []
    // Consider only active links
    const activeLinks = links.filter(l => l.is_active === "1" || l.is_active === true)
    for (const link of activeLinks) {
      const setId = link.configuration_set_id
      // Get configuration set name
      const setData = await client.hgetall(`configuration_set:${setId}`)
      if (!setData || Object.keys(setData).length === 0) continue
      const setName = setData.name || ""
      // Count trades for this set and type
      const setTradeIds = trades.filter(t => t.configuration_set_id === setId)
      const tradesCount = setTradeIds.length
      let wins = 0, losses = 0, setPnl = 0, setWinSum = 0, setLossSum = 0
      for (const t of setTradeIds) {
        const profitLoss = parseFloat(t.profit_loss || "0")
        if (profitLoss > 0) {
          wins++
          setWinSum += profitLoss
        } else if (profitLoss < 0) {
          losses++
          setLossSum += profitLoss
        }
        if (t.status === "closed") setPnl += profitLoss
      }
      const setAvgWin = wins > 0 ? setWinSum / wins : 0
      const setAvgLoss = losses > 0 ? Math.abs(setLossSum) / losses : 0
      const setPF = (losses > 0 && setAvgLoss > 0) ? (wins * setAvgWin) / (losses * setAvgLoss) : 0
      const setWinRate = tradesCount > 0 ? (wins / tradesCount) * 100 : 0

      setPerformance.push({
        set_id: setId,
        set_name: setName,
        trades_count: tradesCount,
        wins,
        losses,
        total_pnl: setPnl,
        avg_win: setAvgWin,
        avg_loss: setAvgLoss,
        profit_factor: setPF,
        win_rate: setWinRate,
      })
    }

    // Sort by total_pnl DESC
    setPerformance.sort((a, b) => b.total_pnl - a.total_pnl)

    // Recent trades: sort trades by created_at desc, limit 20
    const sortedTrades = trades
      .map(t => ({
        ...t,
        parsed_created_at: new Date(t.created_at || 0).getTime()
      }))
      .filter(t => !isNaN(t.parsed_created_at))
      .sort((a, b) => b.parsed_created_at - a.parsed_created_at)
      .slice(0, 20)

    // Fetch config set and connection names for recent trades
    const recentTrades = await Promise.all(
      sortedTrades.map(async (t) => {
        const setId = t.configuration_set_id
        const connId = t.connection_id
        const [setData, connData] = await Promise.all([
          client.hgetall(`configuration_set:${setId}`),
          client.hgetall(`connection:${connId}`)
        ])
        return {
          ...t,
          set_name: setData?.name || "",
          connection_name: connData?.name || ""
        }
      })
    )

    // Performance over time (last 7 days)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const timeGroups = new Map<string, { trades: number; wins: number; pnl: number }>()
    for (const t of trades) {
      const created = new Date(t.created_at || 0).getTime()
      if (created < sevenDaysAgo) continue
      const dateKey = t.created_at?.split('T')[0] || ''
      if (!dateKey) continue
      const existing = timeGroups.get(dateKey) || { trades: 0, wins: 0, pnl: 0 }
      const profitLoss = parseFloat(t.profit_loss || "0")
      existing.trades++
      if (profitLoss > 0) existing.wins++
      existing.pnl += profitLoss
      timeGroups.set(dateKey, existing)
    }
    const performanceOverTime = Array.from(timeGroups.entries())
      .map(([date, data]) => ({
        date,
        trades: data.trades,
        wins: data.wins,
        pnl: data.pnl,
      }))
      .sort((a, b) => b.date.localeCompare(a.date)) // DESC by date

    return NextResponse.json({
      preset_type: presetType,
      summary: {
        total_sets: totalSets,
        active_sets: activeSets,
        total_trades: totalTrades,
        open_trades: openTrades,
        closed_trades: closedTrades,
        winning_trades: winningTrades,
        losing_trades: losingTrades,
        win_rate: winRate,
        profit_factor: profitFactor,
        total_pnl: totalPnl,
        avg_win: avgWin,
        avg_loss: avgLoss,
      },
      set_performance: setPerformance,
      recent_trades: recentTrades,
      performance_over_time: performanceOverTime,
    })
  } catch (error) {
    console.error("[v0] Failed to fetch preset type statistics:", error)
    return NextResponse.json({ error: "Failed to fetch statistics" }, { status: 500 })
  }
}