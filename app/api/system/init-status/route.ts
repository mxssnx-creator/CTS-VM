import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

/**
 * GET /api/system/init-status
 * Returns the current system initialization status
 * Used by frontend to determine if migrations have completed and system is ready
 */
export async function GET(request: NextRequest) {
  try {
    const { initRedis, isRedisConnected, getRedisStats, getAllConnections } = await import("@/lib/redis-db")
    const { getMigrationStatus } = await import("@/lib/redis-migrations")

    // Try to connect to Redis
    await initRedis()
    const connected = await isRedisConnected()

    if (!connected) {
      return NextResponse.json(
        {
          status: "error",
          initialized: false,
          message: "Redis not connected",
          database: "redis",
          ready: false,
          timestamp: new Date().toISOString(),
        },
        { status: 503 }
      )
    }

    // Get migration status
    const migrationStatus = await getMigrationStatus()
    const stats = await getRedisStats()
    
    // AUTO-INJECT: Check for credentials in environment and inject them into connections
    // This ensures credentials are available even if migrations ran before env vars were set
    const bingxKey = process.env.BINGX_API_KEY || ""
    const bingxSecret = process.env.BINGX_API_SECRET || ""
    if (bingxKey.length > 10 && bingxSecret.length > 10) {
      const { getRedisClient } = await import("@/lib/redis-db")
      const redisClient = getRedisClient()
      const existingConn = await redisClient.hgetall("connection:bingx-x01")
      // Only update if credentials are missing or different
      if (!existingConn?.api_key || existingConn.api_key.length < 10 || existingConn.api_key !== bingxKey) {
        await redisClient.hset("connection:bingx-x01", {
          api_key: bingxKey,
          api_secret: bingxSecret,
          is_active_assigned: "1",
          is_enabled: "1",
          is_main_enabled: "1",
          connection_method: "library",
          updated_at: new Date().toISOString(),
        })
        console.log("[v0] [Init] Auto-injected BingX credentials from environment")
      }
    }
    
    // Get actual key count directly (most reliable)
    const { getRedisClient } = await import("@/lib/redis-db")
    const client = getRedisClient()
    const allKeys = await client.keys("*").catch(() => [])
    const actualKeyCount = Array.isArray(allKeys) ? allKeys.length : 0

    // Get connection count
    let connectionsCount = 0
    let enabledConnectionsCount = 0
    
    try {
      const connections = await getAllConnections()
      connectionsCount = connections.length
      enabledConnectionsCount = connections.filter((c: any) => c.is_enabled !== false).length
    } catch (error) {
      console.warn("[v0] Failed to get connections count:", error)
    }

    const initialized =
      connected && migrationStatus.currentVersion === migrationStatus.latestVersion
    const ready = initialized && connectionsCount > 0

    return NextResponse.json(
      {
        status: initialized ? "ready" : "initializing",
        initialized,
        ready,
        message: initialized ? "System ready" : "Migrations in progress",
        database: {
          type: "redis",
          connected,
        },
        migrations: {
          current_version: migrationStatus.currentVersion,
          latest_version: migrationStatus.latestVersion,
          up_to_date: migrationStatus.currentVersion === migrationStatus.latestVersion,
        },
        connections: {
          total: connectionsCount,
          enabled: enabledConnectionsCount,
        },
        statistics: {
          total_keys: actualKeyCount || stats.keyCount || stats.total_keys || stats.dbSize || 0,
          memory_used: stats.memory_used || "N/A",
          uptime_seconds: stats.uptime_seconds || stats.uptimeSeconds || 0,
        },
        system: {
          version: "3.2",
          environment: process.env.NODE_ENV || "development",
          timestamp: new Date().toISOString(),
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error("[v0] Init status check failed:", error)

    return NextResponse.json(
      {
        status: "error",
        initialized: false,
        ready: false,
        message: error instanceof Error ? error.message : "Unknown error",
        database: {
          type: "redis",
          connected: false,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
