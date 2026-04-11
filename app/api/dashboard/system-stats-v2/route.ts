import { NextResponse } from "next/server"
import { initRedis, getAllConnections, getRedisClient, getRedisRequestsPerSecond } from "@/lib/redis-db"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

const BASE_EXCHANGES_V2 = ["bybit", "bingx", "pionex", "orangex"]

function isBaseExchangeV2(c: any): boolean {
  return BASE_EXCHANGES_V2.includes((c?.exchange || "").toLowerCase().trim())
}

// v2 rebuilt inline - identical to v3
export async function GET() {
  try {
    await initRedis()
    const client = getRedisClient()
    const allConnections = await getAllConnections()

    const baseConnections = allConnections.filter(isBaseExchangeV2)
    const enabledBase = baseConnections.filter((c: any) => {
      const e = c.is_enabled
      return e === true || e === "1" || e === "true" || e === undefined || e === null
    })
    const workingBase = baseConnections.filter((c: any) => c.last_test_status === "success")

    const activeConnections = allConnections.filter((c: any) => {
      const d = c.is_main_enabled
      return d === true || d === "1" || d === "true"
    })

    let liveTradeCount = 0
    let presetTradeCount = 0
    for (const conn of activeConnections) {
      if (String((conn as any).live_trade_enabled) === "1" || (conn as any).live_trade_enabled === true || String(conn.is_live_trade) === "1" || conn.is_live_trade === true) liveTradeCount++
      if (String((conn as any).preset_trade_enabled) === "1" || (conn as any).preset_trade_enabled === true || String(conn.is_preset_trade) === "1" || conn.is_preset_trade === true) presetTradeCount++
    }

    const engineHash = await client.hgetall("trade_engine:global") || {}
    const globalStatus = engineHash.status || "stopped"
    const mainStatus = globalStatus === "running" && liveTradeCount > 0 ? "running" : liveTradeCount > 0 ? "ready" : "stopped"
    const presetStatus = globalStatus === "running" && presetTradeCount > 0 ? "running" : presetTradeCount > 0 ? "ready" : "stopped"

    const exchangeStatus =
      baseConnections.length === 0 ? "down" :
      workingBase.length === 0 ? "partial" :
      workingBase.length < baseConnections.length / 2 ? "partial" : "healthy"

    // Get real live tracking data
    const strategiesBase = await client.hgetall("strategies:base") || {}
    const strategiesMain = await client.hgetall("strategies:main") || {}
    const strategiesReal = await client.hgetall("strategies:real") || {}
    const indicationsStats = await client.hgetall("indications:stats") || {}
    const prehistoricStats = await client.hgetall("prehistoric:status") || {}
    const liveTradesStats = await client.hgetall("trades:stats") || {}

    // Calculate real live values
    const totalKeys = await client.dbSize()
    const lastHourTrades = parseInt(liveTradesStats.last_hour || "0")
    
    const baseEvaluated = parseInt(strategiesBase.evaluated_sets || "0")
    const baseTotal = parseInt(strategiesBase.total_sets || "0")
    const mainEvaluated = parseInt(strategiesMain.evaluated_sets || "0")
    const mainTotal = parseInt(strategiesMain.total_sets || "0")
    const realEvaluated = parseInt(strategiesReal.evaluated_sets || "0")
    const realTotal = parseInt(strategiesReal.total_sets || "0")

    return NextResponse.json({
      success: true,
      tradeEngines: {
        globalStatus,
        mainStatus,
        mainCount: liveTradeCount,
        mainTotal: activeConnections.length,
        presetStatus,
        presetCount: presetTradeCount,
        presetTotal: activeConnections.length,
        totalEnabled: liveTradeCount + presetTradeCount,
      },
      database: {
        status: "healthy",
        requestsPerSecond: getRedisRequestsPerSecond(),
        totalKeys,
      },
      exchangeConnections: {
        total: baseConnections.length,
        enabled: enabledBase.length,
        working: workingBase.length,
        status: exchangeStatus,
      },
      activeConnections: {
        total: baseConnections.length,
        active: activeConnections.length,
        liveTrade: liveTradeCount,
        presetTrade: presetTradeCount,
      },
      liveTrades: {
        lastHour: lastHourTrades,
        topConnections: Object.entries(liveTradesStats)
          .filter(([k]) => k.startsWith("conn_"))
          .map(([k, v]) => ({ name: k.replace("conn_", ""), count: parseInt(v) }))
          .sort((a,b) => b.count - a.count)
          .slice(0, 3),
      },
      indications: {
        total: parseInt(indicationsStats.total || "0"),
        active: parseInt(indicationsStats.active || "0"),
        types: Object.fromEntries(
          Object.entries(indicationsStats)
            .filter(([k]) => k.startsWith("type_"))
            .map(([k, v]) => [k.replace("type_", ""), parseInt(v)])
        ),
        last5min: parseInt(indicationsStats.last_5min || "0"),
        last60min: parseInt(indicationsStats.last_60min || "0"),
      },
      strategies: {
        base: {
          totalSets: baseTotal,
          evaluatedSets: baseEvaluated,
          avgPositions: parseFloat(strategiesBase.avg_positions || "0"),
          avgProfitFactor: parseFloat(strategiesBase.avg_profit_factor || "0"),
          avgProcessingTime: parseInt(strategiesBase.avg_processing_time || "0"),
          last5min: parseInt(strategiesBase.last_5min || "0"),
          last60min: parseInt(strategiesBase.last_60min || "0"),
        },
        main: {
          totalSets: mainTotal,
          evaluatedSets: mainEvaluated,
          percentageOfBase: baseTotal > 0 ? (mainTotal / baseTotal * 100) : 0,
          avgPositions: parseFloat(strategiesMain.avg_positions || "0"),
          avgProfitFactor: parseFloat(strategiesMain.avg_profit_factor || "0"),
          avgProcessingTime: parseInt(strategiesMain.avg_processing_time || "0"),
          last5min: parseInt(strategiesMain.last_5min || "0"),
          last60min: parseInt(strategiesMain.last_60min || "0"),
        },
        real: {
          totalSets: realTotal,
          evaluatedSets: realEvaluated,
          percentageOfMain: mainTotal > 0 ? (realTotal / mainTotal * 100) : 0,
          avgPositions: parseFloat(strategiesReal.avg_positions || "0"),
          avgProfitFactor: parseFloat(strategiesReal.avg_profit_factor || "0"),
          avgProcessingTime: parseInt(strategiesReal.avg_processing_time || "0"),
          last5min: parseInt(strategiesReal.last_5min || "0"),
          last60min: parseInt(strategiesReal.last_60min || "0"),
        },
      },
      prehistoric: {
        processed: parseInt(prehistoricStats.processed || "0"),
        remaining: parseInt(prehistoricStats.remaining || "0"),
        progress: parseFloat(prehistoricStats.progress || "0"),
        eta: prehistoricStats.eta || "0m",
      },
    })
  } catch (error) {
    console.error("[v0] [System Stats v2-rebuilt] ERROR:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to fetch system stats" },
      { status: 500 }
    )
  }
}
