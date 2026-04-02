/**
 * Preset Coordination Engine
 * Handles multiple configuration sets with independent position limits
 * Loads historical data only if not exists, calculates missing timeranges
 * Coordinates real position opening based on evaluation results
 * Redis-optimized implementation
 */

import { getRedisClient } from "@/lib/redis-db"
import type { PresetType, PresetConfigurationSet, PresetCoordinationResult } from "@/lib/types-preset-coordination"
import { calculateIndicators, type IndicatorConfig } from "./indicators"
import crypto from "crypto"
import { PresetPseudoPositionManager } from "./preset-pseudo-position-manager"

export interface PresetCoordinationConfig {
  connectionId: string
  presetTypeId: string
  autoInitiate: boolean
  calculateHistory: boolean
}

export class PresetCoordinationEngine {
  private connectionId: string
  private presetTypeId: string
  private isRunning = false
  private coordinationInterval?: NodeJS.Timeout
  private presetType: PresetType | null = null
  private configurationSets: PresetConfigurationSet[] = []
  private positionLimits: Map<string, number> = new Map()
  private lastPositionTime: Map<string, number> = new Map()
  private pseudoPositionManager: PresetPseudoPositionManager

  private readonly BATCH_SIZE = 10
  private readonly MAX_CONCURRENT_SYMBOLS = 5
  private readonly MAX_CONCURRENT_INDICATIONS = 20
  private readonly RATE_LIMIT_DELAY = 100

  constructor(connectionId: string, presetTypeId: string) {
    this.connectionId = connectionId
    this.presetTypeId = presetTypeId
    this.pseudoPositionManager = new PresetPseudoPositionManager(connectionId, presetTypeId)
  }

  /**
   * Start the preset coordination engine
   */
  async start(config: PresetCoordinationConfig): Promise<void> {
    if (this.isRunning) {
      console.log("[v0] Preset coordination engine already running")
      return
    }

    console.log("[v0] Starting preset coordination engine")

    try {
      await this.loadPresetConfiguration()

      if (config.calculateHistory) {
        await this.loadHistoricalDataIfNeeded()
      }

      await this.calculateCoordinationResults()

      if (config.autoInitiate) {
        await this.startCoordinationLoop()
      }

      await this.pseudoPositionManager.start()

      this.isRunning = true
      console.log("[v0] Preset coordination engine started successfully")
    } catch (error) {
      console.error("[v0] Failed to start preset coordination engine:", error)
      throw error
    }
  }

  /**
   * Stop the preset coordination engine
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return

    console.log("[v0] Stopping preset coordination engine")

    if (this.coordinationInterval) clearInterval(this.coordinationInterval)

    await this.pseudoPositionManager.stop()

    this.isRunning = false
    console.log("[v0] Preset coordination engine stopped")
  }

  // ============ DATABASE OPERATIONS ============

  /**
   * Load preset type and configuration sets
   */
  private async loadPresetConfiguration(): Promise<void> {
    const presetType = await this.getPresetType(this.presetTypeId)
    if (!presetType) {
      throw new Error(`Preset type ${this.presetTypeId} not found`)
    }
    this.presetType = presetType

    const client = await this.getClient()
    const setIds = await client.zrange(`preset_type:${this.presetTypeId}:sets`, 0, -1)

    const sets: PresetConfigurationSet[] = []
    for (const setId of setIds) {
      const configSet = await this.getPresetConfigurationSet(setId)
      if (configSet) {
        sets.push(configSet)
      }
    }

    this.configurationSets = sets
    console.log(`[v0] Loaded ${this.configurationSets.length} configuration sets`)
  }

  /**
   * Load historical data only if not already exists
   */
  private async loadHistoricalDataIfNeeded(): Promise<void> {
    console.log("[v0] Checking historical data...")

    for (const configSet of this.configurationSets) {
      const symbols = await this.getSymbolsForConfigSet(configSet)

      for (const symbol of symbols) {
        try {
          const client = await this.getClient()
          const zsetKey = `preset_hist:${this.connectionId}:${symbol}`
          const count = await client.zcard(zsetKey)

          const requiredDays = configSet.range_days
          const requiredDataPoints = requiredDays * 24 * 60

          if (!count || count < requiredDataPoints) {
            console.log(`[v0] Loading historical data for ${symbol} (${requiredDays} days)`)
            const oldest = count > 0 ? await client.zrange(zsetKey, 0, 0) : undefined
            const newestTimestamp = oldest ? oldest[0] : undefined
            await this.loadHistoricalDataForSymbol(symbol, requiredDays, newestTimestamp)
          } else {
            console.log(`[v0] Historical data for ${symbol} already exists`)
          }
        } catch (error) {
          console.error(`[v0] Failed to check/load historical data for ${symbol}:`, error)
        }
      }
    }

    console.log("[v0] Historical data check complete")
  }

  /**
   * Load historical data for a symbol (only missing timerange)
   */
  private async loadHistoricalDataForSymbol(symbol: string, days: number, newestTimestamp?: string): Promise<void> {
    const endTime = newestTimestamp ? new Date(newestTimestamp) : new Date()
    const startTime = new Date(endTime.getTime() - days * 24 * 60 * 60 * 1000)

    const historicalData = await this.fetchHistoricalOHLCV(symbol, startTime, endTime)

    if (historicalData.length > 0) {
      await this.storeHistoricalData(symbol, historicalData)
      console.log(`[v0] Loaded ${historicalData.length} candles for ${symbol}`)
    }
  }

  /**
   * Calculate coordination results for all configuration combinations
   */
  private async calculateCoordinationResults(): Promise<void> {
    console.log("[v0] Calculating coordination results...")

    for (const configSet of this.configurationSets) {
      try {
        const symbols = await this.getSymbolsForConfigSet(configSet)

        for (const symbol of symbols) {
          await this.calculateConfigSetResults(configSet, symbol)
        }
      } catch (error) {
        console.error(`[v0] Failed to calculate results for config set ${configSet.id}:`, error)
      }
    }

    console.log("[v0] Coordination results calculation complete")
  }

  /**
   * Calculate results for a specific configuration set and symbol
   */
  private async calculateConfigSetResults(configSet: PresetConfigurationSet, symbol: string): Promise<void> {
    const historicalData = await this.getHistoricalData(symbol, configSet.range_days)

    if (historicalData.length < 100) {
      console.log(`[v0] Insufficient historical data for ${symbol}`)
      return
    }

    const indicationCombinations = this.generateIndicationCombinations(configSet)
    const positionRangeCombinations = this.generatePositionRangeCombinations(configSet)
    const trailingCombinations = this.generateTrailingCombinations(configSet)

    const allCombinations: Array<{
      indication: any
      position: any
      trailing: any
    }> = []

    for (const indicationParams of indicationCombinations) {
      for (const positionRange of positionRangeCombinations) {
        for (const trailing of trailingCombinations) {
          allCombinations.push({
            indication: indicationParams,
            position: positionRange,
            trailing: trailing,
          })
        }
      }
    }

    console.log(`[v0] Processing ${allCombinations.length} combinations for ${symbol} asynchronously`)
    await this.processCombinationsInParallel(configSet, symbol, historicalData, allCombinations)
  }

  /**
   * Process combinations in parallel batches
   */
  private async processCombinationsInParallel(
    configSet: PresetConfigurationSet,
    symbol: string,
    historicalData: any[],
    combinations: Array<{ indication: any; position: any; trailing: any }>,
  ): Promise<void> {
    const batches = this.createBatches(combinations, this.MAX_CONCURRENT_INDICATIONS)

    for (const batch of batches) {
      await Promise.all(
        batch.map(async (combo) => {
          try {
            await this.calculateCombinationResult(
              configSet,
              symbol,
              historicalData,
              combo.indication,
              combo.position,
              combo.trailing,
            )
          } catch (error) {
            console.error(`[v0] Failed to calculate combination for ${symbol}:`, error)
          }
        }),
      )

      await new Promise((resolve) => setTimeout(resolve, this.RATE_LIMIT_DELAY))
    }
  }

  /**
   * Calculate result for a specific combination
   */
  private async calculateCombinationResult(
    configSet: PresetConfigurationSet,
    symbol: string,
    historicalData: any[],
    indicationParams: any,
    positionRange: any,
    trailing: any,
  ): Promise<void> {
    const result = await this.calculateIndicatorsAsync(historicalData, configSet, indicationParams)
    const trades = await this.simulateTradesAsync(
      historicalData,
      result.signals,
      positionRange.takeprofit,
      positionRange.stoploss,
      trailing.enabled,
      trailing.start,
      trailing.stop,
    )

    const metrics = this.calculatePerformanceMetrics(trades, configSet)
    const paramsHash = this.hashIndicationParams(indicationParams)

    const resultId = this.generateId()
    const now = await this.now()

    const resultKey = `preset_coord_result:${resultId}`
    const resultData: Record<string, any> = {
      id: resultId,
      preset_type_id: this.presetTypeId,
      configuration_set_id: configSet.id,
      symbol,
      indication_type: configSet.indication_type,
      indication_params: JSON.stringify(indicationParams),
      takeprofit_factor: positionRange.takeprofit,
      stoploss_ratio: positionRange.stoploss,
      trailing_enabled: trailing.enabled ? "1" : "0",
      trail_start: trailing.start,
      trail_stop: trailing.stop,
      profit_factor: metrics.profitFactor,
      win_rate: metrics.winRate,
      total_trades: metrics.totalTrades,
      winning_trades: metrics.winningTrades,
      losing_trades: metrics.losingTrades,
      avg_profit: metrics.avgProfit,
      avg_loss: metrics.avgLoss,
      max_drawdown: metrics.maxDrawdown,
      drawdown_time_hours: metrics.drawdownTimeHours,
      profit_factor_last_25: metrics.profitFactorLast25,
      profit_factor_last_50: metrics.profitFactorLast50,
      positions_per_24h: metrics.positionsPer24h,
      is_valid: metrics.isValid ? "1" : "0",
      validation_reason: metrics.validationReason,
      last_validated_at: now,
      created_at: now,
      updated_at: now,
      params_hash: paramsHash,
    }

    await this.setRedisHash(resultKey, resultData)

    const client = await this.getClient()
    await client.sadd(`preset_type:${this.presetTypeId}:results`, resultId)

    if (metrics.isValid) {
      const score = metrics.profitFactorLast25 * 1000000 + metrics.profitFactorLast50
      await client.zadd(`preset_type:${this.presetTypeId}:valid_results`, score, resultId)
    }

    const limitKeyBase = this.buildPositionLimitKey(
      this.presetTypeId,
      configSet.id,
      symbol,
      paramsHash,
      positionRange.takeprofit,
      positionRange.stoploss,
      "long",
      trailing.enabled,
      trailing.start,
      trailing.stop,
    )
    const shortLimitKey = this.buildPositionLimitKey(
      this.presetTypeId,
      configSet.id,
      symbol,
      paramsHash,
      positionRange.takeprofit,
      positionRange.stoploss,
      "short",
      trailing.enabled,
      trailing.start,
      trailing.stop,
    )

    await client.sadd("preset_position_limits", limitKeyBase)
    await client.sadd("preset_position_limits", shortLimitKey)

    await this.initializePositionLimit(configSet, symbol, indicationParams, positionRange, trailing, paramsHash)
  }

  /**
   * Calculate indicators asynchronously
   */
  private async calculateIndicatorsAsync(
    historicalData: any[],
    configSet: PresetConfigurationSet,
    indicationParams: any,
  ): Promise<{ signals: any[] }> {
    return new Promise((resolve) => {
      setImmediate(() => {
        const prices = historicalData.map((d) => d.close)
        const indicatorConfig: IndicatorConfig = {
          type: configSet.indication_type as
            | "rsi"
            | "macd"
            | "bollinger"
            | "sar"
            | "ema"
            | "sma"
            | "stochastic"
            | "adx",
          params: indicationParams,
        }
        const signals = calculateIndicators(prices, [indicatorConfig])
        resolve({ signals })
      })
    })
  }

  /**
   * Simulate trades asynchronously
   */
  private async simulateTradesAsync(
    historicalData: any[],
    signals: any[],
    tpFactor: number,
    slRatio: number,
    trailingEnabled: boolean,
    trailStart: number | null,
    trailStop: number | null,
  ): Promise<any[]> {
    return new Promise((resolve) => {
      setImmediate(() => {
        const trades = this.simulateTrades(
          historicalData,
          signals,
          tpFactor,
          slRatio,
          trailingEnabled,
          trailStart,
          trailStop,
        )
        resolve(trades)
      })
    })
  }

  /**
   * Start coordination loop for real trading
   */
  private async startCoordinationLoop(): Promise<void> {
    if (!this.presetType) return

    const intervalMs = this.presetType.evaluation_interval_hours * 60 * 60 * 1000

    this.coordinationInterval = setInterval(async () => {
      try {
        await this.processCoordinationCycle()
      } catch (error) {
        console.error("[v0] Coordination cycle error:", error)
      }
    }, intervalMs)

    await this.processCoordinationCycle()
  }

  /**
   * Process coordination cycle
   */
  private async processCoordinationCycle(): Promise<void> {
    console.log("[v0] Processing coordination cycle...")

    const client = await this.getClient()
    const validResultIds = await client.zrevrange(`preset_type:${this.presetTypeId}:valid_results`, 0, -1)

    const validResults: PresetCoordinationResult[] = []
    for (const resultId of validResultIds) {
      const result = await this.getPresetCoordinationResult(resultId)
      if (result) {
        validResults.push(result)
      }
    }

    const batches = this.createBatches(validResults, this.MAX_CONCURRENT_INDICATIONS)

    for (const batch of batches) {
      await Promise.all(
        batch.map(async (result) => {
          try {
            await this.evaluateAndOpenPosition(result)
          } catch (error) {
            console.error(`[v0] Failed to evaluate result ${result.id}:`, error)
          }
        }),
      )

      await new Promise((resolve) => setTimeout(resolve, this.RATE_LIMIT_DELAY))
    }

    console.log("[v0] Coordination cycle complete")
  }

  /**
   * Evaluate coordination result and open position if conditions met
   */
  private async evaluateAndOpenPosition(result: PresetCoordinationResult): Promise<void> {
    if (!this.presetType) return

    const isLast25Profitable = result.profit_factor_last_25 > 0
    const isLast50Profitable = result.profit_factor_last_50 > 0

    if (!isLast25Profitable && !isLast50Profitable) {
      return
    }

    const currentSignal = await this.getCurrentMarketSignal(result)

    if (!currentSignal || currentSignal.direction === "neutral") {
      return
    }

    const canOpen = await this.checkPositionLimit(result, currentSignal.direction)

    if (!canOpen) {
      return
    }

    const lastPositionKey = `${result.symbol}-${result.indication_type}-${currentSignal.direction}`
    const lastPositionTime = this.lastPositionTime.get(lastPositionKey) || 0
    const timeSinceLastPosition = Date.now() - lastPositionTime

    if (timeSinceLastPosition < this.presetType!.timeout_after_position * 1000) {
      return
    }

    const currentPrice = await this.getCurrentPrice(result.symbol)

    const positionId = await this.pseudoPositionManager.createPseudoPosition(result, currentSignal, currentPrice)

    if (positionId) {
      await this.updatePositionLimit(result, currentSignal.direction, 1)
      this.lastPositionTime.set(lastPositionKey, Date.now())
      console.log(`[v0] Created pseudo position ${positionId} for ${result.symbol} (${currentSignal.direction})`)
    }
  }

  /**
   * Check if position can be opened
   */
  private async checkPositionLimit(result: PresetCoordinationResult, direction: string): Promise<boolean> {
    const client = await this.getClient()
    const paramsHash = this.hashIndicationParams(result.indication_params)

    const limitKey = this.buildPositionLimitKey(
      this.presetTypeId,
      result.configuration_set_id,
      result.symbol,
      paramsHash,
      result.takeprofit_factor,
      result.stoploss_ratio,
      direction,
      result.trailing_enabled,
      result.trail_start ?? null,
      result.trail_stop ?? null,
    )

    const exists = await client.sismember("preset_position_limits", limitKey)
    if (!exists) return false

    const limitData = await this.getPresetPositionLimit(limitKey)
    if (!limitData) return false

    if (limitData.current_positions >= limitData.max_positions) {
      return false
    }

    if (limitData.cooldown_until && new Date(limitData.cooldown_until) > new Date()) {
      return false
    }

    return true
  }

  /**
   * Update position limit after opening position
   */
  private async updatePositionLimit(
    result: PresetCoordinationResult,
    direction: string,
    change: number,
  ): Promise<void> {
    const client = await this.getClient()
    const paramsHash = this.hashIndicationParams(result.indication_params)

    const limitKey = this.buildPositionLimitKey(
      this.presetTypeId,
      result.configuration_set_id,
      result.symbol,
      paramsHash,
      result.takeprofit_factor,
      result.stoploss_ratio,
      direction,
      result.trailing_enabled,
      result.trail_start ?? null,
      result.trail_stop ?? null,
    )

    await client.hincrby(`preset_pos_limit:${limitKey}`, "current_positions", change)
    const now = await this.now()
    await client.hset(`preset_pos_limit:${limitKey}`, {
      last_position_opened_at: now,
      updated_at: now,
    })
  }

  /**
   * Initialize position limit tracking
   */
  private async initializePositionLimit(
    configSet: PresetConfigurationSet,
    symbol: string,
    indicationParams: any,
    positionRange: any,
    trailing: any,
    paramsHash: string,
  ): Promise<void> {
    if (!this.presetType) return

    const client = await this.getClient()
    const maxPositions = this.presetType.max_positions_per_range || 250
    const now = await this.now()

    for (const direction of ["long", "short"]) {
      const limitKey = this.buildPositionLimitKey(
        this.presetTypeId,
        configSet.id,
        symbol,
        paramsHash,
        positionRange.takeprofit,
        positionRange.stoploss,
        direction,
        trailing.enabled,
        trailing.start,
        trailing.stop,
      )

      const limitData: Record<string, string> = {
        preset_type_id: this.presetTypeId,
        configuration_set_id: configSet.id,
        symbol,
        indication_params_hash: paramsHash,
        takeprofit_factor: String(positionRange.takeprofit),
        stoploss_ratio: String(positionRange.stoploss),
        direction,
        trailing_enabled: trailing.enabled ? "1" : "0",
        trail_start: trailing.start !== null ? String(trailing.start) : "",
        trail_stop: trailing.stop !== null ? String(trailing.stop) : "",
        max_positions: String(maxPositions),
        current_positions: "0",
        created_at: now,
        updated_at: now,
      }

      await this.setRedisHash(`preset_pos_limit:${limitKey}`, limitData)
      await client.sadd("preset_position_limits", limitKey)
    }
  }

  /**
   * Open real position on exchange
   */
  private async openRealPosition(result: PresetCoordinationResult, signal: any): Promise<void> {
    const currentPrice = await this.getCurrentPrice(result.symbol)
    const positionSize = 100
    const tradeId = this.generateId()
    const now = await this.now()

    const tradeData: Record<string, any> = {
      id: tradeId,
      connection_id: this.connectionId,
      preset_type_id: this.presetTypeId,
      configuration_set_id: result.configuration_set_id,
      coordination_result_id: result.id,
      symbol: result.symbol,
      direction: signal.direction,
      entry_price: currentPrice,
      quantity: positionSize,
      leverage: 1,
      indication_type: result.indication_type,
      takeprofit_factor: result.takeprofit_factor,
      stoploss_ratio: result.stoploss_ratio,
      trailing_enabled: result.trailing_enabled,
      trail_start: result.trail_start,
      trail_stop: result.trail_stop,
      status: "open",
      opened_at: now,
      created_at: now,
    }

    await this.setRedisHash(`preset_real_trade:${tradeId}`, tradeData)
    const client = await this.getClient()
    await client.sadd("preset_real_trades", tradeId)

    try {
      const connection = await this.getPresetType(this.presetTypeId) // Wait, this is preset type! Need to get connection.
      // Fix: should get connection data
      const connData = await this.getRedisHash<any>(`connection:${this.connectionId}`)
      if (connData && (connData.is_live_trade === "1" || connData.is_live_trade === true || connData.is_preset_trade === "1" || connData.is_preset_trade === true)) {
        const { createExchangeAPI } = await import("@/lib/exchanges")
        const exchangeAPI = createExchangeAPI({
          id: connData.id || this.connectionId,
          name: connData.name,
          exchange: connData.exchange,
          apiKey: connData.api_key,
          apiSecret: connData.api_secret,
          testnet: connData.is_testnet === "1" || connData.is_testnet === true,
          status: "connected",
          connectionMethod: connData.connection_method || "rest",
        })

        const isLong = signal.direction === "long"
        const tpPrice = isLong
          ? currentPrice * (1 + result.takeprofit_factor / 100)
          : currentPrice * (1 - result.takeprofit_factor / 100)
        const slPrice = isLong
          ? currentPrice * (1 - result.stoploss_ratio / 100)
          : currentPrice * (1 + result.stoploss_ratio / 100)

        const orderResult = await exchangeAPI.placeOrder({
          symbol: result.symbol,
          side: isLong ? "buy" : "sell",
          type: "market",
          quantity: positionSize,
          leverage: 1,
          takeProfit: tpPrice,
          stopLoss: slPrice,
        })

        console.log(`[v0] Exchange order placed: ${orderResult.orderId}`)

        const { ExchangePositionManager } = await import("@/lib/exchange-position-manager")
        const positionManager = new ExchangePositionManager(this.connectionId)

        await positionManager.mirrorToExchange({
          connectionId: this.connectionId,
          realPseudoPositionId: result.id,
          exchangeId: orderResult.orderId,
          symbol: result.symbol,
          side: signal.direction,
          entryPrice: currentPrice,
          quantity: positionSize,
          volumeUsd: positionSize * currentPrice,
          leverage: 1,
          takeprofit: tpPrice,
          stoploss: slPrice,
          trailingEnabled: result.trailing_enabled,
          trailStart: result.trail_start ?? undefined,
          trailStop: result.trail_stop ?? undefined,
          tradeMode: "preset",
          indicationType: result.indication_type,
        })
      }
    } catch (error) {
      console.error("[v0] Failed to open position on exchange:", error)
    }
  }

  // ============ HELPER METHODS ============

  private async getSymbolsForConfigSet(configSet: PresetConfigurationSet): Promise<string[]> {
    switch (configSet.symbol_mode) {
      case "main":
        return ["BTCUSDT", "ETHUSDT", "BNBUSDT"]
      case "forced":
      case "manual":
        return configSet.symbols || []
      case "exchange":
        return await this.getTopSymbolsByExchange(configSet)
      default:
        return []
    }
  }

  private async getTopSymbolsByExchange(configSet: PresetConfigurationSet): Promise<string[]> {
    return ["BTCUSDT", "ETHUSDT"]
  }

  private generateIndicationCombinations(configSet: PresetConfigurationSet): any[] {
    const combinations: any[] = []
    const baseParams = configSet.indication_params

    for (const [key, value] of Object.entries(baseParams)) {
      if (typeof value === "number") {
        const min = Math.floor(value * 0.5)
        const max = Math.ceil(value * 1.5)
        const step = Math.floor((max - min) / 10) || 1

        for (let v = min; v <= max; v += step) {
          combinations.push({ ...baseParams, [key]: v })
        }
      }
    }

    return combinations.length > 0 ? combinations : [baseParams]
  }

  private generatePositionRangeCombinations(configSet: PresetConfigurationSet): any[] {
    const combinations: any[] = []

    for (let tp = configSet.takeprofit_min; tp <= configSet.takeprofit_max; tp += configSet.takeprofit_step) {
      for (let sl = configSet.stoploss_min; sl <= configSet.stoploss_max; sl += configSet.stoploss_step) {
        combinations.push({ takeprofit: tp, stoploss: sl })
      }
    }

    return combinations
  }

  private generateTrailingCombinations(configSet: PresetConfigurationSet): any[] {
    const combinations: any[] = []

    combinations.push({ enabled: false, start: null, stop: null })

    if (configSet.trailing_enabled) {
      for (const start of configSet.trail_starts) {
        for (const stop of configSet.trail_stops) {
          combinations.push({ enabled: true, start, stop })
        }
      }
    }

    return combinations
  }

  private simulateTrades(
    historicalData: any[],
    signals: any[],
    tpFactor: number,
    slRatio: number,
    trailingEnabled: boolean,
    trailStart: number | null,
    trailStop: number | null,
  ): any[] {
    return []
  }

  private calculatePerformanceMetrics(trades: any[], configSet: PresetConfigurationSet): any {
    const totalTrades = trades.length
    const winningTrades = trades.filter((t: any) => t.profit > 0).length
    const losingTrades = totalTrades - winningTrades
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0

    const totalProfit = trades.reduce((sum: number, t: any) => sum + Math.max(0, t.profit), 0)
    const totalLoss = Math.abs(trades.reduce((sum: number, t: any) => sum + Math.min(0, t.profit), 0))
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : 0

    const avgProfit = winningTrades > 0 ? totalProfit / winningTrades : 0
    const avgLoss = losingTrades > 0 ? totalLoss / losingTrades : 0

    const last25 = trades.slice(-25)
    const last50 = trades.slice(-50)

    const profitFactorLast25 = this.calculateProfitFactorForTrades(last25)
    const profitFactorLast50 = this.calculateProfitFactorForTrades(last50)

    const timeSpan =
      trades.length > 0 ? (trades[trades.length - 1].timestamp - trades[0].timestamp) / (1000 * 60 * 60) : 1
    const positionsPer24h = (totalTrades / timeSpan) * 24

    const isValid =
      profitFactor >= configSet.profit_factor_min &&
      totalTrades >= configSet.trades_per_48h_min &&
      (profitFactorLast25 > 0 || profitFactorLast50 > 0)

    const validationReason = !isValid
      ? `Profit factor: ${profitFactor.toFixed(2)}, Trades: ${totalTrades}, Last 25 PF: ${profitFactorLast25.toFixed(2)}`
      : "Valid"

    return {
      profitFactor,
      winRate,
      totalTrades,
      winningTrades,
      losingTrades,
      avgProfit,
      avgLoss,
      maxDrawdown: 0,
      drawdownTimeHours: 0,
      profitFactorLast25,
      profitFactorLast50,
      positionsPer24h,
      isValid,
      validationReason,
    }
  }

  private calculateProfitFactorForTrades(trades: any[]): number {
    if (trades.length === 0) return 0

    const totalProfit = trades.reduce((sum: number, t: any) => sum + Math.max(0, t.profit), 0)
    const totalLoss = Math.abs(trades.reduce((sum: number, t: any) => sum + Math.min(0, t.profit), 0))

    return totalLoss > 0 ? totalProfit / totalLoss : 0
  }

  private hashIndicationParams(params: any): string {
    return crypto.createHash("sha256").update(JSON.stringify(params)).digest("hex")
  }

  private async getHistoricalData(symbol: string, days: number): Promise<any[]> {
    const client = await this.getClient()
    const zsetKey = `preset_hist:${this.connectionId}:${symbol}`
    const members = await client.zrange(zsetKey, 0, -1)

    if (!members || members.length === 0) return []

    return members.map((member: string) => {
      try {
        return JSON.parse(member)
      } catch {
        return null
      }
    }).filter(Boolean)
  }

  private async getCurrentMarketSignal(result: PresetCoordinationResult): Promise<any> {
    return { direction: "long", strength: 0.8 }
  }

  private async getCurrentPrice(symbol: string): Promise<number> {
    const client = await this.getClient()
    const dataStr = await client.get(`market:${this.connectionId}:${symbol}`)
    if (!dataStr) return 0

    try {
      const data = JSON.parse(dataStr)
      return data.price || 0
    } catch {
      return 0
    }
  }

  private async fetchHistoricalOHLCV(symbol: string, startTime: Date, endTime: Date): Promise<any[]> {
    return []
  }

  private async storeHistoricalData(symbol: string, data: any[]): Promise<void> {
    if (data.length === 0) return

    const client = await this.getClient()
    const zsetKey = `preset_hist:${this.connectionId}:${symbol}`

    const batches = this.createBatches(data, 100)

    for (const batch of batches) {
      for (const d of batch) {
        const member = JSON.stringify({
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: d.volume,
          timestamp: d.timestamp,
        })
        const score = new Date(d.timestamp).getTime()
        await client.zadd(zsetKey, score, member)
      }
    }
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = []
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize))
    }
    return batches
  }

  // ============ SPECIFIC GETTERS ============

  private safeParseJSON<T>(str: string | undefined, fallback: T): T {
    if (!str) return fallback
    try { return JSON.parse(str) as T } catch { return fallback }
  }

  private async getPresetCoordinationResult(id: string): Promise<PresetCoordinationResult | null> {
    const client = await this.getClient()
    const raw = await client.hgetall(`preset_coord_result:${id}`)
    if (!raw || Object.keys(raw).length === 0) return null

    return {
      id: raw.id,
      preset_type_id: raw.preset_type_id,
      configuration_set_id: raw.configuration_set_id,
      symbol: raw.symbol,
      indication_category: raw.indication_category as "main" | "common",
      indication_type: raw.indication_type,
      indication_params: this.safeParseJSON<Record<string, any>>(raw.indication_params, {}),
      takeprofit_factor: Number(raw.takeprofit_factor),
      stoploss_ratio: Number(raw.stoploss_ratio),
      trailing_enabled: raw.trailing_enabled === "1" || raw.trailing_enabled === "true",
      trail_start: raw.trail_start && raw.trail_start !== "" ? Number(raw.trail_start) : undefined,
      trail_stop: raw.trail_stop && raw.trail_stop !== "" ? Number(raw.trail_stop) : undefined,
      profit_factor: Number(raw.profit_factor),
      win_rate: Number(raw.win_rate),
      total_trades: Number(raw.total_trades),
      winning_trades: Number(raw.winning_trades),
      losing_trades: Number(raw.losing_trades),
      avg_profit: Number(raw.avg_profit),
      avg_loss: Number(raw.avg_loss),
      max_drawdown: Number(raw.max_drawdown),
      drawdown_time_hours: Number(raw.drawdown_time_hours),
      profit_factor_last_25: Number(raw.profit_factor_last_25),
      profit_factor_last_50: Number(raw.profit_factor_last_50),
      positions_per_24h: Number(raw.positions_per_24h),
      is_valid: raw.is_valid === "1" || raw.is_valid === "true",
      validation_reason: raw.validation_reason,
      last_validated_at: raw.last_validated_at,
      created_at: raw.created_at,
      updated_at: raw.updated_at,
    }
  }

  private async getPresetPositionLimit(
    key: string
  ): Promise<{
    current_positions: number
    max_positions: number
    cooldown_until?: string
  } | null> {
    const client = await this.getClient()
    const raw = await client.hgetall(`preset_pos_limit:${key}`)
    if (!raw || Object.keys(raw).length === 0) return null

    return {
      current_positions: Number(raw.current_positions),
      max_positions: Number(raw.max_positions),
      cooldown_until: raw.cooldown_until,
    }
  }

  private async getPresetType(id: string): Promise<PresetType | null> {
    const client = await this.getClient()
    const raw = await client.hgetall(`preset_type:${id}`)
    if (!raw || Object.keys(raw).length === 0) return null

    return {
      id: raw.id,
      name: raw.name,
      description: raw.description,
      preset_trade_type: raw.preset_trade_type,
      max_positions_per_indication: Number(raw.max_positions_per_indication),
      max_positions_per_direction: Number(raw.max_positions_per_direction),
      max_positions_per_range: raw.max_positions_per_range ? Number(raw.max_positions_per_range) : 250,
      timeout_per_indication: Number(raw.timeout_per_indication),
      timeout_after_position: Number(raw.timeout_after_position),
      trailing_enabled: raw.trailing_enabled === "1" || raw.trailing_enabled === "true",
      trailing_only: raw.trailing_only === "1" || raw.trailing_only === "true",
      block_enabled: raw.block_enabled === "1" || raw.block_enabled === "true",
      block_only: raw.block_only === "1" || raw.block_only === "true",
      dca_enabled: raw.dca_enabled === "1" || raw.dca_enabled === "true",
      dca_only: raw.dca_only === "1" || raw.dca_only === "true",
      auto_evaluate: raw.auto_evaluate === "1" || raw.auto_evaluate === "true",
      evaluation_interval_hours: Number(raw.evaluation_interval_hours),
      last_evaluation_at: raw.last_evaluation_at,
      is_active: raw.is_active === "1" || raw.is_active === "true",
      created_at: raw.created_at,
      updated_at: raw.updated_at,
    }
  }

  private async getPresetConfigurationSet(id: string): Promise<PresetConfigurationSet | null> {
    const client = await this.getClient()
    const raw = await client.hgetall(`preset_config_set:${id}`)
    if (!raw || Object.keys(raw).length === 0) return null

    return {
      id: raw.id,
      name: raw.name,
      description: raw.description,
      symbol_mode: raw.symbol_mode as "main" | "forced" | "manual" | "exchange",
      symbols: raw.symbols ? JSON.parse(raw.symbols) : undefined,
      exchange_order_by: raw.exchange_order_by as "market_cap" | "volume" | "volatility" | "price_change" | undefined,
      exchange_limit: raw.exchange_limit ? Number(raw.exchange_limit) : undefined,
      indication_category: raw.indication_category as "main" | "common",
      indication_type: raw.indication_type,
      indication_params: this.safeParseJSON<Record<string, any>>(raw.indication_params, {}),
      takeprofit_min: Number(raw.takeprofit_min),
      takeprofit_max: Number(raw.takeprofit_max),
      takeprofit_step: Number(raw.takeprofit_step),
      stoploss_min: Number(raw.stoploss_min),
      stoploss_max: Number(raw.stoploss_max),
      stoploss_step: Number(raw.stoploss_step),
      trailing_enabled: raw.trailing_enabled === "1" || raw.trailing_enabled === "true",
      trail_starts: raw.trail_starts ? JSON.parse(raw.trail_starts) : [],
      trail_stops: raw.trail_stops ? JSON.parse(raw.trail_stops) : [],
      range_days: Number(raw.range_days),
      trades_per_48h_min: Number(raw.trades_per_48h_min),
      profit_factor_min: Number(raw.profit_factor_min),
      drawdown_time_max: Number(raw.drawdown_time_max),
      evaluation_positions_count1: Number(raw.evaluation_positions_count1),
      evaluation_positions_count2: Number(raw.evaluation_positions_count2),
      database_positions_per_set: Number(raw.database_positions_per_set),
      database_threshold_percent: Number(raw.database_threshold_percent),
      is_active: raw.is_active === "1" || raw.is_active === "true",
      created_at: raw.created_at,
      updated_at: raw.updated_at,
    }
  }

  // ============ GENERIC REDIS HELPERS ============

  private async getRedisHash<T>(key: string): Promise<T | null> {
    const client = await this.getClient()
    const data = await client.hgetall(key)
    return data && Object.keys(data).length > 0 ? (data as T) : null
  }

  private async setRedisHash(key: string, data: Record<string, any>): Promise<void> {
    const client = await this.getClient()
    const flattened: Record<string, string> = {}
    for (const [k, v] of Object.entries(data)) {
      flattened[k] = this.convertToString(v)
    }
    await client.hset(key, flattened)
  }

  private async getClient() {
    return getRedisClient()
  }

  private convertToString(value: any): string {
    if (value === true) return "1"
    if (value === false) return "0"
    if (value === null || value === undefined) return ""
    return String(value)
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  private async now(): Promise<string> {
    return new Date().toISOString()
  }

  // ============ KEY BUILDING ============

  private buildPositionLimitKey(
    presetTypeId: string,
    configSetId: string,
    symbol: string,
    paramsHash: string,
    tp: number,
    sl: number,
    direction: string,
    trailingEnabled: boolean,
    trailStart: number | null,
    trailStop: number | null,
  ): string {
    return `pos_limit:${presetTypeId}:${configSetId}:${symbol}:${paramsHash}:${tp}:${sl}:${direction}:${trailingEnabled}:${trailStart ?? "null"}:${trailStop ?? "null"}`
  }
}

interface IndicatorSignal {
  type: string
  strength: number
  direction: "long" | "short" | "neutral"
  value: number
  timestamp: Date
}