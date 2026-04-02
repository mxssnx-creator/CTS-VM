import { type NextRequest, NextResponse } from "next/server"
import { SystemLogger } from "@/lib/system-logger"
import { initRedis, getConnection, updateConnection } from "@/lib/redis-db"

// POST - Add connection to active connections (set is_main_enabled flag)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connectionId = id

    await initRedis()
    const connection = await getConnection(connectionId)

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    // Update connection to be active on dashboard
    const updatedConnection = {
      ...connection,
      is_main_enabled: "1",
      updated_at: new Date().toISOString(),
    }

    await updateConnection(connectionId, updatedConnection)

    const logMsg = `[v0] [ActiveConnection] ✓ ENABLED: ${connection.name} (${connectionId}) | Exchange: ${connection.exchange} | Base: ${["bybit", "bingx", "pionex", "orangex", "binance", "okx"].includes((connection.exchange || "").toLowerCase())}`
    console.log(logMsg)
    await SystemLogger.logConnection("Dashboard: Enabled active connection", connectionId, "info")

    return NextResponse.json({
      success: true,
      connection: updatedConnection,
      message: "Connection enabled on dashboard",
    })
  } catch (error) {
    console.error(`[v0] [ActiveConnection] ✗ FAILED to enable: ${error instanceof Error ? error.message : String(error)}`)
    await SystemLogger.logError(error, "api", "POST /api/settings/connections/[id]/active")
    return NextResponse.json(
      { error: "Failed to enable connection", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

// DELETE - Remove connection from active connections
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connectionId = id

    await initRedis()
    const connection = await getConnection(connectionId)

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    // Update connection to remove from active
    const updatedConnection = {
      ...connection,
      is_main_enabled: "0",
      updated_at: new Date().toISOString(),
    }

    await updateConnection(connectionId, updatedConnection)

    const logMsg = `[v0] [ActiveConnection] ✗ DISABLED: ${connection.name} (${connectionId}) | Exchange: ${connection.exchange}`
    console.log(logMsg)
    await SystemLogger.logConnection("Dashboard: Disabled active connection", connectionId, "info")

    return NextResponse.json({
      success: true,
      connection: updatedConnection,
      message: "Connection disabled on dashboard",
    })
  } catch (error) {
    console.error(`[v0] [ActiveConnection] ✗ FAILED to disable: ${error instanceof Error ? error.message : String(error)}`)
    await SystemLogger.logError(error, "api", "DELETE /api/settings/connections/[id]/active")
    return NextResponse.json(
      { error: "Failed to disable connection", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
