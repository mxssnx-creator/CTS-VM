import { NextResponse } from "next/server"
import { getRedisClient, initRedis } from "@/lib/redis-db"

export async function GET() {
  try {
    await initRedis()
    const client = getRedisClient()

    // Count active connections (is_enabled = 1)
    const connIds = await client.smembers("connections") || []
    let activeConnections = 0
    for (const id of connIds) {
      const conn = await client.hgetall(`connection:${id}`)
      if (conn && (conn.is_enabled === "1" || conn.is_enabled === true)) {
        activeConnections++
      }
    }

    // Count recent indications (last 5 minutes) from statistics
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    let recentIndications = 0
    for (const connId of connIds) {
      const key = `statistics:indications:${connId}`
      const entries = await client.lrange(key, 0, -1)
      for (const entryStr of entries) {
        try {
          const entry = JSON.parse(entryStr)
          if (entry.calculated_at && entry.calculated_at >= fiveMinutesAgo) {
            recentIndications++
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    // Count active positions (status = 'active')
    const posIds = await client.smembers("positions") || []
    let activePositions = 0
    for (const pid of posIds) {
      const pos = await client.hgetall(`position:${pid}`)
      if (pos && (pos.status === "active" || pos.status === "1" || pos.is_active === "1")) {
        activePositions++
      }
    }

    const modules = [
      {
        name: "Live Trading Engine",
        status: activeConnections > 0 ? "active" : "inactive",
        health: activeConnections > 0 ? 98 : 0,
        last_update: "2 min ago",
      },
      {
        name: "Indication Generator",
        status: recentIndications > 0 ? "active" : "inactive",
        health: recentIndications > 0 ? 95 : 0,
        last_update: "1 min ago",
      },
      {
        name: "Strategy Optimizer",
        status: "active",
        health: 92,
        last_update: "3 min ago",
      },
      {
        name: "Position Manager",
        status: activePositions > 0 ? "active" : "inactive",
        health: activePositions > 0 ? 97 : 0,
        last_update: "1 min ago",
      },
      {
        name: "Analytics Engine",
        status: "active",
        health: 89,
        last_update: "5 min ago",
      },
      {
        name: "Database Sync",
        status: "active",
        health: 94,
        last_update: "2 min ago",
      },
      {
        name: "API Gateway",
        status: "active",
        health: 96,
        last_update: "1 min ago",
      },
      {
        name: "WebSocket Server",
        status: "active",
        health: 93,
        last_update: "2 min ago",
      },
    ]

    return NextResponse.json({
      success: true,
      data: modules,
    })
  } catch (error) {
    console.error("[v0] Error fetching module status:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch module status",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
