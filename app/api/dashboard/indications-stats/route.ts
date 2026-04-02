import { NextResponse } from "next/server"
import { initRedis, getAllConnections, getRedisClient } from "@/lib/redis-db"
import { SystemLogger } from "@/lib/system-logger"

export async function GET() {
  try {
    console.log("[v0] [IndicationsStats] Fetching indications statistics")
    await initRedis()
    const client = getRedisClient()

    // Get indications from Redis keys: indications:{connectionId}:{symbol}:{type}
    const indicationKeys = await client.keys("indications:*")
    console.log(`[v0] [IndicationsStats] Found ${indicationKeys.length} indication keys`)
    
    const indicationStats = {
      direction: { count: 0, avgSignalStrength: 0, lastTrigger: null, profitFactor: 0, signals: [] as any[] },
      move: { count: 0, avgSignalStrength: 0, lastTrigger: null, profitFactor: 0, signals: [] as any[] },
      active: { count: 0, avgSignalStrength: 0, lastTrigger: null, profitFactor: 0, signals: [] as any[] },
      optimal: { count: 0, avgSignalStrength: 0, lastTrigger: null, profitFactor: 0, signals: [] as any[] },
    }

    // Fetch all indications
    for (const key of indicationKeys) {
      try {
        const indication = await client.get(key)
        if (!indication) continue

        const data = JSON.parse(indication)
        const type = data.type as "direction" | "move" | "active" | "optimal"

        if (indicationStats[type]) {
          indicationStats[type].signals.push(data)
          indicationStats[type].count++

          // Track latest trigger
          if (!indicationStats[type].lastTrigger || new Date(data.timestamp) > new Date(indicationStats[type].lastTrigger)) {
            indicationStats[type].lastTrigger = data.timestamp
          }
        }
      } catch (parseError) {
        console.warn(`[v0] [IndicationsStats] Failed to parse indication ${key}:`, parseError)
        continue
      }
    }

    console.log(`[v0] [IndicationsStats] Indications breakdown - direction: ${indicationStats.direction.count}, move: ${indicationStats.move.count}, active: ${indicationStats.active.count}, optimal: ${indicationStats.optimal.count}`)

    // Calculate aggregates for each indication type
    Object.keys(indicationStats).forEach((type) => {
      const stats = indicationStats[type as "direction" | "move" | "active" | "optimal"]
      if (stats.signals.length > 0) {
        const avgSignalStrength = stats.signals.reduce((sum: number, s: any) => sum + (s.signal_strength || 0), 0) / stats.signals.length
        const avgProfitFactor = stats.signals.reduce((sum: number, s: any) => sum + (s.profit_factor || 1), 0) / stats.signals.length
        
        stats.avgSignalStrength = avgSignalStrength
        stats.profitFactor = avgProfitFactor
      }
      
      // Remove the signals array from response
      delete (stats as any).signals
    })

    await SystemLogger.logToDatabase({
      timestamp: new Date().toISOString(),
      level: "info",
      category: "indications_stats",
      message: `Indications fetched: direction=${indicationStats.direction.count}, move=${indicationStats.move.count}, active=${indicationStats.active.count}, optimal=${indicationStats.optimal.count}`,
      metadata: {
        direction: indicationStats.direction.count,
        move: indicationStats.move.count,
        active: indicationStats.active.count,
        optimal: indicationStats.optimal.count,
      },
    })

    return NextResponse.json({
      success: true,
      indications: indicationStats,
    })
  } catch (error) {
    console.error("[v0] [IndicationsStats] Failed to fetch indications stats:", error)
    await SystemLogger.logError("indications_stats", error, { operation: "GET /api/dashboard/indications-stats" })
    return NextResponse.json({
      success: false,
      error: "Failed to fetch indications stats",
      indications: {
        direction: { count: 0, avgSignalStrength: 0, lastTrigger: null, profitFactor: 0 },
        move: { count: 0, avgSignalStrength: 0, lastTrigger: null, profitFactor: 0 },
        active: { count: 0, avgSignalStrength: 0, lastTrigger: null, profitFactor: 0 },
        optimal: { count: 0, avgSignalStrength: 0, lastTrigger: null, profitFactor: 0 },
      },
    })
  }
}
