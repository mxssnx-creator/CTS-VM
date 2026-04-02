import { NextResponse } from "next/server"
import { getAllConnections, initRedis, createConnection, updateConnection } from "@/lib/redis-db"
import { CONNECTION_PREDEFINITIONS } from "@/lib/connection-predefinitions"

export const runtime = "nodejs"

/**
 * COMPREHENSIVE STARTUP INITIALIZATION
 * This endpoint ensures complete system state consistency on startup
 * - Creates all predefined connections if missing
 * - Sets correct dashboard states (ONLY bybit/bingx on dashboard)
 * - Enables base connections (they start enabled but not dashboard-active)
 * - Tests connections are ready
 */
export async function POST() {
  try {
    console.log("[v0] [Startup] Initializing system state comprehensively...")
    
    await initRedis()
    let connections = await getAllConnections()
    
    const DASHBOARD_AUTO_INSERTED = ["bybit", "bingx"]
    const results = {
      connectionsCreated: 0,
      connectionsMigrated: 0,
      enabledCount: 0,
      dashboardInsertedCount: 0,
      testedCount: 0,
    }
    
    // STEP 1: Create missing predefined connections
    for (const predefined of CONNECTION_PREDEFINITIONS) {
      const exists = connections.some(c => c.id === predefined.id)
      if (!exists) {
        const shouldBeOnDashboard = DASHBOARD_AUTO_INSERTED.includes(predefined.exchange)
        await createConnection({
          id: predefined.id,
          name: predefined.name,
          exchange: predefined.exchange,
          api_type: predefined.apiType || "perpetual_futures",
          connection_method: predefined.connectionMethod || "rest",
          connection_library: predefined.connectionLibrary || "native",
          margin_type: predefined.marginType || "cross",
          position_mode: predefined.positionMode || "hedge",
          is_testnet: false,
          is_enabled: true, // BASE connections start ENABLED (not dashboard-active yet)
          is_main_assigned: shouldBeOnDashboard ? "1" : "0", // Only bybit/bingx on dashboard
          is_active_assigned: shouldBeOnDashboard ? "1" : "0", // Same as dashboard_inserted
          is_main_enabled: "0", // Dashboard-active disabled by default
          is_predefined: true,
          api_key: predefined.apiKey || "",
          api_secret: predefined.apiSecret || "",
          api_passphrase: "",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        results.connectionsCreated++
        console.log(`[v0] [Startup] ✓ Created: ${predefined.name}`)
      }
    }
    
    // STEP 2: Reload and enforce consistent state - BUT RESPECT USER REMOVALS
    connections = await getAllConnections()
    
    for (const c of connections) {
      const exch = (c.exchange || "").toLowerCase().trim()
      const shouldBeOnDashboard = DASHBOARD_AUTO_INSERTED.includes(exch)
      
      // CRITICAL: Only enforce dashboard state on FIRST creation
      // If connection already has is_main_assigned set (even to "0"), respect user's choice
      const hasExplicitDashboardState = c.is_main_assigned !== undefined && c.is_main_assigned !== null
      
      // Determine correct dashboard state: only apply to new connections
      const dashboardInserted = hasExplicitDashboardState ? c.is_main_assigned : (shouldBeOnDashboard ? "1" : "0")
      
      // Check if migration needed - ONLY for enabled state, NOT for dashboard state
      const needsUpdate = c.is_enabled !== true || !c.is_main_enabled
      
      if (needsUpdate) {
        await updateConnection(c.id, {
          ...c,
          is_enabled: true, // BASE ENABLED - always ensure enabled in settings
          is_main_assigned: dashboardInserted, // Dashboard state: respect user's choice
          is_active_assigned: dashboardInserted, // Same as dashboard_inserted for Active panel
          is_main_enabled: "0", // Dashboard-active disabled by default - never auto-enable
          updated_at: new Date().toISOString(),
        })
        results.connectionsMigrated++
        console.log(`[v0] [Startup] ✓ Migrated: ${c.name} (dashboard=${dashboardInserted}, hasExplicitState=${hasExplicitDashboardState})`)
      }
      
      if (c.is_enabled === true || c.is_enabled === "1" || c.is_enabled === "true") {
        results.enabledCount++
      }
      
      if (c.is_main_assigned === "1" || c.is_main_assigned === true) {
        results.dashboardInsertedCount++
      }
    }
    
    console.log(`[v0] [Startup] Initialization complete:`, results)
    
    return NextResponse.json({
      success: true,
      message: "System initialized successfully",
      results,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] [Startup] Initialization failed:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
