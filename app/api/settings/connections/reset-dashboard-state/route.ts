import { NextResponse } from "next/server"
import { initRedis, getAllConnections, updateConnection } from "@/lib/redis-db"

/**
 * POST /api/settings/connections/reset-dashboard-state
 * Force resets all connections to disabled dashboard state (NOT enabled by default)
 * This ensures the clean state after migrations
 */
export async function POST() {
  try {
    await initRedis()
    const allConnections = await getAllConnections()
    
    console.log(`[v0] [ResetDashboard] Resetting ${allConnections.length} connections to disabled state...`)
    
    let updatedCount = 0
    for (const conn of allConnections) {
      // Force disable all connections on dashboard
      const updated = {
        ...conn,
        is_main_enabled: "0",      // NOT enabled by default
        is_main_assigned: "1",     // But inserted (visible)
        is_enabled: "0",                // NOT enabled in settings
        is_active_assigned: "0",        // NOT in active panel
        is_active: "0",                 // NOT processing
        updated_at: new Date().toISOString(),
      }
      
      await updateConnection(conn.id, updated)
      updatedCount++
      console.log(`[v0] [ResetDashboard] ✓ ${conn.name} -> disabled state`)
    }
    
    console.log(`[v0] [ResetDashboard] COMPLETE: Reset ${updatedCount} connections to disabled state`)
    
    return NextResponse.json({
      success: true,
      message: "All connections reset to disabled dashboard state",
      updatedCount,
    })
  } catch (error) {
    console.error(`[v0] [ResetDashboard] ERROR:`, error)
    return NextResponse.json(
      { success: false, error: "Failed to reset dashboard state", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
