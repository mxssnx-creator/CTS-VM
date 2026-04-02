import { type NextRequest, NextResponse } from "next/server"
import { SystemLogger } from "@/lib/system-logger"
import { initRedis, getRedisClient, getConnection, updateConnection } from "@/lib/redis-db"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"

// POST toggle preset trading for a connection
// This controls the PRESET Trade Engine
// Preset Engine starts ONLY if:
// 1. Connection is enabled (is_enabled = true)
// 2. Connection is active on dashboard (is_main_enabled = true)
// 3. Preset Trade toggle is enabled (is_preset_trade = true)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connectionId = id
    const { is_preset_trade } = await request.json()

    console.log("[v0] [Preset Trade] Toggling Preset Engine for:", connectionId, "enabled:", is_preset_trade)

    await initRedis()
    const connection = await getConnection(connectionId)

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    // Check if Global Trade Engine Coordinator is running
    if (is_preset_trade) {
      const client = getRedisClient()
      const globalState = await client.hgetall("trade_engine:global")
      const globalRunning = globalState?.status === "running"
      if (!globalRunning) {
        return NextResponse.json({ 
          error: "Global Trade Engine must be running first",
          hint: "Start the Global Trade Engine Coordinator before enabling preset engines."
        }, { status: 400 })
      }
    }

    // Check if connection is enabled AND active on dashboard
    const isEnabled = connection.is_enabled === "1" || connection.is_enabled === true
    const isActive = connection.is_main_enabled === "1" || connection.is_main_enabled === true

    if (!isEnabled) {
      return NextResponse.json({ error: "Connection must be enabled first" }, { status: 400 })
    }

    if (!isActive) {
      return NextResponse.json({ error: "Connection must be added to Active Connections first" }, { status: 400 })
    }

    // Update connection with is_preset_trade flag
    const updatedConnection = {
      ...connection,
      is_preset_trade: is_preset_trade ? "1" : "0",
      updated_at: new Date().toISOString(),
    }

    await updateConnection(connectionId, updatedConnection)
    console.log("[v0] [Preset Trade] Updated is_preset_trade:", connectionId, "=", is_preset_trade)

    // Start or stop Preset Engine based on toggle
    const coordinator = getGlobalTradeEngineCoordinator()
    let engineStatus = "stopped"

    if (is_preset_trade) {
      try {
        console.log("[v0] [Preset Trade] Starting Preset Engine for:", connection.name)
        
        // Start preset coordination engine
        await coordinator.startEngine(connectionId, {
          connectionId,
          connection_name: connection.name,
          exchange: connection.exchange,
          engine_type: "preset",
        })
        
        engineStatus = "running"
        console.log("[v0] [Preset Trade] Preset Engine started successfully")
        await SystemLogger.logConnection(
          `Preset Engine started via Preset Trade toggle`,
          connectionId,
          "info",
          { is_preset_trade: true },
        )
      } catch (error) {
        console.error("[v0] [Preset Trade] Failed to start Preset Engine:", error)
        engineStatus = "error"
        await SystemLogger.logError(error, "api", `Start Preset Engine for ${connectionId}`)
        return NextResponse.json(
          {
            error: "Failed to start Preset Engine",
            details: error instanceof Error ? error.message : "Unknown error",
          },
          { status: 500 },
        )
      }
    } else {
      try {
        console.log("[v0] [Preset Trade] Stopping Preset Engine for:", connection.name)
        await coordinator.stopEngine(connectionId)
        engineStatus = "stopped"
        console.log("[v0] [Preset Trade] Preset Engine stopped successfully")
        await SystemLogger.logConnection(
          `Preset Engine stopped via Preset Trade toggle`,
          connectionId,
          "info",
          { is_preset_trade: false },
        )
      } catch (error) {
        console.warn("[v0] [Preset Trade] Failed to stop Preset Engine:", error)
        // Don't fail the request if stop fails - engine might not be running
      }
    }

    return NextResponse.json({
      success: true,
      is_preset_trade,
      engineStatus,
      connection: updatedConnection,
      message: `Preset Engine ${is_preset_trade ? "enabled (starting...)" : "disabled"}`,
    })
  } catch (error) {
    console.error("[v0] [Preset Trade] Exception:", error)
    await SystemLogger.logError(error, "api", "POST /api/settings/connections/[id]/preset-toggle")
    return NextResponse.json(
      {
        error: "Failed to toggle preset trade",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
