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
      if (conn.live_trade_enabled === true || conn.live_trade_enabled === "1" || conn.is_live_trade === true || conn.is_live_trade === "1") liveTradeCount++
      if (conn.preset_trade_enabled === true || conn.preset_trade_enabled === "1" || conn.is_preset_trade === true || conn.is_preset_trade === "1") presetTradeCount++
    }

    const engineHash = await client.hgetall("trade_engine:global") || {}
    const globalStatus = engineHash.status || "stopped"
    const mainStatus = globalStatus === "running" && liveTradeCount > 0 ? "running" : liveTradeCount > 0 ? "ready" : "stopped"
    const presetStatus = globalStatus === "running" && presetTradeCount > 0 ? "running" : presetTradeCount > 0 ? "ready" : "stopped"

    const exchangeStatus =
      baseConnections.length === 0 ? "down" :
      workingBase.length === 0 ? "partial" :
      workingBase.length < baseConnections.length / 2 ? "partial" : "healthy"

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
        lastHour: 0,
        topConnections: [],
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
