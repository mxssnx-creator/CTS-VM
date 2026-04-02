import { NextResponse } from "next/server"
import { getRedisClient } from "@/lib/redis-db"

interface PositionData {
  id: string
  connectionId?: string
  pnl: number
  timestamp: Date
  status: string
}

// Helper to compute P&L for a position based on its data
function computePnl(pos: any): number {
  const entryPrice = parseFloat(pos.entry_price || pos.entryPrice || "0")
  const quantity = parseFloat(pos.quantity || "0")
  const side = pos.side || pos.direction || "long"

  // If closed and realized_pnl exists, use that
  if (pos.status !== "open" && pos.status !== "active" && pos.realized_pnl) {
    return parseFloat(pos.realized_pnl)
  }

  // For open positions, use current price
  const currentPrice = parseFloat(pos.current_price || pos.currentPrice || pos.entry_price || "0")
  const priceDiff = side === "long" ? currentPrice - entryPrice : entryPrice - currentPrice
  return priceDiff * quantity
}

// Helper to get timestamp from position
function getTimestamp(pos: any): Date | null {
  // Try created_at first, then opened_at
  const ts = pos.created_at || pos.opened_at || pos.calculated_at
  if (!ts) return null
  return new Date(ts)
}

// Fetch all pseudo positions from both storage patterns
async function getAllPseudoPositions(): Promise<PositionData[]> {
  const client = getRedisClient()
  const positions: PositionData[] = []

  // 1. Non-preset positions: per-connection sets
  const connectionIds = await client.smembers("connections")
  for (const connId of connectionIds) {
    const posIds = await client.smembers(`pseudo_positions:${connId}`)
    for (const posId of posIds) {
      const key = `pseudo_position:${connId}:${posId}`
      const data = await client.hgetall(key)
      if (data && Object.keys(data).length > 0) {
        const pnl = computePnl(data)
        const ts = getTimestamp(data)
        if (ts) {
          positions.push({
            id: posId,
            connectionId: connId,
            pnl,
            timestamp: ts,
            status: data.status,
          })
        }
      }
    }
  }

  // 2. Preset positions: global set
  const presetPosIds = await client.smembers("preset_pseudo_positions")
  for (const posId of presetPosIds) {
    const key = `preset_pseudo_position:${posId}`
    const data = await client.hgetall(key)
    if (data && Object.keys(data).length > 0) {
      const pnl = computePnl(data)
      const ts = getTimestamp(data)
      if (ts) {
        positions.push({
          id: posId,
          connectionId: data.connection_id,
          pnl,
          timestamp: ts,
          status: data.status,
        })
      }
    }
  }

  return positions
}

// Compute stats for a given set of positions
function computeStats(positions: PositionData[]) {
  const total = positions.length
  if (total === 0) {
    return { total: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0, totalProfit: 0 }
  }

  let wins = 0
  let losses = 0
  let sumPos = 0
  let sumNeg = 0
  let totalProfit = 0

  for (const p of positions) {
    const pnlVal = p.pnl
    totalProfit += pnlVal
    if (pnlVal > 0) {
      wins++
      sumPos += pnlVal
    } else if (pnlVal < 0) {
      losses++
      sumNeg += Math.abs(pnlVal)
    }
  }

  const winRate = total > 0 ? wins / total : 0
  const profitFactor = sumNeg > 0 ? sumPos / sumNeg : 0

  return { total, wins, losses, winRate, profitFactor, totalProfit }
}

export async function GET() {
  try {
    console.log("[v0] Fetching detailed trading statistics")
    const allPositions = await getAllPseudoPositions()

    // Sort by timestamp descending (most recent first)
    allPositions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    // Last 250
    const last250 = computeStats(allPositions.slice(0, 250))
    // Last 50
    const last50 = computeStats(allPositions.slice(0, 50))

    // Last 32 hours
    const cutoff32h = new Date(Date.now() - 32 * 60 * 60 * 1000)
    const last32hPositions = allPositions.filter(p => p.timestamp >= cutoff32h)
    const last32h = computeStats(last32hPositions)
    // Note: last32h stats only include total, totalProfit, profitFactor (ignore wins/losses per original)
    // Original query returned total, totalProfit, profitFactor

    return NextResponse.json({
      last250: {
        total: last250.total,
        wins: last250.wins,
        losses: last250.losses,
        winRate: last250.winRate,
        profitFactor: last250.profitFactor,
        totalProfit: last250.totalProfit,
      },
      last50: {
        total: last50.total,
        wins: last50.wins,
        losses: last50.losses,
        winRate: last50.winRate,
        profitFactor: last50.profitFactor,
        totalProfit: last50.totalProfit,
      },
      last32h: {
        total: last32h.total,
        totalProfit: last32h.totalProfit,
        profitFactor: last32h.profitFactor,
      },
    })
  } catch (error) {
    console.error("[v0] Failed to fetch stats:", error)
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 })
  }
}
