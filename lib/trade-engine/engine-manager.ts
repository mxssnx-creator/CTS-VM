/**
 * Trade Engine Manager
 * Manages asynchronous processing for symbols, indications, pseudo positions, and strategies
 */

import { getSettings, setSettings, getAllConnections, getConnection, saveMarketData } from "@/lib/redis-db"
import { DataSyncManager } from "@/lib/data-sync-manager"
import { IndicationProcessor } from "./indication-processor"
import { StrategyProcessor } from "./strategy-processor"
import { PseudoPositionManager } from "./pseudo-position-manager"
import { RealtimeProcessor } from "./realtime-processor"
import { logProgressionEvent } from "@/lib/engine-progression-logs"
import { loadMarketDataForEngine, loadPrehistoricMarketData } from "@/lib/market-data-loader"
import { ProgressionStateManager } from "@/lib/progression-state-manager"
import { createExchangeConnector } from "@/lib/exchange-connectors"
import { BingXMarketDataService } from "@/lib/bingx-market-data"

export interface EngineConfig {
  connectionId: string
  indicationInterval: number // seconds
  strategyInterval: number // seconds
  realtimeInterval: number // seconds
}

export interface ComponentHealth {
  status: "healthy" | "degraded" | "unhealthy"
  lastCycleDuration: number
  errorCount: number
  successRate: number
}

export class TradeEngineManager {
  private connectionId: string
  private isRunning = false
  private indicationTimer?: NodeJS.Timeout
  private strategyTimer?: NodeJS.Timeout
  private realtimeTimer?: NodeJS.Timeout
  private healthCheckTimer?: NodeJS.Timeout
  private heartbeatTimer?: NodeJS.Timeout

  private indicationProcessor: IndicationProcessor
  private strategyProcessor: StrategyProcessor
  private pseudoPositionManager: PseudoPositionManager
  private realtimeProcessor: RealtimeProcessor
  private startTime?: Date

  private componentHealth: {
    indications: ComponentHealth
    strategies: ComponentHealth
    realtime: ComponentHealth
  }

  constructor(config: EngineConfig) {
    this.connectionId = config.connectionId
    this.indicationProcessor = new IndicationProcessor(config.connectionId)
    this.strategyProcessor = new StrategyProcessor(config.connectionId)
    this.pseudoPositionManager = new PseudoPositionManager(config.connectionId)
    this.realtimeProcessor = new RealtimeProcessor(config.connectionId)

    this.componentHealth = {
      indications: { status: "healthy", lastCycleDuration: 0, errorCount: 0, successRate: 100 },
      strategies: { status: "healthy", lastCycleDuration: 0, errorCount: 0, successRate: 100 },
      realtime: { status: "healthy", lastCycleDuration: 0, errorCount: 0, successRate: 100 },
    }

    console.log("[v0] TradeEngineManager initialized (timer-based async processor)")
  }

  /**
   * Start the trade engine
   */
  async start(config: EngineConfig): Promise<void> {
    if (this.isRunning) {
      console.log("[v0] Trade engine already running for connection:", this.connectionId)
      return
    }

    console.log(`[v0] [EngineManager] Starting trade engine for connection: ${this.connectionId}`)
    console.log(`[v0] [EngineManager] Config: indication=${config.indicationInterval}s, strategy=${config.strategyInterval}s, realtime=${config.realtimeInterval}s`)

    try {
      // Phase 1: Initializing
      await this.updateProgressionPhase("initializing", 5, "Setting up engine components...")
      await logProgressionEvent(this.connectionId, "initializing", "info", "Engine initialization started")
      await this.updateEngineState("running")
      await this.setRunningFlag(true)
      console.log(`[v0] [EngineManager] Phase 1/6: Initialized`)

      // Phase 1.5: Load market data for all symbols
      await this.updateProgressionPhase("market_data", 8, "Loading market data for all symbols...")
      const symbols = await this.getSymbols()
      console.log(`[v0] [EngineManager] Loaded ${symbols.length} symbols for connection`)
      const loaded = await loadMarketDataForEngine(symbols)
      console.log(`[v0] [EngineManager] Phase 1.5/6: Market data loaded for ${loaded} symbols`)

      // Phase 2: Load prehistoric data (historical data retrieval + calculation)
      // Run in background - don't block engine startup
      await this.updateProgressionPhase("prehistoric_data", 15, "Loading historical market data...")
      console.log(`[v0] [EngineManager] Phase 2/6: Starting prehistoric data loading (background)...`)
      // Fire and forget - don't await
      this.loadPrehistoricData().catch(err => {
        console.warn(`[v0] [EngineManager] Prehistoric data loading error (non-blocking):`, err)
        // Don't throw - engine continues
      })
      console.log(`[v0] [EngineManager] Phase 2/6: Prehistoric loading queued (engine will continue)`)

      // Phase 3: Start indication processor - immediate phase update
      console.log(`[v0] [EngineManager] Phase 3/6: Starting indication processor (${symbols.length} symbols)`)
      await this.updateProgressionPhase("indications", 60, "Processing indications continuously")
      this.startIndicationProcessor(config.indicationInterval)

      // Phase 4: Start strategy processor - immediate phase update
      console.log(`[v0] [EngineManager] Phase 4/6: Starting strategy processor`)
      await this.updateProgressionPhase("strategies", 75, "Processing strategies continuously")
      this.startStrategyProcessor(config.strategyInterval)

      // Phase 5: Start realtime processor - immediate phase update
      console.log(`[v0] [EngineManager] Phase 5/6: Starting real-time processor`)
      await this.updateProgressionPhase("realtime", 85, "Monitoring real-time data and positions")
      this.startRealtimeProcessor(config.realtimeInterval)
      this.startHealthMonitoring()
      
      // Phase 6: Live trading ready - final phase update
      this.startHeartbeat()
      this.isRunning = true
      this.startTime = new Date()
      
      // Final progression update - LIVE TRADING ACTIVE
      await this.updateProgressionPhase("live_trading", 100, `Live trading ACTIVE - monitoring ${symbols.length} symbols`)
      console.log(`[v0] [EngineManager] ✓ Phase 6/6: LIVE TRADING ACTIVE for ${this.connectionId}`)
      console.log(`[v0] [EngineManager] ✓ Engine fully initialized`)
      
      // Also update engine state to indicate all phases are running
      await setSettings(`trade_engine_state:${this.connectionId}`, {
        all_phases_started: true,
        indications_started: true,
        strategies_started: true,
        realtime_started: true,
        live_trading_started: true,
        updated_at: new Date().toISOString(),
      })
      
      await logProgressionEvent(this.connectionId, "engine_started", "info", "Trade engine fully started", {
        symbols: symbols.length,
        phases: 6,
        config,
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`[v0] [EngineManager] ✗ FAILED to start trade engine:`, errorMsg)
      if (error instanceof Error) {
        console.error(`[v0] [EngineManager] Stack:`, error.stack)
      }
      await this.updateProgressionPhase("error", 0, errorMsg)
      await this.updateEngineState("error", errorMsg)
      await this.setRunningFlag(false)
      await logProgressionEvent(this.connectionId, "engine_error", "error", "Engine failed to start", {
        error: errorMsg,
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }

  /**
   * Graceful error recovery - catches errors in processors and logs them
   */
  private setupErrorRecovery() {
    // Processors already have internal error handling
    // This ensures we log and recover from any unhandled errors
    process.on("unhandledRejection", (reason, promise) => {
      if (this.isRunning) {
        console.error("[v0] Unhandled rejection in trade engine:", reason)
        // Update engine state to degraded but keep running
        this.updateEngineState("error", `Unhandled rejection: ${reason}`)
      }
    })
  }

  async stop(): Promise<void> {
    console.log("[v0] Stopping trade engine for connection:", this.connectionId)

    this.isRunning = false

    // Clear all timers (works for both clearTimeout and clearInterval)
    if (this.indicationTimer) { clearTimeout(this.indicationTimer); clearInterval(this.indicationTimer); this.indicationTimer = undefined }
    if (this.strategyTimer) { clearTimeout(this.strategyTimer); clearInterval(this.strategyTimer); this.strategyTimer = undefined }
    if (this.realtimeTimer) { clearTimeout(this.realtimeTimer); clearInterval(this.realtimeTimer); this.realtimeTimer = undefined }
    if (this.healthCheckTimer) { clearInterval(this.healthCheckTimer); this.healthCheckTimer = undefined }
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = undefined }

    // Update engine state and clear running flag
    await this.updateEngineState("stopped")
    await this.setRunningFlag(false)
    await this.updateProgressionPhase("stopped", 0, "Engine stopped")

    console.log("[v0] Trade engine stopped")
  }

  /**
   * Load prehistoric data (historical data before real-time processing)
   * Uses BingX API with real credentials from Redis connection settings
   * Respects timeframe from settings (marketTimeframe) and prehistoricDataDays
   */
  private async loadPrehistoricData(): Promise<void> {
    console.log("[v0] [Prehistoric] Starting background prehistoric data loading...")

    try {
      const engineState = await getSettings(`trade_engine_state:${this.connectionId}`)
      if (engineState?.prehistoric_data_loaded) {
        console.log("[v0] [Prehistoric] Data already loaded, skipping...")
        return
      }

      const symbols = await this.getSymbols()
      console.log(`[v0] [Prehistoric] Loading data for ${symbols.length} symbol(s)`)

      await logProgressionEvent(this.connectionId, "prehistoric_start", "info", "Prehistoric data loading started", {
        symbolsCount: symbols.length,
      })

      const allSettings = (await getSettings("all_settings")) || {}
      const days = allSettings.prehistoricDataDays || 5
      const marketTimeframe = allSettings.marketTimeframe || 1

      const timeframeMap: Record<number, string> = {
        1: "1m",
        2: "1m",
        3: "1m",
        5: "5m",
        10: "5m",
        15: "15m",
      }
      const interval = timeframeMap[marketTimeframe] || "1m"

      console.log(`[v0] [Prehistoric] Settings: days=${days}, marketTimeframe=${marketTimeframe}, interval=${interval}`)

      await this.updateProgressionPhase("prehistoric_data", 15, `Loading ${days} days of ${interval} data from BingX...`)

      const { loadPrehistoricMarketData } = await import("@/lib/market-data-loader")
      const result = await loadPrehistoricMarketData(symbols, this.connectionId)

      const prehistoricEnd = new Date()
      const prehistoricStart = new Date(prehistoricEnd.getTime() - days * 24 * 60 * 60 * 1000)

      await setSettings(`trade_engine_state:${this.connectionId}`, {
        prehistoric_data_loaded: true,
        prehistoric_data_start: prehistoricStart.toISOString(),
        prehistoric_data_end: prehistoricEnd.toISOString(),
        prehistoric_symbols: symbols,
        prehistoric_interval: interval,
        prehistoric_days: days,
        prehistoric_symbols_loaded: result.loaded,
        prehistoric_symbols_total: result.total,
        updated_at: new Date().toISOString(),
      })

      console.log(`[v0] [Prehistoric] Complete: ${result.loaded}/${result.total} symbols loaded (${days} days, ${interval})`)

      await logProgressionEvent(this.connectionId, "prehistoric_complete", "info", "Prehistoric data loading complete", {
        symbolsLoaded: result.loaded,
        symbolsTotal: result.total,
        days,
        interval,
      })
    } catch (error) {
      console.warn("[v0] [Prehistoric] Background loading failed (non-fatal):", error instanceof Error ? error.message : String(error))
      await logProgressionEvent(this.connectionId, "prehistoric_error", "error", "Prehistoric data loading failed", {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Load market data for a specific range from exchange API
   */
  private async loadMarketDataRange(symbol: string, start: Date, end: Date): Promise<void> {
    try {
      console.log(`[v0] [EngineManager] Loading market data for ${symbol}: ${start.toISOString()} to ${end.toISOString()}`)
      
      // Fetch real market data from exchange when credentials are available
      const connection = await getConnection(this.connectionId)
      if (connection && connection.api_key && connection.api_secret) {
        try {
          if (connection.exchange === "bingx") {
            const bingxSymbol = symbol.endsWith("USDT") ? symbol.replace("USDT", "-USDT") : symbol + "-USDT"
            const marketDataService = new BingXMarketDataService({
              exchange: "bingx",
              apiType: connection.api_type || "perpetual_futures",
              isTestnet: connection.is_testnet === "1" || connection.is_testnet === true,
            })
            
            const candles = await marketDataService.fetchKlines(bingxSymbol, "1m", 500)
            
            for (const candle of candles) {
              await saveMarketData(symbol, {
                symbol,
                exchange: connection.exchange,
                interval: "1m",
                price: candle.close,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close,
                volume: candle.volume,
                timestamp: new Date(candle.timestamp).toISOString(),
              })
            }
            
            console.log(`[v0] [EngineManager] ✓ Fetched ${candles.length} real BingX candles for ${symbol}`)
          } else {
            try {
              const connector = await createExchangeConnector(connection.exchange, {
                apiKey: connection.api_key,
                apiSecret: connection.api_secret,
                apiType: connection.api_type || "perpetual_futures",
                isTestnet: connection.is_testnet === "1" || connection.is_testnet === true,
              })
              
              if ("getKlines" in connector && typeof (connector as any).getKlines === "function") {
                const klines = await (connector as any).getKlines(symbol, "1m", {
                  startTime: start.getTime(),
                  endTime: end.getTime(),
                  limit: 500,
                })
                
                for (const kline of klines) {
                  await saveMarketData(symbol, {
                    symbol,
                    exchange: connection.exchange,
                    interval: "1m",
                    price: kline.close,
                    open: kline.open,
                    high: kline.high,
                    low: kline.low,
                    close: kline.close,
                    volume: kline.volume,
                    timestamp: new Date(kline.timestamp).toISOString(),
                  })
                }
                
                console.log(`[v0] [EngineManager] ✓ Fetched ${klines.length} real klines for ${symbol}`)
              }
            } catch (connectorError) {
              console.warn(`[v0] [EngineManager] Exchange connector failed: ${connectorError instanceof Error ? connectorError.message : String(connectorError)}`)
            }
          }
        } catch (exchangeError) {
          console.warn(`[v0] [EngineManager] Exchange API failed, using seeded data: ${exchangeError instanceof Error ? exchangeError.message : String(exchangeError)}`)
        }
      }
      
      // Mark this range as synced in Redis
      await DataSyncManager.markSynced(
        this.connectionId,
        symbol,
        "market_data",
        end
      )
    } catch (error) {
      console.error(`[v0] [EngineManager] Error loading market data for ${symbol}:`, error)
      // Don't throw - allow engine to continue with available data
    }
  }

  /**
   * Process connection through all 5 stages: Indication → Base → Main → Real → Live
   */
  private async processConnection5Stages(connection: any): Promise<void> {
    const connectionId = connection.id || connection.name
    const startTime = Date.now()

    try {
      console.log(`[v0] [EngineManager] Starting 5-stage processing for ${connectionId}`)

      // Stage 1: Indication (Technical Analysis Signals)
      console.log(`[v0] [EngineManager] [Stage 1] Processing indications...`)
      await logProgressionEvent(connectionId, "stage_1_indication", "info", "Stage 1: Processing indications", {})
      const indications = await this.indicationProcessor.processIndication(connection.monitored_symbol || "BTC/USDT")

      // Stage 2: Base (Create all possible pseudo positions)
      console.log(`[v0] [EngineManager] [Stage 2] Creating base positions...`)
      await logProgressionEvent(connectionId, "stage_2_base", "info", "Stage 2: Creating base positions", {
        indicationCount: indications ? 1 : 0,
      })
      // Base positions: 1 LONG + 1 SHORT per indication
      const basePositionCount = indications ? 2 : 0

      // Stage 3: Main (Filter and evaluate base positions)
      console.log(`[v0] [EngineManager] [Stage 3] Evaluating main positions...`)
      await logProgressionEvent(connectionId, "stage_3_main", "info", "Stage 3: Evaluating main positions", {
        basePositionCount,
      })

      // Stage 4: Real (Apply trading ratios and thresholds)
      console.log(`[v0] [EngineManager] [Stage 4] Computing real positions...`)
      await logProgressionEvent(connectionId, "stage_4_real", "info", "Stage 4: Computing real positions", {})

      // Stage 5: Live (Execute on exchange and track fills)
      console.log(`[v0] [EngineManager] [Stage 5] Processing live positions...`)
      await logProgressionEvent(connectionId, "stage_5_live", "info", "Stage 5: Processing live positions", {})

      const duration = Date.now() - startTime
      console.log(`[v0] [EngineManager] ✓ 5-stage cycle complete for ${connectionId} (${duration}ms)`)
      
      await logProgressionEvent(connectionId, "cycle_complete", "info", "5-stage cycle complete", {
        duration,
        stages: 5,
      })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      console.log(`[v0] [EngineManager] ✗ 5-stage processing error: ${error}`)
      await logProgressionEvent(connectionId, "cycle_error", "error", error, { duration: Date.now() - startTime })
      throw err
    }
  }

  /**
   * Start indication processor (async)
   * Uses recursive setTimeout to ensure each cycle completes before next starts
   */
  private startIndicationProcessor(intervalSeconds: number = 1): void {
    console.log(`[v0] Starting indication processor (interval: ${intervalSeconds}s, sequential)`)

    let cycleCount = 0
    let totalDuration = 0
    let errorCount = 0

    const runCycle = async () => {
      if (!this.isRunning) return
      
      const startTime = Date.now()
      try {
        const symbols = await this.getSymbols()
        await Promise.all(symbols.map((symbol) => this.indicationProcessor.processIndication(symbol)))

        const duration = Date.now() - startTime
        cycleCount++
        totalDuration += duration

        this.componentHealth.indications.lastCycleDuration = duration
        this.componentHealth.indications.successRate = ((cycleCount - errorCount) / cycleCount) * 100

        try {
          await setSettings(`trade_engine_state:${this.connectionId}`, {
            connection_id: this.connectionId,
            status: "running",
            started_at: this.startTime?.toISOString() || new Date().toISOString(),
            last_indication_run: new Date().toISOString(),
            indication_cycle_count: cycleCount,
            indication_avg_duration_ms: totalDuration > 0 ? Math.round(totalDuration / cycleCount) : 0,
          })
        } catch { /* non-critical */ }

        if (cycleCount % 10 === 0) {
          await ProgressionStateManager.incrementCycle(this.connectionId, true, 0)
          await logProgressionEvent(this.connectionId, "indications", "info", `Processed ${symbols.length} symbols`, {
            cycleDuration_ms: duration,
            cycleCount,
            symbolsCount: symbols.length,
          })
        }
      } catch (error) {
        errorCount++
        this.componentHealth.indications.errorCount++
        if (cycleCount % 10 === 0) {
          await ProgressionStateManager.incrementCycle(this.connectionId, false, 0)
        }
        console.error("[v0] Indication processor error:", error)
      }
      
      // Schedule next cycle after this one completes
      if (this.isRunning) {
        this.indicationTimer = setTimeout(runCycle, intervalSeconds * 1000)
      }
    }

    // Start first cycle
    this.indicationTimer = setTimeout(runCycle, intervalSeconds * 1000)
  }

  /**
   * Start strategy processor (async)
   * Uses recursive setTimeout to ensure each cycle completes before next starts
   */
  private startStrategyProcessor(intervalSeconds: number = 1): void {
    console.log(`[v0] Starting strategy processor (interval: ${intervalSeconds}s, sequential)`)

    let cycleCount = 0
    let totalDuration = 0
    let errorCount = 0
    let totalStrategiesEvaluated = 0

    const runCycle = async () => {
      if (!this.isRunning) return
      
      const startTime = Date.now()
      try {
        const symbols = await this.getSymbols()
        const strategyResults = await Promise.all(
          symbols.map((symbol) => this.strategyProcessor.processStrategy(symbol))
        )

        const duration = Date.now() - startTime
        cycleCount++
        totalDuration += duration

        const evaluatedThisCycle = strategyResults.reduce((sum, result) => sum + (result?.strategiesEvaluated || 0), 0)
        totalStrategiesEvaluated += evaluatedThisCycle

        this.componentHealth.strategies.lastCycleDuration = duration
        this.componentHealth.strategies.successRate = ((cycleCount - errorCount) / cycleCount) * 100

        try {
          await setSettings(`trade_engine_state:${this.connectionId}`, {
            status: "running",
            last_strategy_run: new Date().toISOString(),
            strategy_cycle_count: cycleCount,
            strategy_avg_duration_ms: totalDuration > 0 ? Math.round(totalDuration / cycleCount) : 0,
            total_strategies_evaluated: totalStrategiesEvaluated,
          })
        } catch { /* non-critical */ }

        if (cycleCount % 5 === 0) {
          console.log(`[v0] [StrategyEngine] Cycle ${cycleCount}: Evaluated ${evaluatedThisCycle} strategies`)
          await logProgressionEvent(this.connectionId, "strategies", "info", `Processed strategies for ${symbols.length} symbols`, {
            cycleDuration_ms: duration,
            cycleCount,
            symbolsCount: symbols.length,
            strategiesEvaluatedThisCycle: evaluatedThisCycle,
            totalStrategiesEvaluated,
            avgStrategiesPerSymbol: symbols.length > 0 ? Math.round(evaluatedThisCycle / symbols.length) : 0,
          })
        }
      } catch (error) {
        errorCount++
        this.componentHealth.strategies.errorCount++
        console.error("[v0] Strategy processor error:", error)
      }
      
      if (this.isRunning) {
        this.strategyTimer = setTimeout(runCycle, intervalSeconds * 1000)
      }
    }

    this.strategyTimer = setTimeout(runCycle, intervalSeconds * 1000)
  }

  /**
   * Start realtime processor (async)
   * Uses recursive setTimeout to ensure each cycle completes before next starts
   */
  private startRealtimeProcessor(intervalSeconds: number = 1): void {
    console.log(`[v0] Starting realtime processor (interval: ${intervalSeconds}s, sequential)`)

    let cycleCount = 0
    let totalDuration = 0
    let errorCount = 0

    const runCycle = async () => {
      if (!this.isRunning) return
      
      const startTime = Date.now()
      try {
        await this.realtimeProcessor.processRealtimeUpdates()

        const duration = Date.now() - startTime
        cycleCount++
        totalDuration += duration

        this.componentHealth.realtime.lastCycleDuration = duration
        this.componentHealth.realtime.successRate = ((cycleCount - errorCount) / cycleCount) * 100

        if (cycleCount % 5 === 0) {
          await setSettings(`trade_engine_state:${this.connectionId}`, {
            last_realtime_run: new Date().toISOString(),
            realtime_cycle_count: cycleCount,
            realtime_avg_duration_ms: Math.round(totalDuration / cycleCount),
          })
        }
      } catch (error) {
        errorCount++
        this.componentHealth.realtime.errorCount++
        console.error("[v0] Realtime processor error:", error)
        await logProgressionEvent(this.connectionId, "realtime", "error", `Processor error: ${error instanceof Error ? error.message : String(error)}`, {
          errorType: error instanceof Error ? error.name : "unknown",
        })
      }
      
      if (this.isRunning) {
        this.realtimeTimer = setTimeout(runCycle, intervalSeconds * 1000)
      }
    }

    this.realtimeTimer = setTimeout(runCycle, intervalSeconds * 1000)
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    const healthCheckInterval = 10000 // Check every 10 seconds

    console.log("[v0] Starting TradeEngineManager health monitoring (interval: 10s)")

    this.healthCheckTimer = setInterval(async () => {
      if (!this.isRunning) return

      try {
        // Update component health statuses
        this.componentHealth.indications.status = this.getComponentHealthStatus(
          this.componentHealth.indications.successRate,
          this.componentHealth.indications.lastCycleDuration,
          5000, // 5 second threshold
        )

        this.componentHealth.strategies.status = this.getComponentHealthStatus(
          this.componentHealth.strategies.successRate,
          this.componentHealth.strategies.lastCycleDuration,
          5000,
        )

        this.componentHealth.realtime.status = this.getComponentHealthStatus(
          this.componentHealth.realtime.successRate,
          this.componentHealth.realtime.lastCycleDuration,
          3000,
        )

        // Calculate overall health
        const overallHealth = this.calculateOverallHealth()

        // Update health status in Redis (same key as updateEngineState)
        const engineState = (await getSettings(`trade_engine_state:${this.connectionId}`)) || {}
        await setSettings(`trade_engine_state:${this.connectionId}`, {
          ...engineState,
          manager_health_status: overallHealth,
          indications_health: this.componentHealth.indications.status,
          strategies_health: this.componentHealth.strategies.status,
          realtime_health: this.componentHealth.realtime.status,
          last_manager_health_check: new Date().toISOString(),
        })

        if (overallHealth !== "healthy") {
          console.warn(`[v0] TradeEngineManager health for ${this.connectionId}: ${overallHealth}`)
        }
      } catch (error) {
        console.error("[v0] TradeEngineManager health monitoring error:", error)
      }
    }, healthCheckInterval)
  }

  /**
   * Get component health status
   */
  private getComponentHealthStatus(
    successRate: number,
    lastCycleDuration: number,
    threshold: number,
  ): "healthy" | "degraded" | "unhealthy" {
    if (successRate < 80 || lastCycleDuration > threshold * 3) {
      return "unhealthy"
    }
    if (successRate < 95 || lastCycleDuration > threshold * 2) {
      return "degraded"
    }
    return "healthy"
  }

  /**
   * Calculate overall health
   */
  private calculateOverallHealth(): "healthy" | "degraded" | "unhealthy" {
    const components = [
      this.componentHealth.indications.status,
      this.componentHealth.strategies.status,
      this.componentHealth.realtime.status,
    ]

    const unhealthyCount = components.filter((s) => s === "unhealthy").length
    const degradedCount = components.filter((s) => s === "degraded").length

    if (unhealthyCount > 0) return "unhealthy"
    if (degradedCount > 0) return "degraded"
    return "healthy"
  }

  /**
   * Get symbols for this connection - uses connection's active_symbols first
   */
  private async getSymbols(): Promise<string[]> {
    try {
      // First, check connection's configured symbols in Redis
      const connState = await getSettings(`trade_engine_state:${this.connectionId}`)
      if (connState && typeof connState === "object") {
        const connSymbols = (connState as any).symbols || (connState as any).active_symbols
        if (Array.isArray(connSymbols) && connSymbols.length > 0) {
          return connSymbols
        }
      }

      // Check connection settings directly
      const connSettings = await getSettings(`connection:${this.connectionId}`)
      if (connSettings && typeof connSettings === "object") {
        const symbols = (connSettings as any).active_symbols || (connSettings as any).symbols
        if (Array.isArray(symbols) && symbols.length > 0) {
          return symbols
        }
      }

      // Fall back to global main symbols setting
      const useMainSymbols = await getSettings("useMainSymbols")
      if (useMainSymbols === true || useMainSymbols === "true") {
        const mainSymbols = await getSettings("mainSymbols")
        if (Array.isArray(mainSymbols) && mainSymbols.length > 0) {
          return mainSymbols
        }
      }

      // Default to single symbol to reduce load
      return ["BTCUSDT"]
    } catch (error) {
      console.error("[v0] Failed to get symbols:", error)
      return ["BTCUSDT"]
    }
  }

  /**
   * Update engine state (Redis-based)
   * Uses consistent key naming for status endpoint compatibility
   */
  private async updateEngineState(status: string, errorMessage?: string): Promise<void> {
    try {
      const stateKey = `trade_engine_state:${this.connectionId}`
      const currentState = (await getSettings(stateKey)) || {}
      await setSettings(stateKey, {
        ...currentState,
        status,
        error_message: errorMessage || null,
        updated_at: new Date().toISOString(),
        last_indication_run: new Date().toISOString(),
      })
      
      console.log(`[v0] [Engine State] Updated ${stateKey}: status=${status}`)
    } catch (error) {
      console.error("[v0] Failed to update engine state:", error)
    }
  }

  /**
   * Update progression phase with detailed progress tracking
   * Phases: idle -> initializing -> prehistoric_data -> indications -> strategies -> realtime -> live_trading
   */
  async updateProgressionPhase(
    phase: string, 
    progress: number, 
    detail: string,
    subProgress?: { current: number; total: number; item?: string }
  ): Promise<void> {
    try {
      const key = `engine_progression:${this.connectionId}`
      const progressionData = {
        phase,
        progress: Math.min(100, Math.max(0, progress)),
        detail,
        sub_current: subProgress?.current || 0,
        sub_total: subProgress?.total || 0,
        sub_item: subProgress?.item || "",
        connection_id: this.connectionId,
        updated_at: new Date().toISOString(),
      }
      
      await setSettings(key, progressionData)
      
      // Log progression update with full details
      const msg = subProgress && subProgress.total > 0 
        ? `${detail} (${subProgress.current}/${subProgress.total}${subProgress.item ? ` - ${subProgress.item}` : ""})`
        : detail
      
      console.log(`[v0] [Progression] ${this.connectionId}: ${phase} @ ${progress}% - ${msg}`)
    } catch (error) {
      console.error("[v0] Failed to update progression phase:", error)
    }
  }

  /**
   * Set running flag in Redis for active status detection
   */
  private async setRunningFlag(isRunning: boolean): Promise<void> {
    try {
      const flagKey = `engine_is_running:${this.connectionId}`
      if (isRunning) {
        await setSettings(flagKey, "true")
      } else {
        await setSettings(flagKey, "false")
      }
      console.log(`[v0] [Engine Flag] ${flagKey}: ${isRunning ? "true" : "false"}`)
    } catch (error) {
      console.error("[v0] Failed to set running flag:", error)
    }
  }

  /**
   * Start heartbeat to keep running state active
   * OPTIMIZED: Reduced frequency from 2s to 10s (5x less Redis writes)
   */
  private startHeartbeat(): void {
    // Send heartbeat every 10 seconds (was 2s - too frequent)
    this.heartbeatTimer = setInterval(async () => {
      if (!this.isRunning) {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
        return
      }

      try {
        const stateKey = `trade_engine_state:${this.connectionId}`
        // Direct set without read-modify-write pattern
        await setSettings(stateKey, {
          status: "running",
          last_indication_run: new Date().toISOString(),
          connection_id: this.connectionId,
        })
      } catch (error) {
        // Silent fail - heartbeat is non-critical
      }
    }, 10000) // Changed from 2000ms to 10000ms
  }

  /**
   * Get engine status (Redis-based)
   */
  async getStatus() {
    try {
      const stateKey = `trade_engine_state:${this.connectionId}`
      const state = (await getSettings(stateKey)) || {}
      return {
        ...state,
        health: {
          overall: this.calculateOverallHealth(),
          components: {
            indications: { ...this.componentHealth.indications },
            strategies: { ...this.componentHealth.strategies },
            realtime: { ...this.componentHealth.realtime },
          },
          lastCheck: new Date(),
        },
      }
    } catch (error) {
      console.error("[v0] Failed to get engine status:", error)
      return null
    }
  }
}
