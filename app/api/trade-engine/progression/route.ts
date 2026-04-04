import { NextResponse } from "next/server"
import { initRedis, getAllConnections, getRedisClient } from "@/lib/redis-db"
import { SystemLogger } from "@/lib/system-logger"
import { query } from "@/lib/db"

export async function GET() {
  try {
    console.log("[v0] Fetching real-time trade engine progression data")
    
    await initRedis()
    const client = getRedisClient()
    const connections = await getAllConnections()
    const activeConnections = connections.filter((c: any) => {
      const isActive = c.is_active === "1" || c.is_active === true
      const isEnabled = c.is_enabled === "1" || c.is_enabled === true
      const isMainEnabled = c.is_main_enabled === "1" || c.is_main_enabled === true
      return isActive && (isEnabled || isMainEnabled)
    })
    
    console.log(`[v0] Processing ${activeConnections.length} active enabled connections`)
    
    // Import the global coordinator to get real engine status
    const { getGlobalTradeEngineCoordinator } = await import("@/lib/trade-engine")
    const coordinator = getGlobalTradeEngineCoordinator()
    
    // Get progression status for each connection with REAL data
    const progressionData = await Promise.all(
      activeConnections.map(async (conn) => {
        try {
          console.log(`[v0] Getting progression for ${conn.name}...`)
          
          // Get REAL engine status from running coordinator
          const engineStatus = await coordinator.getEngineStatus(conn.id)
          const isEngineRunning = engineStatus !== null
          
          // ALSO check Redis engine state (primary in production)
          const redisState = await client.hgetall(`trade_engine_state:${conn.id}`)
          const redisRunning = redisState?.status === "running"
          const redisProgression = await client.hgetall(`engine_progression:${conn.id}`)
          
          // Get trade count from database
          const trades = await query<{ count: number }>(
            `SELECT COUNT(*) as count FROM trades WHERE connection_id = ?`,
            [conn.id]
          )
          
          // Get pseudo position count
          const pseudoPositions = await query<{ count: number }>(
            `SELECT COUNT(*) as count FROM pseudo_positions WHERE connection_id = ?`,
            [conn.id]
          )
          
          // Get engine state from database
          const state = await query<{ state: string; updated_at: string; prehistoric_data_loaded: boolean }>(
            `SELECT state, updated_at, prehistoric_data_loaded FROM trade_engine_state WHERE connection_id = ?`,
            [conn.id]
          )
          
          const tradeCount = trades[0]?.count || 0
          const pseudoCount = pseudoPositions[0]?.count || 0
          const dbState = state[0]
          
          // Determine engine state: coordinator > Redis > DB
          const effectiveRunning = isEngineRunning || redisRunning
          const engineState = effectiveRunning ? 'running' : (redisProgression?.phase || dbState?.state || 'idle')
          const updatedAt = redisState?.updated_at || dbState?.updated_at
          const prehistoricLoaded = redisState?.prehistoric_data_loaded === "true" || dbState?.prehistoric_data_loaded || false
          
          // Get cycle metrics from engine status if available
          const cycleMetrics = engineStatus ? {
            indicationCycles: engineStatus.indication_cycle_count || 0,
            strategyCycles: engineStatus.strategy_cycle_count || 0,
            realtimeCycles: engineStatus.realtime_cycle_count || 0,
            lastCycleAt: engineStatus.last_cycle_at || null,
          } : (redisState ? {
            indicationCycles: Number(redisState.indication_cycle_count) || 0,
            strategyCycles: Number(redisState.strategy_cycle_count) || 0,
            realtimeCycles: Number(redisState.realtime_cycle_count) || 0,
            lastCycleAt: redisState.last_indication_run || null,
          } : null)
          
          console.log(`[v0] ${conn.name}: ${engineState}, ${tradeCount} trades, ${pseudoCount} positions, running=${effectiveRunning}`)
          
          return {
            connectionId: conn.id,
            connectionName: conn.name,
            exchange: conn.exchange,
            isEnabled: conn.is_enabled,
            isActive: conn.is_active,
            isLiveTrading: conn.is_live_trade,
            isEngineRunning: effectiveRunning,
            engineState,
            tradeCount,
            pseudoPositionCount: pseudoCount,
            prehistoricDataLoaded: prehistoricLoaded,
            lastUpdate: updatedAt,
            cycleMetrics,
            progressionPhase: redisProgression ? {
              phase: redisProgression.phase,
              progress: Number(redisProgression.progress) || 0,
              detail: redisProgression.detail,
            } : null,
            realTimeData: true, // Flag indicating this is real data
          }
        } catch (err) {
          console.warn(`[v0] Failed to get progression for ${conn.id}:`, err)
          return {
            connectionId: conn.id,
            connectionName: conn.name,
            exchange: conn.exchange,
            isEnabled: conn.is_enabled,
            isActive: conn.is_active,
            isLiveTrading: conn.is_live_trade,
            isEngineRunning: false,
            engineState: 'error',
            tradeCount: 0,
            pseudoPositionCount: 0,
            prehistoricDataLoaded: false,
            lastUpdate: null,
            cycleMetrics: null,
            progressionPhase: null,
            error: err instanceof Error ? err.message : String(err),
            realTimeData: false,
          }
        }
      })
    )
    
    console.log(`[v0] Returned real-time progression data for ${progressionData.length} connections`)
    return NextResponse.json({
      success: true,
      connections: progressionData,
      totalConnections: progressionData.length,
      runningEngines: progressionData.filter(c => c.isEngineRunning).length,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] Failed to fetch progression:", error)
    await SystemLogger.logError(error instanceof Error ? error.message : String(error), "api", "GET /api/trade-engine/progression")
    return NextResponse.json({ 
      success: false,
      error: "Failed to fetch progression",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}
