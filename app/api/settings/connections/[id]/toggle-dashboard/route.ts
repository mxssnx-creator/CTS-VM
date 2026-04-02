import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getConnection, updateConnection, setSettings, getSettings } from "@/lib/redis-db"
import { toggleConnectionLimiter } from "@/lib/connection-rate-limiter"
import { logProgressionEvent } from "@/lib/engine-progression-logs"

// POST toggle connection active status (assigned/enabled) - INDEPENDENT from Settings
// When enabling, also triggers engine start for this connection
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connectionId = id
    const body = await request.json()
    
    // Check rate limit using systemwide limiter
    const limitResult = await toggleConnectionLimiter.checkLimit(connectionId)
    
    if (!limitResult.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          details: `Maximum 30 toggle requests per minute. Retry after ${limitResult.retryAfter} seconds.`,
          retryAfter: limitResult.retryAfter,
          resetTime: limitResult.resetTime,
        },
        { status: 429, headers: { "Retry-After": String(limitResult.retryAfter) } }
      )
    }
    
    // Support both active fields:
    // - is_active_assigned: whether connection appears in active list
    // - is_main_enabled: whether connection is enabled/active on main page
    const { is_active_assigned, is_main_enabled } = body

    await initRedis()
    let connection = await getConnection(connectionId)
    let resolvedId = connectionId

    // Fallback: try with conn- prefix if not found
    if (!connection && !connectionId.startsWith("conn-")) {
      const prefixedId = `conn-${connectionId}`
      console.log(`[v0] [Toggle] Not found with id=${connectionId}, trying conn- prefix: ${prefixedId}`)
      connection = await getConnection(prefixedId)
      if (connection) {
        resolvedId = prefixedId
        console.log(`[v0] [Toggle] Resolved to: ${resolvedId}`)
      }
    }

    if (!connection) {
      console.log(`[v0] [Toggle] Connection not found: ${connectionId} (also tried conn-${connectionId})`)
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    console.log(`[v0] [Toggle] Toggling ${connection.name} (${connectionId}):`)
    console.log(`[v0] [Toggle]   Before: is_active_assigned=${connection.is_active_assigned}, is_main_enabled=${connection.is_main_enabled}`)

    // Build update object with all necessary fields
    const updatedConnection = {
      ...connection,
      updated_at: new Date().toISOString(),
    }
    
    let engineAction: "start" | "stop" | null = null
    
    if (is_active_assigned !== undefined) {
      updatedConnection.is_active_assigned = is_active_assigned
      console.log(`[v0] [Toggle]   Setting is_active_assigned=${is_active_assigned}`)
    }
    
    if (is_main_enabled !== undefined) {
      updatedConnection.is_main_enabled = is_main_enabled
      
      // CRITICAL: When toggling on/off on main page, also manage is_enabled + is_assigned for engine filter
      // getAssignedAndEnabledConnections() requires BOTH is_assigned="1" AND is_enabled="1"
      if (is_main_enabled) {
        // Toggle ON: Set all flags so engine's coordinator finds this connection
        updatedConnection.is_enabled = "1"
        updatedConnection.is_assigned = "1"
        updatedConnection.is_active = "1"
        engineAction = "start"
        console.log(`[v0] [Toggle] ENABLING: is_enabled=1, is_assigned=1 (engine will process this connection)`)
      } else {
        // Toggle OFF: Clear flags so engine stops processing
        updatedConnection.is_enabled = "0"
        updatedConnection.is_assigned = "0"
        updatedConnection.is_active = "0"
        engineAction = "stop"
        console.log(`[v0] [Toggle] DISABLING: is_enabled=0, is_assigned=0 (engine will stop processing)`)
      }
    }

    // Save connection state first
    await updateConnection(resolvedId, updatedConnection)
    console.log(`[v0] [Toggle] Updated ${connection.name} (resolved id: ${resolvedId})`)

    // Trigger engine action based on toggle state
    let engineStatus = "unchanged"
    if (engineAction === "start") {
      try {
        // Log progression event for UI feedback
        await logProgressionEvent(resolvedId, "toggle_enabled", "info", "Connection enabled via main toggle", {
          connectionId: resolvedId,
          connectionName: connection.name,
          exchange: connection.exchange,
        })
        
        // Check if connection has valid credentials
        const hasCredentials = (updatedConnection.api_key || updatedConnection.apiKey) && 
                               (updatedConnection.api_secret || updatedConnection.apiSecret)
        
        if (!hasCredentials) {
          // No credentials - set progression to waiting for credentials
          await setSettings(`engine_progression:${resolvedId}`, {
            phase: "waiting_credentials",
            progress: 5,
            detail: "Connection enabled but missing API credentials. Add credentials in Settings.",
            updated_at: new Date().toISOString(),
          })
          
          await logProgressionEvent(resolvedId, "waiting_credentials", "warning", 
            "Connection enabled but API credentials are missing", {
              connectionId: resolvedId,
              hint: "Add API key and secret in Settings to start trading",
            })
          
          engineStatus = "waiting_credentials"
          console.log(`[v0] [Toggle] Connection enabled but missing credentials: ${connection.name}`)
        } else {
          // Has credentials - update engine progression phase to show initializing
          await setSettings(`engine_progression:${resolvedId}`, {
            phase: "initializing",
            progress: 10,
            detail: "Connection enabled - engine starting...",
            updated_at: new Date().toISOString(),
          })
          
          // Update global engine state to trigger coordinator
          const globalState = await getSettings("trade_engine:global") || {}
          await setSettings("trade_engine:global", {
            ...globalState,
            status: "running",
            started_at: globalState.started_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            active_connections: (globalState.active_connections || 0) + 1,
            refresh_requested: new Date().toISOString(),
          })
          
          // Signal the coordinator to refresh engines
          await setSettings("engine_coordinator:refresh_requested", {
            timestamp: new Date().toISOString(),
            connectionId: resolvedId,
            action: "start",
          })
          
          engineStatus = "started"
          console.log(`[v0] [Toggle] Engine progression initialized for ${connection.name}`)
        }
      } catch (engineError) {
        console.error(`[v0] [Toggle] Failed to initialize engine:`, engineError)
        engineStatus = "error"
        
        await logProgressionEvent(resolvedId, "toggle_error", "error", "Failed to start engine after toggle", {
          error: engineError instanceof Error ? engineError.message : String(engineError),
        })
      }
    } else if (engineAction === "stop") {
      try {
        await logProgressionEvent(resolvedId, "toggle_disabled", "info", "Connection disabled via main toggle", {
          connectionId: resolvedId,
          connectionName: connection.name,
        })
        
        await setSettings(`engine_progression:${resolvedId}`, {
          phase: "idle",
          progress: 0,
          detail: "Connection disabled",
          updated_at: new Date().toISOString(),
        })
        
        // Update global engine state
        const globalState = await getSettings("trade_engine:global") || {}
        const activeCount = Math.max(0, (globalState.active_connections || 1) - 1)
        await setSettings("trade_engine:global", {
          ...globalState,
          updated_at: new Date().toISOString(),
          active_connections: activeCount,
          status: activeCount > 0 ? "running" : "idle",
          refresh_requested: new Date().toISOString(),
        })
        
        // Signal the coordinator to refresh engines
        await setSettings("engine_coordinator:refresh_requested", {
          timestamp: new Date().toISOString(),
          connectionId: resolvedId,
          action: "stop",
        })
        
        engineStatus = "stopped"
        console.log(`[v0] [Toggle] Engine stopped for ${connection.name}`)
      } catch (engineError) {
        console.error(`[v0] [Toggle] Failed to stop engine:`, engineError)
        engineStatus = "error"
      }
    }

    return NextResponse.json({
      success: true,
      connection: {
        id: resolvedId,
        name: connection.name,
        exchange: connection.exchange,
        is_active_assigned: updatedConnection.is_active_assigned,
        is_main_enabled: updatedConnection.is_main_enabled,
        is_enabled: updatedConnection.is_enabled,
        is_assigned: updatedConnection.is_assigned,
      },
      engine: {
        action: engineAction,
        status: engineStatus,
      },
      progressionUrl: `/api/connections/progression/${resolvedId}`,
    })
  } catch (error) {
    console.error(`[v0] [Toggle] Error:`, error)
    return NextResponse.json(
      { error: "Failed to update active status", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
