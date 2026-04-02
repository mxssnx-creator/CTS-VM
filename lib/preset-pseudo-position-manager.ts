/**
 * Preset Pseudo Position Manager
 * Handles asynchronous pseudo position calculation and updates
 * Separate from indication validation - runs independently
 * Updates every 1 second for all active configurations
 */

import { getRedisClient } from "@/lib/redis-db"
import type { PresetCoordinationResult } from "@/lib/types-preset-coordination"

function convertToString(value: any): string {
  // Handle booleans specially
  if (value === true) return "1"
  if (value === false) return "0"
  // Handle null/undefined
  if (value === null || value === undefined) return ""
  // Convert everything else to string
  return String(value)
}

export interface PseudoPositionConfig {
  id: string
  symbol: string
  direction: "long" | "short"
  indicationType: string
  indicationParams: any
  takeprofitFactor: number
  stoplossRatio: number
  trailingEnabled: boolean
  trailStart: number | null
  trailStop: number | null
  entryPrice: number
  quantity: number
  leverage: number
}

export interface PseudoPositionUpdate {
  id: string
  currentPrice: number
  unrealizedPnl: number
  unrealizedPnlPercent: number
  status: "open" | "closed"
  exitPrice?: number
  exitReason?: string
  closedAt?: string
}

export class PresetPseudoPositionManager {
  private connectionId: string
  private presetTypeId: string
  private updateInterval?: NodeJS.Timeout
  private isRunning = false
  private readonly UPDATE_INTERVAL_MS = 1000 // 1 second
  private readonly MAX_POSITIONS_PER_CONFIG = 250

  private activePseudoPositions: Map<string, PseudoPositionConfig> = new Map()
  private positionsByConfig: Map<string, Set<string>> = new Map()
  private trailHighPrices: Map<string, number> = new Map()

  constructor(connectionId: string, presetTypeId: string) {
    this.connectionId = connectionId
    this.presetTypeId = presetTypeId
  }

  /**
   * Start async pseudo position updates (1 second interval)
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("[v0] Pseudo position manager already running")
      return
    }

    console.log("[v0] Starting pseudo position manager with 1s interval")

    // Load existing active pseudo positions
    await this.loadActivePseudoPositions()

    // Start 1-second update loop
    this.updateInterval = setInterval(async () => {
      try {
        await this.updateAllPseudoPositions()
      } catch (error) {
        console.error("[v0] Pseudo position update error:", error)
      }
    }, this.UPDATE_INTERVAL_MS)

    this.isRunning = true
    console.log("[v0] Pseudo position manager started")
  }

  /**
   * Stop async updates
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return

    console.log("[v0] Stopping pseudo position manager")

    if (this.updateInterval) {
      clearInterval(this.updateInterval)
    }

    this.isRunning = false
    console.log("[v0] Pseudo position manager stopped")
  }

  /**
   * Create new pseudo position (called from indication validation)
   * This is SEPARATE from indication calculation
   */
  async createPseudoPosition(
    coordinationResult: PresetCoordinationResult,
    signal: { direction: "long" | "short"; strength: number },
    currentPrice: number,
  ): Promise<string | null> {
    const configKey = this.getConfigKey(coordinationResult, signal.direction)

    // Check position limit for this specific configuration
    const currentCount = this.positionsByConfig.get(configKey)?.size || 0
    if (currentCount >= this.MAX_POSITIONS_PER_CONFIG) {
      console.log(`[v0] Position limit reached for config ${configKey}`)
      return null
    }

    // Create pseudo position
    const positionId = this.generateId()
    // Fixed quantity used for all Main positions - volume tracking is ratio-based
    const quantity = 100 // Ratio-based unit, not actual exchange volume
    const leverage = 1

    const config: PseudoPositionConfig = {
      id: positionId,
      symbol: coordinationResult.symbol,
      direction: signal.direction,
      indicationType: coordinationResult.indication_type,
      indicationParams: coordinationResult.indication_params,
      takeprofitFactor: coordinationResult.takeprofit_factor,
      stoplossRatio: coordinationResult.stoploss_ratio,
      trailingEnabled: coordinationResult.trailing_enabled,
      trailStart: coordinationResult.trail_start ?? null,
      trailStop: coordinationResult.trail_stop ?? null,
      entryPrice: currentPrice,
      quantity,
      leverage,
    }

    // Store in Redis
    await this.storePseudoPosition(config)

    // Add to active tracking
    this.activePseudoPositions.set(positionId, config)

    if (!this.positionsByConfig.has(configKey)) {
      this.positionsByConfig.set(configKey, new Set())
    }
    this.positionsByConfig.get(configKey)!.add(positionId)

    console.log(`[v0] Created pseudo position ${positionId} for ${coordinationResult.symbol}`)

    return positionId
  }

  /**
   * Update all active pseudo positions (runs every 1 second)
   * This is ASYNCHRONOUS and independent from indication calculation
   */
  private async updateAllPseudoPositions(): Promise<void> {
    if (this.activePseudoPositions.size === 0) {
      return
    }

    console.log(`[v0] Updating ${this.activePseudoPositions.size} pseudo positions`)

    // Get current prices for all symbols
    const symbols = new Set(Array.from(this.activePseudoPositions.values()).map((p) => p.symbol))
    const priceMap = await this.getCurrentPrices(Array.from(symbols))

    // Process positions in parallel batches
    const positions = Array.from(this.activePseudoPositions.values())
    const batchSize = 50
    const batches = this.createBatches(positions, batchSize)

    await Promise.all(
      batches.map(async (batch) => {
        await Promise.all(
          batch.map(async (position) => {
            const currentPrice = priceMap.get(position.symbol)
            if (!currentPrice) return

            const update = this.calculatePositionUpdate(position, currentPrice)

            if (update.status === "closed") {
              // Position closed - remove from active tracking
              await this.closePseudoPosition(position.id, update)
              this.activePseudoPositions.delete(position.id)

              const configKey = this.getConfigKeyFromPosition(position)
              this.positionsByConfig.get(configKey)?.delete(position.id)
            } else {
              // Update position
              await this.updatePseudoPosition(position.id, update)
            }
          }),
        )
      }),
    )
  }

  /**
   * Calculate position update based on current price
   */
  private calculatePositionUpdate(position: PseudoPositionConfig, currentPrice: number): PseudoPositionUpdate {
    const isLong = position.direction === "long"
    const priceDiff = isLong ? currentPrice - position.entryPrice : position.entryPrice - currentPrice
    const priceDiffPercent = (priceDiff / position.entryPrice) * 100

    const unrealizedPnl = priceDiff * position.quantity * position.leverage
    const unrealizedPnlPercent = priceDiffPercent * position.leverage

    // Check exit conditions
    const tpPrice = isLong
      ? position.entryPrice * (1 + position.takeprofitFactor / 100)
      : position.entryPrice * (1 - position.takeprofitFactor / 100)

    const slPrice = isLong
      ? position.entryPrice * (1 - position.stoplossRatio / 100)
      : position.entryPrice * (1 + position.stoplossRatio / 100)

    // Check TP
    if ((isLong && currentPrice >= tpPrice) || (!isLong && currentPrice <= tpPrice)) {
      return {
        id: position.id,
        currentPrice,
        unrealizedPnl,
        unrealizedPnlPercent,
        status: "closed",
        exitPrice: currentPrice,
        exitReason: "takeprofit",
        closedAt: new Date().toISOString(),
      }
    }

    // Check SL
    if ((isLong && currentPrice <= slPrice) || (!isLong && currentPrice >= slPrice)) {
      return {
        id: position.id,
        currentPrice,
        unrealizedPnl,
        unrealizedPnlPercent,
        status: "closed",
        exitPrice: currentPrice,
        exitReason: "stoploss",
        closedAt: new Date().toISOString(),
      }
    }

    if (position.trailingEnabled && position.trailStart !== null && position.trailStop !== null) {
      // Get the position's tracked high/low price from memory or calculate
      const positionKey = `trail_${position.id}`
      const trailHighPrice = this.trailHighPrices.get(positionKey) || position.entryPrice

      // Calculate profit percentage from entry
      const profitPercent = isLong
        ? ((currentPrice - position.entryPrice) / position.entryPrice) * 100
        : ((position.entryPrice - currentPrice) / position.entryPrice) * 100

      // Check if trailing stop should be activated (profit >= trailStart%)
      if (profitPercent >= position.trailStart) {
        // Update trail high price if current price is better
        if (isLong && currentPrice > trailHighPrice) {
          this.trailHighPrices.set(positionKey, currentPrice)
        } else if (!isLong && currentPrice < trailHighPrice) {
          this.trailHighPrices.set(positionKey, currentPrice)
        }

        const updatedTrailPrice = this.trailHighPrices.get(positionKey) || trailHighPrice

        // Calculate trailing stop price based on trail high/low
        const trailStopPrice = isLong
          ? updatedTrailPrice * (1 - position.trailStop / 100)
          : updatedTrailPrice * (1 + position.trailStop / 100)

        // Check if trailing stop hit
        if ((isLong && currentPrice <= trailStopPrice) || (!isLong && currentPrice >= trailStopPrice)) {
          // Clean up trail tracking
          this.trailHighPrices.delete(positionKey)

          return {
            id: position.id,
            currentPrice,
            unrealizedPnl,
            unrealizedPnlPercent,
            status: "closed",
            exitPrice: currentPrice,
            exitReason: "trailing_stop",
            closedAt: new Date().toISOString(),
          }
        }
      }
    }

    return {
      id: position.id,
      currentPrice,
      unrealizedPnl,
      unrealizedPnlPercent,
      status: "open",
    }
  }

  /**
   * Load active pseudo positions from Redis
   */
  private async loadActivePseudoPositions(): Promise<void> {
    const client = getRedisClient()
    
    // Get all position IDs for this connection and preset from index sets
    const [connectionIds, presetIds] = await Promise.all([
      client.smembers(`preset_pseudo_positions:connection:${this.connectionId}`),
      client.smembers(`preset_pseudo_positions:preset:${this.presetTypeId}`)
    ])

    // Find intersection of both sets (positions that belong to both this connection and preset)
    const positionIds = connectionIds.filter(id => presetIds.includes(id))

    // Load each position and filter by status = open
    for (const id of positionIds) {
      const pos = await client.hgetall(`preset_pseudo_position:${id}`)
      if (pos && pos.status === "open") {
        const config: PseudoPositionConfig = {
          id: pos.id,
          symbol: pos.symbol,
          direction: pos.direction as "long" | "short",
          indicationType: pos.indication_type,
          indicationParams: JSON.parse(pos.indication_params || "{}"),
          takeprofitFactor: parseFloat(pos.takeprofit_factor),
          stoplossRatio: parseFloat(pos.stoploss_ratio),
          trailingEnabled: pos.trailing_enabled === "1",
          trailStart: pos.trail_start ? parseFloat(pos.trail_start) : null,
          trailStop: pos.trail_stop ? parseFloat(pos.trail_stop) : null,
          entryPrice: parseFloat(pos.entry_price),
          quantity: parseFloat(pos.quantity),
          leverage: parseFloat(pos.leverage),
        }

        this.activePseudoPositions.set(config.id, config)

        const configKey = this.getConfigKeyFromPosition(config)
        if (!this.positionsByConfig.has(configKey)) {
          this.positionsByConfig.set(configKey, new Set())
        }
        this.positionsByConfig.get(configKey)!.add(config.id)
      }
    }

    console.log(`[v0] Loaded ${this.activePseudoPositions.size} active pseudo positions`)
  }

  /**
   * Store new pseudo position in Redis
   */
  private async storePseudoPosition(config: PseudoPositionConfig): Promise<void> {
    const client = getRedisClient()
    const key = `preset_pseudo_position:${config.id}`

    const data: Record<string, string> = {
      id: config.id,
      connection_id: this.connectionId,
      preset_type_id: this.presetTypeId,
      symbol: config.symbol,
      direction: config.direction,
      indication_type: config.indicationType,
      indication_params: JSON.stringify(config.indicationParams),
      takeprofit_factor: String(config.takeprofitFactor),
      stoploss_ratio: String(config.stoplossRatio),
      trailing_enabled: config.trailingEnabled ? "1" : "0",
      trail_start: config.trailStart !== null ? String(config.trailStart) : "",
      trail_stop: config.trailStop !== null ? String(config.trailStop) : "",
      entry_price: String(config.entryPrice),
      quantity: String(config.quantity),
      leverage: String(config.leverage),
      status: "open",
      opened_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    await client.hset(key, data)

    // Add to index sets
    await Promise.all([
      client.sadd("preset_pseudo_positions", config.id),
      client.sadd(`preset_pseudo_positions:connection:${this.connectionId}`, config.id),
      client.sadd(`preset_pseudo_positions:preset:${this.presetTypeId}`, config.id),
      client.sadd(`preset_pseudo_positions:status:open`, config.id),
    ])
  }

  /**
   * Update pseudo position in Redis
   */
  private async updatePseudoPosition(positionId: string, update: PseudoPositionUpdate): Promise<void> {
    const client = getRedisClient()
    const key = `preset_pseudo_position:${positionId}`

    const data: Record<string, string> = {
      current_price: String(update.currentPrice),
      unrealized_pnl: String(update.unrealizedPnl),
      unrealized_pnl_percent: String(update.unrealizedPnlPercent),
      updated_at: new Date().toISOString(),
    }

    await client.hset(key, data)
  }

  /**
   * Close pseudo position in Redis
   */
  private async closePseudoPosition(positionId: string, update: PseudoPositionUpdate): Promise<void> {
    const client = getRedisClient()
    const key = `preset_pseudo_position:${positionId}`

    const data: Record<string, string> = {
      status: "closed",
      exit_price: String(update.exitPrice),
      exit_reason: update.exitReason || "",
      realized_pnl: String(update.unrealizedPnl),
      realized_pnl_percent: String(update.unrealizedPnlPercent),
      closed_at: update.closedAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    await client.hset(key, data)

    // Remove from open status index
    await client.srem(`preset_pseudo_positions:status:open`, positionId)
  }

  /**
   * Get current prices for symbols
   */
  private async getCurrentPrices(symbols: string[]): Promise<Map<string, number>> {
    if (!symbols || symbols.length === 0) {
      return new Map()
    }

    const priceMap = new Map<string, number>()

    // Use getMarketData from redis-db for each symbol
    const { getMarketData } = await import("@/lib/redis-db")

    for (const symbol of symbols) {
      const data = await getMarketData(symbol)
      if (data && data.price) {
        priceMap.set(symbol, parseFloat(data.price))
      }
    }

    return priceMap
  }

  /**
   * Get configuration key for position limit tracking
   */
  private getConfigKey(result: PresetCoordinationResult, direction: string): string {
    return `${result.symbol}-${result.indication_type}-${JSON.stringify(result.indication_params)}-${result.takeprofit_factor}-${result.stoploss_ratio}-${direction}-${result.trailing_enabled}-${result.trail_start}-${result.trail_stop}`
  }

  private getConfigKeyFromPosition(position: PseudoPositionConfig): string {
    return `${position.symbol}-${position.indicationType}-${JSON.stringify(position.indicationParams)}-${position.takeprofitFactor}-${position.stoplossRatio}-${position.direction}-${position.trailingEnabled}-${position.trailStart}-${position.trailStop}`
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    if (!items || items.length === 0 || batchSize <= 0) {
      return []
    }

    const batches: T[][] = []
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, Math.min(i + batchSize, items.length)))
    }
    return batches
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}