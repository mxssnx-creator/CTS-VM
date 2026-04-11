import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getRedisClient, getSettings, getConnection } from "@/lib/redis-db"
import { getProgressionLogs, forceFlushLogs } from "@/lib/engine-progression-logs"
import { ProgressionStateManager } from "@/lib/progression-state-manager"

export const dynamic = "force-dynamic"

/**
 * GET /api/connections/progression/[id]
 * Returns comprehensive progression data for an active connection
 * Tracks: initialization, historical data loading, indications, strategies, realtime, live trading
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const connectionId = id

    await initRedis()
    
    // Force flush any pending logs before fetching
    await forceFlushLogs(connectionId)

    // Get connection details for context
    const connection = await getConnection(connectionId)
    const connName = connection?.name || connectionId

    // Get progression phase data from engine-manager's updateProgressionPhase
    const progression = await getSettings(`engine_progression:${connectionId}`)
    
    // Get engine state from the correct Redis key: trade_engine_state:{connectionId}
    const client = getRedisClient()
    const engineState = await getSettings(`trade_engine_state:${connectionId}`)
    
    // Also check global state
    let globalState: any = {}
    try {
      const globalStateStr = await client.get("trade_engine:global")
      globalState = globalStateStr ? JSON.parse(globalStateStr) : {}
    } catch {
      globalState = {}
    }
    const isGloballyRunning = globalState?.status === "running"
    
    // Check running flag directly
    const runningFlag = await getSettings(`engine_is_running:${connectionId}`)
    const isEngineRunning = runningFlag === "true" || runningFlag === true
    
    // Check if this connection is currently active/dashboard enabled
    const isActive = String(connection?.is_main_enabled) === "1" || connection?.is_main_enabled === true
    const isEnabled = String(connection?.is_enabled) === "1" || connection?.is_enabled === true
    const isInserted = String(connection?.is_assigned) === "1" || connection?.is_assigned === true
    const isActiveInserted = String(connection?.is_active_assigned) === "1" || connection?.is_active_assigned === true
    
    // Get progression state (cycles, success rates)
    const progressionState = await ProgressionStateManager.getProgressionState(connectionId)
    
    // Count indications processed for this connection
    let indicationsCount = 0
    let strategiesCount = 0
    try {
      // Check indication keys
      const keys = await client.keys(`indication:${connectionId}:*`)
      indicationsCount = keys.length
      
      // Check strategy keys
      const stratKeys = await client.keys(`strategy:${connectionId}:*`)
      strategiesCount = stratKeys.length
    } catch {
      indicationsCount = 0
      strategiesCount = 0
    }
    
    // Check for actual running evidence from cycle counts in engine state
    const indicationCycleCount = engineState?.indication_cycle_count || 0
    const strategyCycleCount = engineState?.strategy_cycle_count || 0
    const hasRecentActivity = engineState?.last_indication_run 
      ? (Date.now() - new Date(engineState.last_indication_run).getTime()) < 60000 // Active in last 60s
      : false
    
    // DEBUG: Log what we're reading
    console.log(`[v0] [ProgressionAPI] ${connectionId}: cycleCount=${indicationCycleCount}, stratCount=${strategyCycleCount}, recent=${hasRecentActivity}, engineState.status=${engineState?.status}, running=${isEngineRunning}`)
    console.log(`[v0] [ProgressionAPI] ${connectionId}: Full engineState keys=`, Object.keys(engineState || {}))
    console.log(`[v0] [ProgressionAPI] ${connectionId}: progression.phase=${progression?.phase}, progress=${progression?.progress}`)
    
    // Engine is running if: flag set, state says running, OR there's recent cycle activity
    const engineRunning = isEngineRunning || 
      (isGloballyRunning && (isActiveInserted || isInserted) && isEnabled) ||
      engineState?.status === "running" ||
      hasRecentActivity ||
      indicationCycleCount > 0 ||
      progressionState.cyclesCompleted > 0
    
    // Phase progression depends on stored phase or derived from state
    let phase = progression?.phase || "idle"
    let progress = Number(progression?.progress) || 0
    let detail = progression?.detail || "Not running"
    
    // Better phase detection based on actual metrics (most reliable)
    // Priority: actual evidence > stored progression > engine state > idle
    
    if (indicationCycleCount > 100 || progressionState.cyclesCompleted > 100) {
      // STRONG evidence: 100+ indication cycles = live trading active
      phase = "live_trading"
      progress = 100
      detail = `Live trading active - ${Math.max(indicationCycleCount, progressionState.cyclesCompleted)} cycles`
      console.log(`[v0] [Phase] ${connectionId}: Strong cycles evidence → live_trading`)
    } else if (indicationCycleCount > 20 || progressionState.cyclesCompleted > 20 || indicationsCount > 50) {
      // Moderate evidence: 20+ cycles OR 50+ indication keys means we're past initialization
      phase = "live_trading"
      progress = 90 + Math.min(10, indicationCycleCount / 100)
      detail = `Live trading - ${Math.max(indicationCycleCount, progressionState.cyclesCompleted)} cycles`
      console.log(`[v0] [Phase] ${connectionId}: Moderate cycles (${indicationCycleCount}) OR indications (${indicationsCount}) → live_trading`)
    } else if (indicationCycleCount > 0 || indicationsCount > 0 || progressionState.cyclesCompleted > 0) {
      // Any indication processing = realtime phase
      const totalCycles = Math.max(progressionState.cyclesCompleted, indicationCycleCount)
      phase = "realtime"
      progress = 80 + Math.min(20, totalCycles / 10)
      detail = `Processing - ${totalCycles} cycles`
      console.log(`[v0] [Phase] ${connectionId}: Initial cycles (${indicationCycleCount}) OR keys (${indicationsCount}) → realtime`)
    } else if (progression?.phase && !["ready", "idle", "initializing"].includes(progression.phase)) {
      // Use stored progression phase only if meaningful
      phase = progression.phase
      progress = Number(progression.progress) || 50
      detail = progression.detail || "Engine running"
    } else if (engineState?.all_phases_started || engineState?.live_trading_started) {
      // Engine state confirms all phases started
      phase = "live_trading"
      progress = 100
      detail = "All phases active"
    } else if (engineState?.strategies_started) {
      phase = "strategies"
      progress = 75
      detail = "Strategies processor active"
    } else if (engineState?.indications_started) {
      phase = "indications"
      progress = 60
      detail = "Indications processor active"
    } else if (engineState?.prehistoric_data_loaded) {
      phase = "prehistoric_data"
      progress = 15
      detail = "Prehistoric data loaded"
    } else if (engineState?.status === "running" || isEngineRunning) {
      // Engine state says running but no cycles yet
      phase = "initializing"
      progress = 30
      detail = "Engine starting up..."
    } else if (!isEnabled || (!isActiveInserted && !isInserted)) {
      phase = "idle"
      progress = 0
      detail = "Connection disabled or not inserted"
    } else if (progression?.phase === "ready") {
      phase = "ready"
      progress = 0
      detail = progression.detail || "Ready - toggle Enable on dashboard to start"
    }
    
    // Get recent logs for context
    const recentLogs = await getProgressionLogs(connectionId)
    const lastLog = recentLogs[0] || null
    
    const subItem = progression?.sub_item || ""
    const subCurrent = Number(progression?.sub_current) || 0
    const subTotal = Number(progression?.sub_total) || 0

    // Build comprehensive message from detail + sub-progress info
    let message = detail
    if (subTotal > 0 && subCurrent > 0) {
      message = `${detail} (${subCurrent}/${subTotal}${subItem ? ` - ${subItem}` : ""})`
    } else if (engineRunning && phase === "realtime") {
      message = "Processing realtime indications and strategies"
    }

    // Derive detailed step flags from phase progression
    const phaseOrder = ["idle", "initializing", "prehistoric_data", "indications", "strategies", "realtime", "live_trading"]
    const currentIdx = phaseOrder.indexOf(phase)

    console.log(`[v0] [Progression] Phase analysis for ${connName}:`, {
      phase,
      progress,
      message,
      phaseIndex: currentIdx,
      running: engineRunning,
    })

    const response = {
      success: true,
      connectionId,
      connectionName: connName,
      connection: {
        exchange: connection?.exchange || "unknown",
        isActive,
        isEnabled,
        isInserted,
        isActiveInserted,
      },
      progression: {
        phase,
        progress,
        message,
        subPhase: subItem || null,
        subProgress: {
          current: subCurrent,
          total: subTotal,
        },
        startedAt: globalState?.started_at || engineState?.started_at || null,
        updatedAt: progression?.updated_at || engineState?.last_indication_run || new Date().toISOString(),
        details: {
          historicalDataLoaded: currentIdx >= 3 || (progressionState.prehistoricCyclesCompleted || 0) > 0,
          indicationsCalculated: currentIdx >= 4 || engineRunning || indicationsCount > 0,
          strategiesProcessed: currentIdx >= 5 || engineRunning || strategiesCount > 0,
          liveProcessingActive: currentIdx >= 5 || engineRunning,
          liveTradingActive: phase === "live_trading",
        },
        error: phase === "error" ? detail : null,
      },
      state: {
        cyclesCompleted: progressionState.cyclesCompleted,
        successfulCycles: progressionState.successfulCycles,
        failedCycles: progressionState.failedCycles,
        cycleSuccessRate: Math.round(progressionState.cycleSuccessRate * 10) / 10,
        totalTrades: progressionState.totalTrades,
        successfulTrades: progressionState.successfulTrades,
        totalProfit: progressionState.totalProfit,
        tradeSuccessRate: Math.round(progressionState.tradeSuccessRate * 10) / 10,
        lastCycleTime: progressionState.lastCycleTime?.toISOString() || null,
        prehistoricCyclesCompleted: progressionState.prehistoricCyclesCompleted,
        prehistoricPhaseActive: progressionState.prehistoricPhaseActive,
      },
      metrics: {
        indicationsCount,
        strategiesCount,
        engineRunning,
        isEngineRunning,
        hasRecentActivity,
        globalEngineStatus: globalState?.status || "unknown",
        engineStateStatus: engineState?.status || "unknown",
        indicationCycleCount,
        strategyCycleCount,
        progressionCyclesCompleted: progressionState.cyclesCompleted,
        lastIndicationRun: engineState?.last_indication_run || null,
        lastStrategyRun: engineState?.last_strategy_run || null,
      },
      recentLogs: recentLogs.slice(0, 20).map(log => ({
        timestamp: log.timestamp,
        level: log.level,
        phase: log.phase,
        message: log.message,
        details: log.details,
      })),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("[v0] [Progression] Failed to fetch progression:", error)
    const { id } = await params
    return NextResponse.json({ 
      success: false,
      progression: {
        phase: "error",
        progress: 0,
        message: "Failed to fetch progression status",
        subPhase: null,
        subProgress: { current: 0, total: 0 },
        startedAt: null,
        updatedAt: null,
        details: {
          historicalDataLoaded: false,
          indicationsCalculated: false,
          strategiesProcessed: false,
          liveProcessingActive: false,
          liveTradingActive: false,
        },
        error: error instanceof Error ? error.message : "Unknown error",
      },
    }, { status: 500 })
  }
}
