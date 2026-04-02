import { type NextRequest, NextResponse } from "next/server"
import { SystemLogger } from "@/lib/system-logger"
import { initRedis, getConnection, updateConnection, getAllConnections } from "@/lib/redis-db"

/**
 * POST /api/settings/connections/add-to-active
 * Add a base connection to the Active Connections list
 * 
 * Action:
 * 1. Load the base connection (predefined)
 * 2. Create an "active copy" state in Redis
 * 3. Set is_main_enabled=true to show in Active Connections
 * 4. Set is_enabled=false to require explicit enable
 * 5. Reset trade flags (is_live_trade, is_preset_trade to false)
 */
export async function POST(request: NextRequest) {
  try {
    const { connectionId } = await request.json()

    if (!connectionId) {
      return NextResponse.json({ error: "connectionId required" }, { status: 400 })
    }

    console.log(`[v0] [Add to Active] Adding ${connectionId} to Active Connections`)
    await initRedis()

    const baseConnection = await getConnection(connectionId)
    if (!baseConnection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    // Check if already inserted in active list
    if (baseConnection.is_active_assigned === "1" || baseConnection.is_active_assigned === true) {
      return NextResponse.json({
        success: false,
        error: "Connection already in Active panel",
      })
    }

    // Add to active list: inserted into Active panel, but NOT enabled by default
    const activeConnection = {
      ...baseConnection,
      is_active_assigned: "1",    // Visible in Active panel (inserted)
      is_main_enabled: "0",  // Toggle is OFF (NOT enabled by default)
      is_enabled: "0",            // NOT enabled - user must toggle to enable
      is_active: "0",             // Not active until user enables
      is_assigned: "1",           // Inserted (for connection tracking)
      is_live_trade: "0",
      is_preset_trade: "0",
      updated_at: new Date().toISOString(),
    }

    await updateConnection(connectionId, activeConnection)

    console.log(`[v0] [Add to Active] ${connectionId} inserted into Active panel (disabled by default)`)
    await SystemLogger.logConnection(
      `Inserted into Active panel. Toggle to enable.`,
      connectionId,
      "info",
      { is_active_assigned: true, is_main_enabled: false, is_enabled: false },
    )

    return NextResponse.json({
      success: true,
      message: "Connection inserted into Active panel. Toggle Enable to start processing.",
      connection: activeConnection,
    })
  } catch (error) {
    console.error(`[v0] [Add to Active] Exception:`, error)
    await SystemLogger.logError(error, "api", `POST /api/settings/connections/add-to-active`)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to add connection",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
