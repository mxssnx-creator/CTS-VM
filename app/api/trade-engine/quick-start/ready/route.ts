import { NextResponse } from "next/server"
import { initRedis, getAllConnections } from "@/lib/redis-db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/trade-engine/quick-start/ready
 * Returns whether the system is ready for quickstart
 * Checks for at least one connection that can be used
 */
export async function GET() {
  try {
    await initRedis()
    const allConnections = await getAllConnections()

    // Check for connections with credentials (highest priority)
    const connectionsWithCredentials = allConnections.filter((c: any) => {
      const exch = (c.exchange || "").toLowerCase()
      const hasCredentials = !!(c.api_key && c.api_secret && c.api_key.length >= 10 && c.api_secret.length >= 10)
      const isBase = exch === "bingx" || exch === "bybit" || exch === "binance" || exch === "okx"
      return isBase && hasCredentials
    })

    // Check for base connections that are inserted (even without credentials)
    const baseConnections = allConnections.filter((c: any) => {
      const exch = (c.exchange || "").toLowerCase()
      const isBaseInserted = c.is_active_assigned === "1" || c.is_active_assigned === true ||
                            c.is_main_assigned === "1" || c.is_main_assigned === true
      const isBase = exch === "bingx" || exch === "bybit" || exch === "binance" || exch === "okx"
      return isBase && isBaseInserted
    })

    const isReady = connectionsWithCredentials.length > 0 || baseConnections.length > 0
    
    return NextResponse.json({
      ready: isReady,
      hasCredentials: connectionsWithCredentials.length > 0,
      connectionsWithCredentials: connectionsWithCredentials.map((c: any) => ({
        id: c.id,
        name: c.name,
        exchange: c.exchange,
      })),
      baseConnections: baseConnections.map((c: any) => ({
        id: c.id,
        name: c.name,
        exchange: c.exchange,
        hasCredentials: !!(c.api_key && c.api_secret && c.api_key.length >= 10),
      })),
      totalConnections: allConnections.length,
      message: isReady
        ? "System is ready for quickstart"
        : "No suitable connections found. Add BingX/Bybit to Active panel in Dashboard first.",
    })
  } catch (error) {
    console.error("[v0] [QuickStartReady] Error:", error)
    return NextResponse.json(
      {
        ready: false,
        error: "Failed to check quickstart readiness",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
