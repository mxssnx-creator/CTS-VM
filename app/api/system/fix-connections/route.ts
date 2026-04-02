import { NextResponse } from "next/server"
import { initRedis, getRedisClient } from "@/lib/redis-db"

export const dynamic = "force-dynamic"

/**
 * POST /api/system/fix-connections
 * 
 * Fixes all 4 base connections (bybit, bingx, pionex, orangex) to be:
 * - is_active_assigned = 1 (in Active panel)
 * - is_enabled = 1 (enabled)
 * - is_main_enabled = 1 (dashboard toggle on)
 * - connection_method = library (use native SDK)
 * 
 * Also injects credentials from environment variables if available.
 */
export async function POST() {
  try {
    await initRedis()
    const client = getRedisClient()
    
    const baseConnections = [
      { id: "bybit-x03", envKey: "BYBIT_API_KEY", envSecret: "BYBIT_API_SECRET" },
      { id: "bingx-x01", envKey: "BINGX_API_KEY", envSecret: "BINGX_API_SECRET" },
      { id: "pionex-x01", envKey: "PIONEX_API_KEY", envSecret: "PIONEX_API_SECRET" },
      { id: "orangex-x01", envKey: "ORANGEX_API_KEY", envSecret: "ORANGEX_API_SECRET" },
    ]
    
    const results: Record<string, any> = {}
    
    for (const conn of baseConnections) {
      // Check if connection exists
      const exists = await client.sismember("connections", conn.id)
      
      // Build update data
      const updateData: Record<string, string> = {
        is_assigned: "1",
        is_enabled: "1",
        is_active_assigned: "1",
        is_main_enabled: "1",
        is_active: "1",
        is_predefined: "1",
        connection_method: "library",
        updated_at: new Date().toISOString(),
      }
      
      // Check for credentials in environment
      const apiKey = process.env[conn.envKey] || ""
      const apiSecret = process.env[conn.envSecret] || ""
      const hasCredentials = apiKey.length > 10 && apiSecret.length > 10
      
      if (hasCredentials) {
        updateData.api_key = apiKey
        updateData.api_secret = apiSecret
      }
      
      // Apply update
      if (exists) {
        await client.hset(`connection:${conn.id}`, updateData)
        results[conn.id] = {
          status: "updated",
          active_inserted: true,
          enabled: true,
          dashboard_enabled: true,
          has_credentials: hasCredentials,
        }
        console.log(`[v0] [FixConnections] ${conn.id}: Updated - active_inserted=1, credentials=${hasCredentials}`)
      } else {
        results[conn.id] = {
          status: "not_found",
          message: "Connection does not exist in database. Run migrations first.",
        }
        console.log(`[v0] [FixConnections] ${conn.id}: NOT FOUND - skipped`)
      }
    }
    
    // Count successful updates
    const updatedCount = Object.values(results).filter((r: any) => r.status === "updated").length
    const withCredentials = Object.values(results).filter((r: any) => r.has_credentials).length
    
    return NextResponse.json({
      success: true,
      message: `Fixed ${updatedCount}/4 base connections, ${withCredentials} with credentials`,
      connections: results,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] [FixConnections] Error:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    await initRedis()
    const client = getRedisClient()
    
    const baseIds = ["bybit-x03", "bingx-x01", "pionex-x01", "orangex-x01"]
    const status: Record<string, any> = {}
    
    for (const id of baseIds) {
      const conn = await client.hgetall(`connection:${id}`)
      if (conn && Object.keys(conn).length > 0) {
        status[id] = {
          exists: true,
          name: conn.name || id,
          exchange: conn.exchange,
          is_active_assigned: conn.is_active_assigned,
          is_enabled: conn.is_enabled,
          is_main_enabled: conn.is_main_enabled,
          has_credentials: !!(conn.api_key && conn.api_key.length > 10 && conn.api_secret && conn.api_secret.length > 10),
          connection_method: conn.connection_method || "rest",
        }
      } else {
        status[id] = { exists: false }
      }
    }
    
    return NextResponse.json({
      success: true,
      baseConnections: status,
      summary: {
        total: baseIds.length,
        existing: Object.values(status).filter((s: any) => s.exists).length,
        activeInserted: Object.values(status).filter((s: any) => s.is_active_assigned === "1").length,
        withCredentials: Object.values(status).filter((s: any) => s.has_credentials).length,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
