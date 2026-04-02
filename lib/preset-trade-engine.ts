/**
 * Production-Ready Preset Trade Engine (Redis Version)
 * Supports both MAIN INDICATIONS (Direction/Move/Active/Optimal) and
 * COMMON INDICATORS (RSI, MACD, Bollinger, ParabolicSAR, ADX, ATR, etc.)
 * Wider TP/SL ranges for short-term trading (starting from factor 2)
 * Optimized for performance, rate limits, and production trading
 */

import { getRedisClient } from "@/lib/db"
import { TechnicalIndicators, calculateIndicators, type IndicatorConfig, type IndicatorSignal } from "./indicators"
import { IndicationEngine } from "./indications"
import { INDICATION_CATEGORIES, type IndicationCategory } from "./constants/types"

// Define a type for IndicationResult for better type safety
interface LocalIndicationResult {
  type: string
  symbol: string
  signal: "bullish" | "bearish" | "neutral"
  entry_price: number
  step?: number
  strength?: number
  signal_strength?: number
}

function transformIndicationResult(
  result: { signal_strength?: number; entry_price: number; type: string; symbol: string } | null,
  indicationType: string,
  symbol: string,
): LocalIndicationResult | null {
  if (!result) return null
  const signalStrength = result.signal_strength || 0
  return {
    type: indicationType,
    symbol: symbol,
    signal: signalStrength > 0 ? "bullish" : signalStrength < 0 ? "bearish" : "neutral",
    entry_price: result.entry_price,
    signal_strength: signalStrength,
    strength: Math.abs(signalStrength),
  }
}

export interface PresetTradeEngineConfig {
  connectionId: string
  presetId: string
  symbols: string[]
  mode: "automatic" | "configured"
  minProfitFactor: number
  maxDrawdownHours: number
  useTopSymbols: boolean
  topSymbolsCount: number
  indicationCategory?: IndicationCategory
  indicationType?: string
}

export class PresetTradeEngine {
  private connectionId: string
  private presetId: string
  private isRunning = false
  private tradeInterval?: NodeJS.Timeout
  private realInterval?: NodeJS.Timeout
  private indicationEngine: IndicationEngine
  private activeIndications: Map<string, any> = new Map()
  private lastIntervalComplete = true
  private lastRealIntervalComplete = true

  private readonly BATCH_SIZE = 10
  private readonly MAX_CONCURRENT = 5
  private readonly RATE_LIMIT_DELAY = 100 // ms between API calls

  constructor(connectionId: string, presetId: string) {
    this.connectionId = connectionId
    this.presetId = presetId
    this.indicationEngine = new IndicationEngine()
  }

  /**
   * Start the preset trade engine with non-overlapping intervals
   */
  async start(config: PresetTradeEngineConfig): Promise<void> {
    if (this.isRunning) {
      console.log("[v0] Preset trade engine already running")
      return
    }

    this.isRunning = true
    console.log("[v0] Starting preset trade engine for connection:", this.connectionId)

    // Get configured interval from settings
    const settings = await this.getSettings()
    const indicationInterval = Number.parseInt(settings.presetIndicationInterval || "1") * 1000
    const realInterval = Number.parseInt(settings.presetRealInterval || "200")

    const indicationCategory = config.indicationCategory || settings.presetIndicationCategory || "common"

    // Initial run
    await this.processIndications(config.symbols, config, indicationCategory)

    // Set up intervals with overlap protection
    this.tradeInterval = setInterval(async () => {
      if (!this.lastIntervalComplete) {
        console.log("[v0] Skipping indication interval - previous still running")
        return
      }

      this.lastIntervalComplete = false
      try {
        await this.processIndications(config.symbols, config, indicationCategory)
      } finally {
        this.lastIntervalComplete = true
      }
    }, indicationInterval)

    this.realInterval = setInterval(async () => {
      if (!this.lastRealIntervalComplete) {
        console.log("[v0] Skipping real interval - previous still running")
        return
      }

      this.lastRealIntervalComplete = false
      try {
        await this.processRealPositions(config)
      } finally {
        this.lastRealIntervalComplete = true
      }
    }, realInterval)
  }

  /**
   * Stop the preset trade engine
   */
  stop(): void {
    this.isRunning = false

    if (this.tradeInterval) {
      clearInterval(this.tradeInterval)
      this.tradeInterval = undefined
    }

    if (this.realInterval) {
      clearInterval(this.realInterval)
      this.realInterval = undefined
    }

    console.log("[v0] Preset trade engine stopped")
  }

  /**
   * Process indications based on category (Main or Common)
   */
  private async processIndications(
    symbols: string[],
    config: PresetTradeEngineConfig,
    indicationCategory: string,
  ): Promise<void> {
    console.log(`[v0] Processing indications for ${symbols.length} symbols (category: ${indicationCategory})`)

    if (indicationCategory === INDICATION_CATEGORIES.MAIN) {
      await this.processIndicationsMain(symbols, config)
    } else {
      await this.processIndicationsCommonIndicators(symbols, config)
    }
  }

  /**
   * Process MAIN INDICATIONS (Direction, Move, Active, Optimal)
   * Step-based position generation using the Indication Engine
   */
  private async processIndicationsMain(symbols: string[], config: PresetTradeEngineConfig): Promise<void> {
    const settings = await this.getSettings()

    // Get enabled main indication types
    const enabledTypes: string[] = []
    if (settings.directionEnabled !== "false") enabledTypes.push("direction")
    if (settings.moveEnabled !== "false") enabledTypes.push("move")
    if (settings.activeEnabled === "true") enabledTypes.push("active")
    if (settings.optimalEnabled === "true") enabledTypes.push("optimal")

    if (enabledTypes.length === 0) {
      console.log("[v0] No main indication types enabled")
      return
    }

    const batches = this.createBatches(symbols, this.BATCH_SIZE)

    for (const batch of batches) {
      await Promise.all(
        batch.map(async (symbol) => {
          try {
            // Get recent price data for indication calculations
            const prices = await this.getRecentPrices(symbol, 100)
            if (prices.length < 20) {
              console.log(`[v0] Insufficient price data for ${symbol}`)
              return
            }

            for (const indicationType of enabledTypes) {
              let indication: LocalIndicationResult | null = null

              const baseConfig = {
                range: Number.parseInt(settings[`${indicationType}Range`] || "20"),
                price_change_ratio: Number.parseFloat(settings[`${indicationType}PriceChangeRatio`] || "0.1"),
              }

              // Call the correct method based on indication type
              switch (indicationType) {
                case "direction":
                  indication = transformIndicationResult(
                    await this.indicationEngine.calculateDirectionIndication(symbol, prices, {
                      ...baseConfig,
                      type: "direction" as const,
                    }),
                    "direction",
                    symbol,
                  )
                  break
                case "move":
                  indication = transformIndicationResult(
                    await this.indicationEngine.calculateMoveIndication(symbol, prices, {
                      ...baseConfig,
                      type: "move" as const,
                    }),
                    "move",
                    symbol,
                  )
                  break
                case "active":
                  indication = transformIndicationResult(
                    await this.indicationEngine.calculateActiveIndication(symbol, prices, {
                      ...baseConfig,
                      type: "active" as const,
                    }),
                    "active",
                    symbol,
                  )
                  break
                case "optimal":
                  // Calculate all three indication types for optimal
                  const dirResult = transformIndicationResult(
                    await this.indicationEngine.calculateDirectionIndication(symbol, prices, {
                      ...baseConfig,
                      type: "direction" as const,
                    }),
                    "direction",
                    symbol,
                  )
                  const moveResult = transformIndicationResult(
                    await this.indicationEngine.calculateMoveIndication(symbol, prices, {
                      ...baseConfig,
                      type: "move" as const,
                    }),
                    "move",
                    symbol,
                  )
                  const activeResult = transformIndicationResult(
                    await this.indicationEngine.calculateActiveIndication(symbol, prices, {
                      ...baseConfig,
                      type: "active" as const,
                    }),
                    "active",
                    symbol,
                  )

                  // Combine signals for optimal
                  if (dirResult || moveResult || activeResult) {
                    const signals = [dirResult, moveResult, activeResult].filter(Boolean) as LocalIndicationResult[]
                    if (signals.length >= 2) {
                      // Calculate average signal strength from IndicationResult objects
                      const avgStrength = signals.reduce((sum, s) => sum + (s.signal_strength || 0), 0) / signals.length
                      // Derive signal direction from strength (positive = bullish, negative = bearish)
                      const signalDirection = avgStrength > 0 ? "bullish" : avgStrength < 0 ? "bearish" : "neutral"
                      indication = {
                        type: "optimal",
                        symbol,
                        signal: signalDirection,
                        entry_price: prices[prices.length - 1],
                        step: 1, // Default step for optimal combined indication
                        strength: Math.abs(avgStrength),
                      }
                    }
                  }
                  break
              }

              if (indication && indication.signal !== "neutral") {
                await this.processMainIndicationResult(
                  {
                    symbol,
                    entry_price: indication.entry_price,
                    direction: indication.signal === "bullish" ? "long" : "short",
                    indication_type: indicationType,
                    indication_step: indication.step ?? 0, // Use nullish coalescing for safety
                    strength: indication.strength ?? 0, // Use nullish coalescing for safety
                  },
                  config,
                )
              }
            }
          } catch (error) {
            console.error(`[v0] Error processing main indications for ${symbol}:`, error)
          }
        }),
      )

      // Rate limiting between batches
      await this.delay(this.RATE_LIMIT_DELAY)
    }
  }

  /**
   * Process indications using COMMON INDICATORS (RSI, MACD, Bollinger, ParabolicSAR, ADX, ATR, etc.)
   * This is the correct approach for Preset Trade mode
   */
  private async processIndicationsCommonIndicators(symbols: string[], config: PresetTradeEngineConfig): Promise<void> {
    const settings = await this.getSettings()

    // Get configured common indicators from settings
    const commonIndicators = this.getConfiguredIndicators(settings)

    const batches = this.createBatches(symbols, this.BATCH_SIZE)

    for (const batch of batches) {
      await Promise.all(
        batch.map(async (symbol) => {
          try {
            // Get recent price data (enough for all indicators)
            const prices = await this.getRecentPrices(symbol, 200)

            if (prices.length < 50) {
              console.log(`[v0] Insufficient price data for ${symbol}`)
              return
            }

            // Calculate all common indicators
            const signals = calculateIndicators(prices, commonIndicators)

            // Combine signals to determine entry
            const combinedSignal = TechnicalIndicators.combineSignals(signals)

            if (combinedSignal.direction !== "neutral" && combinedSignal.strength > 0.5) {
              // Generate pseudo positions with wider TP/SL ranges
              await this.processIndicationResult(
                {
                  symbol,
                  entry_price: prices[prices.length - 1],
                  direction: combinedSignal.direction,
                  strength: combinedSignal.strength,
                  indicators: signals,
                },
                config,
              )
            }
          } catch (error) {
            console.error(`[v0] Error processing indications for ${symbol}:`, error)
          }
        }),
      )

      // Rate limiting between batches
      await this.delay(this.RATE_LIMIT_DELAY)
    }
  }

  /**
   * Initialize engine state
   */
  private async initializeEngineState(config: PresetTradeEngineConfig): Promise<void> {
    const client = getRedisClient()
    const stateKey = `preset_trade_engine_state:${this.connectionId}:${this.presetId}`
    
    const stateData = {
      connection_id: this.connectionId,
      preset_id: this.presetId,
      mode: config.mode,
      status: "running",
      config: JSON.stringify(config),
      started_at: new Date().toISOString(),
      stopped_at: "",
    }

    await client.hset(stateKey, Object.fromEntries(
      Object.entries(stateData).map(([k, v]) => [k, String(v)])
    ))

    // Add to engine state index
    await client.sadd("preset_trade_engine_states", `${this.connectionId}:${this.presetId}`)
  }

  /**
   * Load historical data for prehistoric calculations (5 days)
   * Optimized with parallel processing and concurrency limits
   */
  private async loadHistoricalData(symbols: string[]): Promise<void> {
    console.log(`[v0] Loading historical data for ${symbols.length} symbols...`)

    const settings = await this.getSettings()
    const timeRangeDays = Number.parseInt(settings.timeRangeHistoryDays || "5")
    const timeframeSeconds = Number.parseFloat(settings.marketDataTimeframe || "1.0")

    const batches = this.createBatches(symbols, this.MAX_CONCURRENT)

    for (const batch of batches) {
      await Promise.all(
        batch.map(async (symbol) => {
          try {
            // Fetch historical OHLCV data
            const historicalData = await this.fetchHistoricalOHLCV(symbol, timeRangeDays, timeframeSeconds)

            // Store in database for prehistoric calculations
            await this.storeHistoricalData(symbol, historicalData)

            console.log(`[v0] Loaded ${historicalData.length} candles for ${symbol}`)
          } catch (error) {
            console.error(`[v0] Failed to load historical data for ${symbol}:`, error)
          }
        }),
      )

      await this.delay(this.RATE_LIMIT_DELAY)
    }

    console.log("[v0] Historical data loading complete")
  }

  /**
   * Trade Interval Loop (1.0s) - NON-OVERLAPPING
   * Processes: Indications → Strategies → Pseudo Positions → Logging
   */
  private async startTradeIntervalLoop(config: PresetTradeEngineConfig): Promise<void> {
    const settings = await this.getSettings()
    const intervalMs = Number.parseFloat(settings.tradeEngineInterval || "1.0") * 1000

    this.tradeInterval = setInterval(async () => {
      if (!this.lastIntervalComplete) {
        console.log("[v0] Previous trade interval still running, skipping...")
        return
      }

      this.lastIntervalComplete = false

      try {
        await this.processTradeInterval(config)
      } catch (error) {
        console.error("[v0] Trade interval error:", error)
      } finally {
        this.lastIntervalComplete = true
      }
    }, intervalMs)
  }

  /**
   * Process complete trade interval
   */
  private async processTradeInterval(config: PresetTradeEngineConfig): Promise<void> {
    const startTime = Date.now()

    // Get symbols (top 25 by market cap or configured)
    const symbols = config.useTopSymbols
      ? await this.getTopSymbolsByMarketCap(config.topSymbolsCount || 25)
      : config.symbols

    await this.processIndicationsCommonIndicators(symbols, config)

    // Stage 2: Strategy Processing (Validate and create Main pseudo positions)
    await this.processStrategies(symbols, config)

    // Stage 3: Pseudo Position Management (Update and validate)
    await this.managePseudoPositions(config)

    // Stage 4: Logging & Metrics
    await this.logMetrics(symbols.length, Date.now() - startTime)
  }

  /**
   * Process indication result and generate pseudo positions
   * Wider TP/SL ranges for short-term trading (starting from factor 2)
   */
  private async processIndicationResult(indication: any, config: PresetTradeEngineConfig): Promise<void> {
    // Check validation cooldown (15 seconds)
    const lastValidation = this.activeIndications.get(`${indication.symbol}-${indication.direction}`)
    if (lastValidation && Date.now() - lastValidation < 15000) {
      return // Skip if within cooldown period
    }

    const pseudoPositions = await this.generateShortTermPseudoPositions(
      indication.symbol,
      indication.entry_price,
      indication.direction,
      indication.strength,
      indication.indicators,
    )

    // Store pseudo positions (batch insert for performance)
    await this.batchInsertPseudoPositions(pseudoPositions)

    // Update validation timestamp
    this.activeIndications.set(`${indication.symbol}-${indication.direction}`, Date.now())

    console.log(
      `[v0] Generated ${pseudoPositions.length} pseudo positions for ${indication.symbol} (${indication.direction})`,
    )
  }

  /**
   * Generate pseudo positions optimized for short-term trading
   * Uses configurable ranges from Settings / Main / Preset Trade
   */
  private async generateShortTermPseudoPositions(
    symbol: string,
    entryPrice: number,
    direction: "long" | "short",
    strength: number,
    indicators: IndicatorSignal[],
  ): Promise<any[]> {
    const positions: any[] = []

    const settings = await this.getSettings()
    const positionCost = Number.parseFloat(settings.positionCost || "0.1") // Default 10%

    const tpMin = Number.parseFloat(settings.presetTpMin || "2")
    const tpMax = Number.parseFloat(settings.presetTpMax || "30")
    const tpStep = Number.parseFloat(settings.presetTpStep || "2")
    const slMin = Number.parseFloat(settings.presetSlMin || "0.3")
    const slMax = Number.parseFloat(settings.presetSlMax || "3.0")
    const slStep = Number.parseFloat(settings.presetSlStep || "0.3")
    const trailStarts = JSON.parse(settings.presetTrailStarts || "[0.5, 1.0, 1.5]")
    const trailStops = JSON.parse(settings.presetTrailStops || "[0.2, 0.4, 0.6]")

    // Generate positions with configurable ranges
    for (let tpFactor = tpMin; tpFactor <= tpMax; tpFactor += tpStep) {
      for (let slRatio = slMin; slRatio <= slMax; slRatio += slStep) {
        // Without trailing
        positions.push({
          id: this.generateId(),
          connection_id: this.connectionId,
          preset_id: this.presetId,
          symbol,
          type: "base",
          direction,
          strength,
          indicators: JSON.stringify(indicators.map((i) => ({ type: i.type, value: i.value }))),
          takeprofit_factor: tpFactor,
          stoploss_ratio: slRatio,
          trailing_enabled: false,
          entry_price: entryPrice,
          current_price: entryPrice,
          profit_factor: 0,
          position_cost: positionCost,
          status: "active",
          created_at: new Date().toISOString(),
        })

        // With trailing (using configured values)
        trailStarts.forEach((trailStart: number) => {
          trailStops.forEach((trailStop: number) => {
            positions.push({
              id: this.generateId(),
              connection_id: this.connectionId,
              preset_id: this.presetId,
              symbol,
              type: "base",
              direction,
              strength,
              indicators: JSON.stringify(indicators.map((i) => ({ type: i.type, value: i.value }))),
              takeprofit_factor: tpFactor,
              stoploss_ratio: slRatio,
              trailing_enabled: true,
              trail_start: trailStart,
              trail_stop: trailStop,
              entry_price: entryPrice,
              current_price: entryPrice,
              profit_factor: 0,
              position_cost: positionCost,
              status: "active",
              created_at: new Date().toISOString(),
            })
          })
        })
      }
    }

    // Limit to 250 positions per indication
    return positions.slice(0, 250)
  }

  /**
   * Get configured common indicators from settings
   * Updated to include ParabolicSAR with proper settings
   */
  private async getCommonIndicators(): Promise<IndicatorConfig[]> {
    const settings = await this.getSettings()

    const indicators: IndicatorConfig[] = []

    // RSI
    if (settings.rsiEnabled !== "false") {
      indicators.push({
        type: "rsi" as const,
        params: {
          period: Number(settings.rsiPeriod) || 14,
          oversold: Number(settings.rsiOversold) || 30,
          overbought: Number(settings.rsiOverbought) || 70,
        },
      })
    }

    // MACD
    if (settings.macdEnabled !== "false") {
      indicators.push({
        type: "macd" as const,
        params: {
          fastPeriod: Number(settings.macdFastPeriod) || 12,
          slowPeriod: Number(settings.macdSlowPeriod) || 26,
          signalPeriod: Number(settings.macdSignalPeriod) || 9,
        },
      })
    }

    // Bollinger Bands
    if (settings.bollingerEnabled !== "false") {
      indicators.push({
        type: "bollinger" as const,
        params: {
          period: Number(settings.bollingerPeriod) || 20,
          stdDev: Number(settings.bollingerStdDev) || 2,
        },
      })
    }

    // Parabolic SAR
    if (settings.parabolicSAREnabled !== "false") {
      indicators.push({
        type: "sar" as const,
        params: {
          acceleration: Number(settings.parabolicSARAcceleration) || 0.02,
          maximum: Number(settings.parabolicSARMaximum) || 0.2,
        },
      })
    }

    // ADX
    if (settings.adxEnabled !== "false") {
      indicators.push({
        type: "adx" as const,
        params: {
          period: Number(settings.adxPeriod) || 14,
          threshold: Number(settings.adxThreshold) || 25,
        },
      })
    }

    // ATR (for volatility-based stops)
    if (settings.atrEnabled !== "false") {
      // ATR is used for position sizing, not direct signals
      // But we can include it for volatility analysis
    }

    // Default if none enabled
    if (indicators.length === 0) {
      return [
        { type: "rsi", params: { period: 14, oversold: 30, overbought: 70 } },
        { type: "macd", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
        { type: "bollinger", params: { period: 20, stdDev: 2 } },
        { type: "sar", params: { acceleration: 0.02, maximum: 0.2 } },
        { type: "adx", params: { period: 14 } },
      ]
    }

    return indicators
  }

  /**
   * Get configured indicators for Common strategy
   */
  private getConfiguredIndicators(settings: Record<string, string>): IndicatorConfig[] {
    const indicators: IndicatorConfig[] = []

    // RSI
    if (settings.rsiEnabled !== "false") {
      indicators.push({
        type: "rsi" as const,
        params: {
          period: Number(settings.rsiPeriod) || 14,
          oversold: Number(settings.rsiOversold) || 30,
          overbought: Number(settings.rsiOverbought) || 70,
        },
      })
    }

    // MACD
    if (settings.macdEnabled !== "false") {
      indicators.push({
        type: "macd" as const,
        params: {
          fastPeriod: Number(settings.macdFastPeriod) || 12,
          slowPeriod: Number(settings.macdSlowPeriod) || 26,
          signalPeriod: Number(settings.macdSignalPeriod) || 9,
        },
      })
    }

    // Bollinger Bands
    if (settings.bollingerEnabled !== "false") {
      indicators.push({
        type: "bollinger" as const,
        params: {
          period: Number(settings.bollingerPeriod) || 20,
          stdDev: Number(settings.bollingerStdDev) || 2,
        },
      })
    }

    // Parabolic SAR
    if (settings.parabolicSAREnabled !== "false") {
      indicators.push({
        type: "sar" as const,
        params: {
          acceleration: Number(settings.parabolicSARAcceleration) || 0.02,
          maximum: Number(settings.parabolicSARMaximum) || 0.2,
        },
      })
    }

    // ADX
    if (settings.adxEnabled !== "false") {
      indicators.push({
        type: "adx" as const,
        params: {
          period: Number(settings.adxPeriod) || 14,
          threshold: Number(settings.adxThreshold) || 25,
        },
      })
    }

    // ATR (for volatility-based stops)
    if (settings.atrEnabled !== "false") {
      // ATR is used for position sizing, not direct signals
      // But we can include it for volatility analysis
    }

    // Default if none enabled
    if (indicators.length === 0) {
      return [
        { type: "rsi", params: { period: 14, oversold: 30, overbought: 70 } },
        { type: "macd", params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
        { type: "bollinger", params: { period: 20, stdDev: 2 } },
        { type: "sar", params: { acceleration: 0.02, maximum: 0.2 } },
        { type: "adx", params: { period: 14 } },
      ]
    }

    return indicators
  }

  /**
   * Process strategies and create Main pseudo positions
   */
  private async processStrategies(symbols: string[], config: PresetTradeEngineConfig): Promise<void> {
    const client = getRedisClient()

    // Get all base positions for this connection/preset
    const basePositionsIds = await client.smembers(`preset_pseudo_positions:connection:${this.connectionId}:preset:${this.presetId}:type:base:status:active`)
    
    const basePositions: any[] = []
    for (const id of basePositionsIds) {
      const pos = await client.hgetall(`preset_pseudo_position:${id}`)
      if (pos && pos.status === 'active' && pos.type === 'base') {
        basePositions.push({ ...pos, id })
      }
    }

    // Group by symbol
    const positionsBySymbol = this.groupBy(basePositions, "symbol")

    // Process each symbol
    for (const [symbol, positions] of Object.entries(positionsBySymbol)) {
      try {
        // Validate and create Main pseudo positions
        const validatedPositions = positions.filter((p: any) => Number(p.profit_factor) >= config.minProfitFactor)

        // Check position cooldown (20 seconds)
        const lastPosition = await this.getLastClosedPosition(symbol)
        if (lastPosition && Date.now() - new Date(lastPosition.closed_at).getTime() < 20000) {
          continue // Skip if within cooldown period
        }

        // Check max active per config (1 position per configuration set)
        const activeCount = await this.getActivePositionCount(symbol)
        if (activeCount >= 1) {
          continue // Skip if already have active position for this symbol
        }

        // Create Main pseudo positions from validated Base positions
        for (const basePosition of validatedPositions.slice(0, 10)) {
          const mainId = this.generateId()
          const mainPosition = {
            id: mainId,
            connection_id: this.connectionId,
            preset_id: this.presetId,
            symbol: basePosition.symbol,
            type: "main",
            indication_type: basePosition.indication_type,
            indication_range: basePosition.indication_range,
            takeprofit_factor: basePosition.takeprofit_factor,
            stoploss_ratio: basePosition.stoploss_ratio,
            trailing_enabled: basePosition.trailing_enabled,
            trail_start: basePosition.trail_start,
            trail_stop: basePosition.trail_stop,
            entry_price: basePosition.entry_price,
            current_price: basePosition.current_price,
            profit_factor: basePosition.profit_factor,
            position_cost: basePosition.position_cost,
            base_position_id: basePosition.id,
            status: "active",
            created_at: new Date().toISOString(),
          }

          await client.hset(`preset_pseudo_position:${mainId}`, Object.fromEntries(
            Object.entries(mainPosition).map(([k, v]) => [k, String(v)])
          ))

          // Add to indexes
          await client.sadd(`preset_pseudo_positions:connection:${this.connectionId}:preset:${this.presetId}`, mainId)
          await client.sadd(`preset_pseudo_positions:symbol:${basePosition.symbol}`, mainId)
          await client.sadd(`preset_pseudo_positions:type:main`, mainId)
          await client.sadd(`preset_pseudo_positions:status:active`, mainId)
        }
      } catch (error) {
        console.error(`[v0] Error processing strategies for ${symbol}:`, error)
      }
    }
  }

  /**
   * Manage pseudo positions (update, validate, close)
   */
  private async managePseudoPositions(config: PresetTradeEngineConfig): Promise<void> {
    const client = getRedisClient()

    // Get all active positions for this connection/preset
    const activePositionsIds = await client.smembers(`preset_pseudo_positions:connection:${this.connectionId}:preset:${this.presetId}:status:active`)
    
    const activePositions: any[] = []
    for (const id of activePositionsIds) {
      const pos = await client.hgetall(`preset_pseudo_position:${id}`)
      if (pos && pos.status === 'active') {
        activePositions.push({ ...pos, id })
      }
    }

    // Update with current prices (batch)
    const symbols = [...new Set(activePositions.map((p: any) => p.symbol))]
    const currentPrices = await this.getCurrentPrices(symbols)

    // Process positions in batches
    const batches = this.createBatches(activePositions, this.BATCH_SIZE)

    for (const batch of batches) {
      await Promise.all(
        batch.map(async (position: any) => {
          try {
            const currentPrice = currentPrices.get(position.symbol)
            if (!currentPrice) return

            // Update profit factor
            const priceDiff = currentPrice - Number(position.entry_price)
            const profitFactor = priceDiff / (Number(position.entry_price) * Number(position.position_cost))

            // Check exit conditions
            const shouldClose = this.checkExitConditions(position, currentPrice, profitFactor)

            if (shouldClose) {
              await this.closePosition(position, currentPrice, profitFactor)
            } else {
              await client.hset(`preset_pseudo_position:${position.id}`, {
                current_price: String(currentPrice),
                profit_factor: String(profitFactor),
                updated_at: new Date().toISOString(),
              })
            }

            // Validate Main positions for Real trading
            if (position.type === "main" && profitFactor >= config.minProfitFactor) {
              await this.validateForRealTrading(position, config)
            }
          } catch (error) {
            console.error(`[v0] Error managing position ${position.id}:`, error)
          }
        }),
      )
    }
  }

  /**
   * Real Positions Interval Loop (0.3s) - NON-OVERLAPPING
   * Handles exchange real position updates
   */
  private async startRealIntervalLoop(): Promise<void> {
    const settings = await this.getSettings()
    const intervalMs = Number.parseFloat(settings.realPositionsInterval || "0.3") * 1000

    this.realInterval = setInterval(async () => {
      if (!this.lastRealIntervalComplete) {
        console.log("[v0] Previous real interval still running, skipping...")
        return
      }

      this.lastRealIntervalComplete = false

      try {
        await this.processRealInterval()
      } catch (error) {
        console.error("[v0] Real interval error:", error)
      } finally {
        this.lastRealIntervalComplete = true
      }
    }, intervalMs)
  }

  /**
   * Process real positions interval
   * Batched API calls for rate limit compliance
   */
  private async processRealInterval(): Promise<void> {
    const client = getRedisClient()

    // Get all real active positions for this connection/preset
    const realPositionsIds = await client.smembers(`preset_pseudo_positions:connection:${this.connectionId}:preset:${this.presetId}:type:real:status:active`)
    
    const realPositions: any[] = []
    for (const id of realPositionsIds) {
      const pos = await client.hgetall(`preset_pseudo_position:${id}`)
      if (pos && pos.type === 'real' && pos.status === 'active') {
        realPositions.push({ ...pos, id })
      }
    }

    if (realPositions.length === 0) return

    const exchangePositions = await this.fetchExchangePositions()

    // Match and update
    const updates: any[] = []

    for (const realPos of realPositions) {
      const exchangePos = exchangePositions.find((ep: any) => ep.symbol === realPos.symbol)

      if (exchangePos) {
        updates.push({
          id: realPos.id,
          currentPrice: exchangePos.markPrice,
          profitLoss: exchangePos.unrealizedProfit,
        })
      }
    }

    if (updates.length > 0) {
      await this.batchUpdateRealPositions(updates)
    }
  }

  // ============ HELPER METHODS ============

  private async getSettings(): Promise<Record<string, string>> {
    const client = getRedisClient()
    const keys = await client.keys("settings:*")
    const settings: Record<string, string> = {}

    for (const key of keys) {
      const value = await client.get(key)
      if (value !== null) {
        const settingKey = key.replace("settings:", "")
        settings[settingKey] = value
      }
    }

    return settings
  }

  private async getTopSymbolsByMarketCap(count: number): Promise<string[]> {
    const client = getRedisClient()
    
    // Get all symbols from market_data keys
    const marketDataKeys = await client.keys("market_data:*")
    const symbolAggregates = new Map<string, { volume: number; price: number }>()

    for (const key of marketDataKeys) {
      const dataStr = await client.get(key)
      if (dataStr) {
        try {
          const data = JSON.parse(dataStr)
          const symbol = key.split(":")[1]
          if (symbol) {
            const existing = symbolAggregates.get(symbol) || { volume: 0, price: 0 }
            symbolAggregates.set(symbol, {
              volume: existing.volume + (data.volume || 0),
              price: data.price || 0,
            })
          }
        } catch (e) {
          // Skip invalid data
        }
      }
    }

    // Sort by volume * price (market cap approximation)
    const sorted = Array.from(symbolAggregates.entries())
      .sort((a, b) => (b[1].volume * b[1].price) - (a[1].volume * a[1].price))
      .slice(0, count)
      .map(([symbol]) => symbol)

    return sorted
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = []
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize))
    }
    return batches
  }

  private groupBy<T>(array: T[], key: string): Record<string, T[]> {
    return array.reduce((result: any, item: any) => {
      const groupKey = item[key]
      if (!result[groupKey]) result[groupKey] = []
      result[groupKey].push(item)
      return result
    }, {})
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  private async fetchHistoricalOHLCV(symbol: string, days: number, timeframe: number): Promise<any[]> {
    // Implement exchange API call to fetch historical data
    // This is a placeholder - actual implementation depends on exchange
    return []
  }

  private async storeHistoricalData(symbol: string, data: any[]): Promise<void> {
    if (data.length === 0) return

    const client = getRedisClient()
    const zsetKey = `market_data:${this.connectionId}:${symbol}`

    for (const d of data) {
      const timestamp = d.timestamp
      const value = JSON.stringify(d)
      await client.zadd(zsetKey, timestamp, value)
    }
  }

  private async getRecentPrices(symbol: string, count: number): Promise<number[]> {
    const client = getRedisClient()
    const zsetKey = `market_data:${this.connectionId}:${symbol}`

    // Get the most recent entries (highest scores)
    const recentData = await client.zrevrange(zsetKey, 0, count - 1)
    
    // Parse and extract prices
    const prices = recentData
      .map((dataStr: string) => {
        try {
          const data = JSON.parse(dataStr)
          return data.price
        } catch {
          return null
        }
      })
      .filter((price: number | null) => price !== null)
      .reverse() // Reverse to get oldest first like the original query

    return prices as number[]
  }

  private async getCurrentPrices(symbols: string[]): Promise<Map<string, number>> {
    const client = getRedisClient()
    const prices = new Map<string, number>()

    for (const symbol of symbols) {
      const zsetKey = `market_data:${this.connectionId}:${symbol}`
      // Get the most recent price (highest score)
      const recentData = await client.zrevrange(zsetKey, 0, 0)
      
      if (recentData.length > 0) {
        try {
          const data = JSON.parse(recentData[0])
          prices.set(symbol, data.price)
        } catch {
          // Skip if parsing fails
        }
      }
    }

    return prices
  }

  private async batchInsertPseudoPositions(positions: any[]): Promise<void> {
    if (positions.length === 0) return

    const client = getRedisClient()

    // Index key for all positions
    const allPositionsKey = `preset_pseudo_positions:all`
    const connectionKey = `preset_pseudo_positions:connection:${this.connectionId}`
    const presetKey = `preset_pseudo_positions:preset:${this.presetId}`

    for (const p of positions) {
      const id = p.id
      const positionKey = `preset_pseudo_position:${id}`

      // Store the position hash
      await client.hset(positionKey, Object.fromEntries(
        Object.entries(p).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])
      ))

      // Add to global indexes
      await client.sadd(allPositionsKey, id)
      await client.sadd(connectionKey, id)
      await client.sadd(presetKey, id)

      // Add to symbol-specific index
      await client.sadd(`preset_pseudo_positions:symbol:${p.symbol}`, id)

      // Add to type index
      await client.sadd(`preset_pseudo_positions:type:${p.type}`, id)

      // Add to status index
      await client.sadd(`preset_pseudo_positions:status:${p.status}`, id)

      // Add to combined indexes for query optimization
      await client.sadd(`preset_pseudo_positions:connection:${this.connectionId}:preset:${this.presetId}:type:${p.type}:status:${p.status}`, id)
    }
  }

  private checkExitConditions(position: any, currentPrice: number, profitFactor: number): boolean {
    // Check TP/SL
    const tpPrice = position.entry_price * (1 + position.takeprofit_factor * position.position_cost)
    const slPrice =
      position.entry_price * (1 - position.stoploss_ratio * position.takeprofit_factor * position.position_cost)

    if (currentPrice >= tpPrice || currentPrice <= slPrice) {
      return true
    }

    // Check timeout (2 hours for short-term trading)
    const openedAt = new Date(position.created_at)
    const hoursOpen = (Date.now() - openedAt.getTime()) / (1000 * 60 * 60)

    if (hoursOpen >= 2) {
      return true
    }

    return false
  }

  private async closePosition(position: any, currentPrice: number, profitFactor: number): Promise<void> {
    const client = getRedisClient()
    const positionKey = `preset_pseudo_position:${position.id}`

    await client.hset(positionKey, {
      status: "closed",
      current_price: String(currentPrice),
      profit_factor: String(profitFactor),
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    // Remove from active status index
    await client.srem(`preset_pseudo_positions:status:active`, position.id)
    await client.srem(`preset_pseudo_positions:connection:${this.connectionId}:preset:${this.presetId}:status:active`, position.id)

    // Add to closed status index
    await client.sadd(`preset_pseudo_positions:status:closed`, position.id)
    await client.sadd(`preset_pseudo_positions:connection:${this.connectionId}:preset:${this.presetId}:status:closed`, position.id)
  }

  private async getLastClosedPosition(symbol: string): Promise<any> {
    const client = getRedisClient()

    // Get all closed positions for this connection/preset/symbol
    const indexKey = `preset_pseudo_positions:connection:${this.connectionId}:preset:${this.presetId}:symbol:${symbol}:status:closed`
    const positionIds = await client.smembers(indexKey)

    if (positionIds.length === 0) {
      return null
    }

    // Sort by closed_at and get the most recent
    let lastPosition: any = null
    let lastClosedAt = 0

    for (const id of positionIds) {
      const pos = await client.hgetall(`preset_pseudo_position:${id}`)
      if (pos && pos.status === 'closed') {
        const closedAt = new Date(pos.closed_at).getTime()
        if (closedAt > lastClosedAt) {
          lastClosedAt = closedAt
          lastPosition = { ...pos, id }
        }
      }
    }

    return lastPosition
  }

  private async getActivePositionCount(symbol: string): Promise<number> {
    const client = getRedisClient()

    // Count main active positions for this connection/preset/symbol
    const indexKey = `preset_pseudo_positions:connection:${this.connectionId}:preset:${this.presetId}:symbol:${symbol}:type:main:status:active`
    const count = await client.scard(indexKey)

    return count
  }

  private async validateForRealTrading(position: any, config: PresetTradeEngineConfig): Promise<void> {
    const client = getRedisClient()
    const realId = this.generateId()

    const realPosition = {
      id: realId,
      connection_id: this.connectionId,
      preset_id: this.presetId,
      symbol: position.symbol,
      type: "real",
      indication_type: position.indication_type,
      indication_range: position.indication_range,
      takeprofit_factor: position.takeprofit_factor,
      stoploss_ratio: position.stoploss_ratio,
      trailing_enabled: position.trailing_enabled,
      trail_start: position.trail_start,
      trail_stop: position.trail_stop,
      entry_price: position.entry_price,
      current_price: position.current_price,
      profit_factor: position.profit_factor,
      position_cost: position.position_cost,
      main_position_id: position.id,
      status: "active",
      created_at: new Date().toISOString(),
    }

    await client.hset(`preset_pseudo_position:${realId}`, Object.fromEntries(
      Object.entries(realPosition).map(([k, v]) => [k, String(v)])
    ))

    // Add to indexes
    await client.sadd(`preset_pseudo_positions:connection:${this.connectionId}:preset:${this.presetId}`, realId)
    await client.sadd(`preset_pseudo_positions:symbol:${position.symbol}`, realId)
    await client.sadd(`preset_pseudo_positions:type:real`, realId)
    await client.sadd(`preset_pseudo_positions:status:active`, realId)
    await client.sadd(`preset_pseudo_positions:connection:${this.connectionId}:preset:${this.presetId}:type:real:status:active`, realId)
  }

  private async fetchExchangePositions(): Promise<any[]> {
    // Implement exchange API call to fetch all positions
    // This is a placeholder - actual implementation depends on exchange
    return []
  }

  private async batchUpdateRealPositions(updates: any[]): Promise<void> {
    const client = getRedisClient()

    for (const update of updates) {
      const positionKey = `preset_pseudo_position:${update.id}`
      await client.hset(positionKey, {
        current_price: String(update.currentPrice),
        profit_loss: String(update.profitLoss),
        updated_at: new Date().toISOString(),
      })
    }
  }

  private async logMetrics(symbolCount: number, duration: number): Promise<void> {
    const client = getRedisClient()
    const metricsLogKey = `preset_engine_metrics:log`
    
    const metric = {
      connection_id: this.connectionId,
      preset_id: this.presetId,
      symbol_count: symbolCount,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    }

    // Store as a list entry (JSON string)
    await client.rpush(metricsLogKey, JSON.stringify(metric))

    // Keep only last 1000 entries
    await client.ltrim(metricsLogKey, -1000, -1)
  }

  /**
   * Process Main Indication result and generate pseudo positions
   */
  private async processMainIndicationResult(
    result: {
      symbol: string
      entry_price: number
      direction: "long" | "short"
      indication_type: string
      indication_step: number
      strength: number
    },
    config: PresetTradeEngineConfig,
  ): Promise<void> {
    const positions = await this.generateMainIndicationPositions(
      result.symbol,
      result.entry_price,
      result.direction,
      result.indication_type,
      result.indication_step,
      result.strength,
    )

    if (positions.length > 0) {
      await this.savePositions(positions)
      console.log(`[v0] Generated ${positions.length} main indication positions for ${result.symbol}`)
    }
  }

  /**
   * Generate pseudo positions for Main Indications
   */
  private async generateMainIndicationPositions(
    symbol: string,
    entryPrice: number,
    direction: "long" | "short",
    indicationType: string,
    indicationStep: number,
    strength: number,
  ): Promise<any[]> {
    const positions: any[] = []

    const settings = await this.getSettings()
    const positionCost = Number.parseFloat(settings.positionCost || "0.1")

    // Get step-based ranges
    const stepMin = indicationStep * Number(settings.stepRelationMinRatio || 0.2)
    const stepMax = indicationStep * Number(settings.stepRelationMaxRatio || 1.0)

    const tpMin = Number.parseFloat(settings.presetTpMin || "2")
    const tpMax = Number.parseFloat(settings.presetTpMax || "30")
    const tpStep = Number.parseFloat(settings.presetTpStep || "2")

    // Generate positions based on indication step
    for (let step = stepMin; step <= stepMax; step += 1) {
      for (let tpFactor = tpMin; tpFactor <= tpMax; tpFactor += tpStep) {
        positions.push({
          id: this.generateId(),
          connection_id: this.connectionId,
          preset_id: this.presetId,
          symbol,
          type: "base",
          indication_category: "main",
          indication_type: indicationType,
          indication_step: step,
          direction,
          strength,
          entry_price: entryPrice,
          takeprofit_factor: tpFactor,
          stoploss_ratio: step * 0.1, // SL based on step
          position_cost: positionCost,
          created_at: new Date().toISOString(),
        })
      }
    }

    return positions
  }

  /**
   * Save positions to the database
   */
  private async savePositions(positions: any[]): Promise<void> {
    if (positions.length === 0) return

    const client = getRedisClient()

    // Index keys
    const allPositionsKey = `preset_pseudo_positions:all`
    const connectionKey = `preset_pseudo_positions:connection:${this.connectionId}`
    const presetKey = `preset_pseudo_positions:preset:${this.presetId}`

    for (const p of positions) {
      const id = p.id
      const positionKey = `preset_pseudo_position:${id}`

      await client.hset(positionKey, Object.fromEntries(
        Object.entries(p).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])
      ))

      // Add to global indexes
      await client.sadd(allPositionsKey, id)
      await client.sadd(connectionKey, id)
      await client.sadd(presetKey, id)

      // Add to symbol-specific index
      await client.sadd(`preset_pseudo_positions:symbol:${p.symbol}`, id)

      // Add to type and category indexes
      await client.sadd(`preset_pseudo_positions:type:${p.type}`, id)
      if (p.indication_category) {
        await client.sadd(`preset_pseudo_positions:category:${p.indication_category}`, id)
      }

      // Add to status index
      await client.sadd(`preset_pseudo_positions:status:active`, id)

      // Add to combined indexes
      await client.sadd(`preset_pseudo_positions:connection:${this.connectionId}:preset:${this.presetId}:type:${p.type}:status:active`, id)
    }
  }

  private async processRealPositions(config: PresetTradeEngineConfig): Promise<void> {
    console.log("[v0] Processing real positions")

    const client = getRedisClient()

    // Get all real active positions for this connection/preset
    const realPositionsIds = await client.smembers(`preset_pseudo_positions:connection:${this.connectionId}:preset:${this.presetId}:type:real:status:active`)
    
    const realPositions: any[] = []
    for (const id of realPositionsIds) {
      const pos = await client.hgetall(`preset_pseudo_position:${id}`)
      if (pos && pos.type === 'real' && pos.status === 'active') {
        realPositions.push({ ...pos, id })
      }
    }

    if (realPositions.length === 0) return

    const exchangePositions = await this.fetchExchangePositions()

    // Match and update
    const updates: any[] = []

    for (const realPos of realPositions) {
      const exchangePos = exchangePositions.find((ep: any) => ep.symbol === realPos.symbol)

      if (exchangePos) {
        updates.push({
          id: realPos.id,
          currentPrice: exchangePos.markPrice,
          profitLoss: exchangePos.unrealizedProfit,
        })
      }
    }

    if (updates.length > 0) {
      await this.batchUpdateRealPositions(updates)
    }
  }
}
