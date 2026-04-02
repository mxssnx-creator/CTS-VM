import { NextResponse } from "next/server"
import { initRedis, getAllConnections } from "@/lib/redis-db"

export const dynamic = "force-dynamic"

/**
 * GET /api/settings/connections/available
 * Returns base connections that are:
 * 1. Enabled in Settings (is_enabled=true)
 * 2. NOT yet added to Active panel (is_active_assigned=false)
 */
export async function GET() {
  try {
    await initRedis()
    const allConnections = await getAllConnections()
    
    // Filter for base connections that are enabled but NOT in Active panel
    const availableConnections = allConnections.filter((c: any) => {
      // Must be enabled in Settings
      const isEnabled = c.is_enabled === true || c.is_enabled === "1" || c.is_enabled === "true"
      // Must NOT be a predefined info template
      const isPredefined = c.is_predefined === true || c.is_predefined === "1" || c.is_predefined === "true"
      // Must NOT already be in Active panel
      const isInActivePanel = c.is_active_assigned === true || c.is_active_assigned === "1" || c.is_active_assigned === "true"
      
      return isEnabled && !isPredefined && !isInActivePanel
    })
    
    console.log(`[v0] [Available] Found ${availableConnections.length} available connections`)
    
    return NextResponse.json({
      success: true,
      connections: availableConnections.map((c: any) => ({
        id: c.id,
        name: c.name,
        exchange: c.exchange,
        api_type: c.api_type,
        last_test_status: c.last_test_status,
        has_credentials: !!(c.api_key || c.apiKey),
      })),
      count: availableConnections.length,
    })
  } catch (error) {
    console.error("[v0] [Available] Error:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to get available connections" },
      { status: 500 }
    )
  }
}
