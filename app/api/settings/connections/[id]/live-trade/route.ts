import { type NextRequest, NextResponse } from "next/server"
import { SystemLogger } from "@/lib/system-logger"
import { initRedis, getRedisClient, getConnection, updateConnection, getAllConnections } from "@/lib/redis-db"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"
import { loadSettingsAsync } from "@/lib/settings-storage"

// POST toggle live trading for a connection
// This enables REAL exchange trading via strategies
// Requirements for enabling:
// 1. Global Trade Engine must be running
// 2. Connection must be enabled in Settings
// 3. Connection must be active on Dashboard
// 4. is_live_trade flag set to true
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connectionId = id
    const body = await request.json()
    const { is_live_trade } = body

    console.log(`[v0] [LiveTrade] POST handler called for: ${connectionId}, is_live_trade=${is_live_trade}`)

    await initRedis()
    const connection = await getConnection(connectionId)

    if (!connection) {
      console.log(`[v0] [LiveTrade] ✗ Connection not found: ${connectionId}`)
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    const connName = connection.name
    console.log(`[v0] [LiveTrade] Found connection: ${connName} (${connection.exchange})`)

    // If enabling, check prerequisites
    if (is_live_trade) {
      console.log(`[v0] [LiveTrade] Checking prerequisites for enabling ${connName}...`)
      
      // Check 1: Global Trade Engine running
      const client = getRedisClient()
      const globalState = await client.hgetall("trade_engine:global")
      const globalRunning = globalState?.status === "running"
      console.log(`[v0] [LiveTrade]   - Global engine running: ${globalRunning}`)
      
      if (!globalRunning) {
        console.log(`[v0] [LiveTrade] ✗ Prerequisite failed: Global Trade Engine not running`)
        return NextResponse.json({ 
          success: false,
          error: "Global Trade Engine must be running first",
          hint: "Start the Global Trade Engine Coordinator before enabling individual connections"
        }, { status: 400 })
      }

      // Check 2: Connection enabled in Settings
      const isEnabled = connection.is_enabled === "1" || connection.is_enabled === true
      console.log(`[v0] [LiveTrade]   - Connection enabled in Settings: ${isEnabled}`)
      
      if (!isEnabled) {
        console.log(`[v0] [LiveTrade] ✗ Prerequisite failed: Connection not enabled in Settings`)
        return NextResponse.json({ 
          success: false,
          error: "Connection must be enabled in Settings first" 
        }, { status: 400 })
      }

      // Check 3: Connection active on Dashboard
      const isActive = connection.is_main_enabled === "1" || connection.is_main_enabled === true
      console.log(`[v0] [LiveTrade]   - Connection active on Dashboard: ${isActive}`)
      
      if (!isActive) {
        console.log(`[v0] [LiveTrade] ✗ Prerequisite failed: Connection not added to Active Connections`)
        return NextResponse.json({ 
          success: false,
          error: "Connection must be added to Active Connections first" 
        }, { status: 400 })
      }

      console.log(`[v0] [LiveTrade] ✓ All prerequisites met for ${connName}`)
    }

    // Update connection with is_live_trade flag
    console.log(`[v0] [LiveTrade] Updating connection state: is_live_trade=${is_live_trade}`)
    const updatedConnection = {
      ...connection,
      is_live_trade: is_live_trade ? "1" : "0",
      updated_at: new Date().toISOString(),
    }

    await updateConnection(connectionId, updatedConnection)
    console.log(`[v0] [LiveTrade] ✓ Connection updated in database`)

    // Start or stop engine based on toggle
    const coordinator = getGlobalTradeEngineCoordinator()
    let engineStatus = "stopped"

    if (is_live_trade) {
      try {
        console.log(`[v0] [LiveTrade] Starting live trading engine for: ${connName}`)
        const settings = await loadSettingsAsync()
        
        // Load latest config
        const latestConnection = await getConnection(connectionId)
        
        await coordinator.startEngine(connectionId, {
          connectionId,
          connection_name: latestConnection?.name || connName,
          exchange: latestConnection?.exchange || connection.exchange,
          indicationInterval: settings?.mainEngineIntervalMs ? settings.mainEngineIntervalMs / 1000 : 1,
          strategyInterval: settings?.strategyUpdateIntervalMs ? settings.strategyUpdateIntervalMs / 1000 : 1,
          realtimeInterval: settings?.realtimeIntervalMs ? settings.realtimeIntervalMs / 1000 : 0.2,
        })
        
        engineStatus = "running"
        console.log(`[v0] [LiveTrade] ✓ Live trading engine started successfully for ${connName}`)
        
        await SystemLogger.logConnection(
          `Live Trading enabled via UI toggle`,
          connectionId,
          "info",
          { is_live_trade: true, exchange: connection.exchange },
        )
      } catch (error) {
        console.error(`[v0] [LiveTrade] ✗ Failed to start live trading engine for ${connName}:`, error)
        engineStatus = "error"
        
        await SystemLogger.logError(error, "api", `Start live trading for ${connName}`)
        
        return NextResponse.json(
          {
            success: false,
            error: "Failed to start live trading engine",
            details: error instanceof Error ? error.message : "Unknown error",
            connectionName: connName,
          },
          { status: 500 },
        )
      }
    } else {
      try {
        console.log(`[v0] [LiveTrade] Stopping live trading engine for: ${connName}`)
        await coordinator.stopEngine(connectionId)
        engineStatus = "stopped"
        console.log(`[v0] [LiveTrade] ✓ Live trading engine stopped successfully for ${connName}`)
        
        await SystemLogger.logConnection(
          `Live Trading disabled via UI toggle`,
          connectionId,
          "info",
          { is_live_trade: false, exchange: connection.exchange },
        )
      } catch (error) {
        console.warn(`[v0] [LiveTrade] ⚠ Failed to stop live trading engine for ${connName}:`, error)
        // Don't fail the request - engine might not be running
      }
    }

    console.log(`[v0] [LiveTrade] ✓ Live trading toggle completed for ${connName}: ${engineStatus}`)

    return NextResponse.json({
      success: true,
      is_live_trade,
      engineStatus,
      connection: updatedConnection,
      message: `Live Trading ${is_live_trade ? "enabled (starting real exchange trading...)" : "disabled"}`,
      connectionName: connName,
      exchange: connection.exchange,
    })
  } catch (error) {
    console.error("[v0] [LiveTrade] Exception in POST handler:", error)
    await SystemLogger.logError(error, "api", "POST /api/settings/connections/[id]/live-trade")
    return NextResponse.json(
      {
        success: false,
        error: "Failed to toggle live trade",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
