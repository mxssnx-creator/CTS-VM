import { NextResponse } from "next/server"
import { initializeTradeEngineAutoStart } from "@/lib/trade-engine-auto-start"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"
import { seedDefaultPresetTypes } from "@/lib/preset-types-seed"
import { initRedis, getAllConnections, createConnection, updateConnection } from "@/lib/redis-db"
import { initializeConsoleLogger } from "@/lib/console-logger"
import { CONNECTION_PREDEFINITIONS } from "@/lib/connection-predefinitions"
import { runMigrations } from "@/lib/redis-migrations"

// Initialize console logger on server startup
initializeConsoleLogger()

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/init
 * Initialize trade engine, system services, and default data on startup
 */
export async function GET() {
  try {
    console.log("[v0] [Init] Initializing all systems...")
    
    // Initialize Redis connection
    await initRedis()
    console.log("[v0] [Init] Redis initialized")
    
    // Run all pending migrations FIRST before anything else
    try {
      const migrationResult = await runMigrations()
      console.log(`[v0] [Init] Migrations: ${migrationResult.message} (v${migrationResult.version})`)
    } catch (migrationError) {
      console.error("[v0] [Init] Migration error (non-fatal):", migrationError)
    }
    
    // Seed default preset types
    await seedDefaultPresetTypes()
    console.log("[v0] [Init] Preset types seeded")
    
    // Get existing connections
    const connections = await getAllConnections()
    console.log("[v0] [Init] Found", connections.length, "existing connections")
    
    // Dashboard auto-insert exchanges - ONLY these appear on dashboard by default
    const DASHBOARD_AUTO_INSERT = ["bybit", "bingx"]
    
    // Seed all predefined connections if they don't exist
    const createdConnections = []
    
    for (const predefined of CONNECTION_PREDEFINITIONS) {
      const exists = connections.some(c => c.id === predefined.id)
      const shouldDashboardInsert = DASHBOARD_AUTO_INSERT.includes(predefined.exchange)
      
      if (!exists) {
        try {
          await createConnection({
            id: predefined.id,
            name: predefined.name,
            exchange: predefined.exchange,
            api_type: predefined.apiType,
            connection_method: predefined.connectionMethod,
            connection_library: predefined.connectionLibrary,
            margin_type: predefined.marginType,
            position_mode: predefined.positionMode,
            is_testnet: false,
            // Settings states - all start disabled, user enables when they add API keys
            is_enabled: "0",
            // Active states - INDEPENDENT from Settings
            is_active_assigned: shouldDashboardInsert ? "1" : "0", // Only bybit/bingx active-insertable
            is_main_enabled: "0", // Always disabled by default
            is_predefined: true,
            api_key: predefined.apiKey || "",
            api_secret: predefined.apiSecret || "",
          })
          
          if (shouldDashboardInsert) {
            createdConnections.push({
              id: predefined.id,
              name: predefined.name,
              exchange: predefined.exchange,
            })
          }
        } catch (error) {
          console.error(`[v0] [Init] Failed to create ${predefined.id}:`, error)
        }
      }
    }
    
    console.log(`[v0] [Init] Created ${createdConnections.length} active connections (bybit, bingx)`)
    
    // MIGRATION: Ensure bybit and bingx have is_active_assigned set (one-time migration)
    const allConns = await getAllConnections()
    let migratedCount = 0
    for (const conn of allConns) {
      const exchange = (conn.exchange || "").toLowerCase().trim()
      const shouldBeActive = DASHBOARD_AUTO_INSERT.includes(exchange)
      
      // Only migrate if is_active_assigned is undefined (not yet set)
      if (shouldBeActive && conn.is_active_assigned === undefined) {
        await updateConnection(conn.id, {
          ...conn,
          is_active_assigned: "1", // Add as active-insertable
          is_main_enabled: "0",   // But disabled by default
          updated_at: new Date().toISOString(),
        })
        migratedCount++
      }
    }
    if (migratedCount > 0) {
      console.log(`[v0] [Init] Migrated ${migratedCount} connections to dashboard (bybit, bingx)`)
    }
    
    // Trigger initial auto-test for all base connections (non-blocking)
    fetch(new URL("/api/settings/connections/auto-test", process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000").toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "init" }),
    }).catch(() => {
      // Non-blocking: auto-test will run on next scheduled interval if this fails
    })
    
    // Initialize trade engine auto-start
    try {
      await initializeTradeEngineAutoStart()
      console.log("[v0] [Init] Trade engine auto-start initialized")
    } catch (error) {
      console.warn("[v0] [Init] Failed to initialize trade engine auto-start:", error)
    }
    
    return NextResponse.json({
      success: true,
      message: "System initialized",
      connectionsCreated: createdConnections.length,
      totalConnections: connections.length + createdConnections.length,
      migratedCount: migratedCount,
    })
  } catch (error) {
    console.error("[v0] [Init] Initialization error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Initialization failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
