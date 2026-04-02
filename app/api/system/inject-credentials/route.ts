import { NextResponse } from "next/server"
import { initRedis, getRedisClient } from "@/lib/redis-db"

export const dynamic = "force-dynamic"

/**
 * POST /api/system/inject-credentials
 * 
 * Injects real API credentials from environment variables into base connections.
 * This endpoint should be called on startup or when credentials are updated.
 * 
 * Supported environment variables:
 * - BINGX_API_KEY, BINGX_API_SECRET - BingX credentials
 * - BYBIT_API_KEY, BYBIT_API_SECRET - Bybit credentials
 * - PIONEX_API_KEY, PIONEX_API_SECRET - Pionex credentials
 * - ORANGEX_API_KEY, ORANGEX_API_SECRET - OrangeX credentials
 */
export async function POST() {
  try {
    await initRedis()
    const client = getRedisClient()
    
    const results: Record<string, string> = {}
    
    // Check and inject BingX credentials
    const bingxApiKey = process.env.BINGX_API_KEY || ""
    const bingxApiSecret = process.env.BINGX_API_SECRET || ""
    if (bingxApiKey.length > 10 && bingxApiSecret.length > 10) {
      await client.hset("connection:bingx-x01", {
        api_key: bingxApiKey,
        api_secret: bingxApiSecret,
        is_active_assigned: "1",
        is_enabled: "1",
        is_main_enabled: "1",
        is_active: "1",
        connection_method: "library",
        updated_at: new Date().toISOString(),
      })
      results["bingx-x01"] = "Credentials injected successfully"
      console.log("[v0] [Credentials] BingX X01: Real credentials injected from environment")
    } else {
      results["bingx-x01"] = "No valid credentials in environment (BINGX_API_KEY, BINGX_API_SECRET)"
    }
    
    // Check and inject Bybit credentials
    const bybitApiKey = process.env.BYBIT_API_KEY || ""
    const bybitApiSecret = process.env.BYBIT_API_SECRET || ""
    if (bybitApiKey.length > 10 && bybitApiSecret.length > 10) {
      await client.hset("connection:bybit-x03", {
        api_key: bybitApiKey,
        api_secret: bybitApiSecret,
        is_active_assigned: "1",
        is_enabled: "1",
        is_main_enabled: "1",
        is_active: "1",
        connection_method: "library",
        updated_at: new Date().toISOString(),
      })
      results["bybit-x03"] = "Credentials injected successfully"
      console.log("[v0] [Credentials] Bybit X03: Real credentials injected from environment")
    } else {
      results["bybit-x03"] = "No valid credentials in environment (BYBIT_API_KEY, BYBIT_API_SECRET)"
    }
    
    // Check and inject Pionex credentials
    const pionexApiKey = process.env.PIONEX_API_KEY || ""
    const pionexApiSecret = process.env.PIONEX_API_SECRET || ""
    if (pionexApiKey.length > 10 && pionexApiSecret.length > 10) {
      await client.hset("connection:pionex-x01", {
        api_key: pionexApiKey,
        api_secret: pionexApiSecret,
        is_active_assigned: "1",
        is_enabled: "1",
        is_main_enabled: "1",
        is_active: "1",
        connection_method: "library",
        updated_at: new Date().toISOString(),
      })
      results["pionex-x01"] = "Credentials injected successfully"
      console.log("[v0] [Credentials] Pionex X01: Real credentials injected from environment")
    } else {
      results["pionex-x01"] = "No valid credentials in environment (PIONEX_API_KEY, PIONEX_API_SECRET)"
    }
    
    // Check and inject OrangeX credentials
    const orangexApiKey = process.env.ORANGEX_API_KEY || ""
    const orangexApiSecret = process.env.ORANGEX_API_SECRET || ""
    if (orangexApiKey.length > 10 && orangexApiSecret.length > 10) {
      await client.hset("connection:orangex-x01", {
        api_key: orangexApiKey,
        api_secret: orangexApiSecret,
        is_active_assigned: "1",
        is_enabled: "1",
        is_main_enabled: "1",
        is_active: "1",
        connection_method: "library",
        updated_at: new Date().toISOString(),
      })
      results["orangex-x01"] = "Credentials injected successfully"
      console.log("[v0] [Credentials] OrangeX X01: Real credentials injected from environment")
    } else {
      results["orangex-x01"] = "No valid credentials in environment (ORANGEX_API_KEY, ORANGEX_API_SECRET)"
    }
    
    // Count successful injections
    const successCount = Object.values(results).filter(r => r.includes("injected")).length
    
    return NextResponse.json({
      success: true,
      message: `Credentials injection complete: ${successCount}/4 exchanges configured`,
      results,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] [Credentials] Error injecting credentials:", error)
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
    
    // Check which credentials are available in environment
    const envStatus = {
      BINGX_API_KEY: !!(process.env.BINGX_API_KEY && process.env.BINGX_API_KEY.length > 10),
      BINGX_API_SECRET: !!(process.env.BINGX_API_SECRET && process.env.BINGX_API_SECRET.length > 10),
      BYBIT_API_KEY: !!(process.env.BYBIT_API_KEY && process.env.BYBIT_API_KEY.length > 10),
      BYBIT_API_SECRET: !!(process.env.BYBIT_API_SECRET && process.env.BYBIT_API_SECRET.length > 10),
      PIONEX_API_KEY: !!(process.env.PIONEX_API_KEY && process.env.PIONEX_API_KEY.length > 10),
      PIONEX_API_SECRET: !!(process.env.PIONEX_API_SECRET && process.env.PIONEX_API_SECRET.length > 10),
      ORANGEX_API_KEY: !!(process.env.ORANGEX_API_KEY && process.env.ORANGEX_API_KEY.length > 10),
      ORANGEX_API_SECRET: !!(process.env.ORANGEX_API_SECRET && process.env.ORANGEX_API_SECRET.length > 10),
    }
    
    // Check which connections have credentials in database
    const dbStatus: Record<string, boolean> = {}
    for (const connId of ["bingx-x01", "bybit-x03", "pionex-x01", "orangex-x01"]) {
      const conn = await client.hgetall(`connection:${connId}`)
      const hasKey = !!(conn?.api_key && conn.api_key.length > 10)
      const hasSecret = !!(conn?.api_secret && conn.api_secret.length > 10)
      dbStatus[connId] = hasKey && hasSecret
    }
    
    return NextResponse.json({
      success: true,
      environment: envStatus,
      database: dbStatus,
      availableInEnv: Object.entries(envStatus).filter(([_, v]) => v).map(([k]) => k),
      configuredInDb: Object.entries(dbStatus).filter(([_, v]) => v).map(([k]) => k),
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
