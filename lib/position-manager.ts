// Position management for trading bot
import { getRedisClient } from "./redis-db"
import { OrderExecutor } from "./order-executor"

export interface PositionUpdate {
  current_price: number
  unrealized_pnl: number
}

export class PositionManager {
  private orderExecutor: OrderExecutor

  constructor() {
    this.orderExecutor = new OrderExecutor()
  }

  async updatePosition(positionId: number, update: PositionUpdate): Promise<void> {
    const client = getRedisClient()
    const key = `position:${positionId}`
    await client.hset(key, {
      current_price: String(update.current_price),
      unrealized_pnl: String(update.unrealized_pnl),
      updated_at: new Date().toISOString()
    })
  }

  async checkStopLossAndTakeProfit(positionId: number): Promise<boolean> {
    const client = getRedisClient()
    const position = await client.hgetall(`position:${positionId}`)

    if (!position || position.status !== "open") return false

    const currentPrice = parseFloat(position.current_price || "0")
    const stopLoss = position.stop_loss ? parseFloat(position.stop_price || "0") : null
    const takeProfit = position.take_profit ? parseFloat(position.take_price || "0") : null
    const positionType = position.position_type || "long"

    let shouldClose = false
    let closeReason = ""

    // Check stop loss
    if (stopLoss !== null) {
      if (positionType === "long" && currentPrice <= stopLoss) {
        shouldClose = true
        closeReason = "Stop loss triggered"
      } else if (positionType === "short" && currentPrice >= stopLoss) {
        shouldClose = true
        closeReason = "Stop loss triggered"
      }
    }

    // Check take profit
    if (takeProfit !== null && !shouldClose) {
      if (positionType === "long" && currentPrice >= takeProfit) {
        shouldClose = true
        closeReason = "Take profit triggered"
      } else if (positionType === "short" && currentPrice <= takeProfit) {
        shouldClose = true
        closeReason = "Take profit triggered"
      }
    }

    if (shouldClose) {
      console.log(`[v0] ${closeReason} for position ${positionId}`)
      const userIdNum = parseInt(position.user_id || "0", 10)
      await this.closePosition(positionId, userIdNum, closeReason)
      return true
    }

    return false
  }

  async closePosition(positionId: number, userId: number, reason: string): Promise<boolean> {
    try {
      const client = getRedisClient()
      const position = await client.hgetall(`position:${positionId}`)

      if (!position || position.status !== "open") return false

      // Calculate realized PnL
      const realizedPnl = this.calculateRealizedPnL(position)

      // Execute closing order
      const closeSide = position.position_type === "long" ? "sell" : "buy"

      const executionResult = await this.orderExecutor.executeOrder({
        user_id: parseInt(position.user_id || "0", 10),
        portfolio_id: parseInt(position.portfolio_id || "0", 10),
        trading_pair_id: parseInt(position.trading_pair_id || "0", 10),
        order_type: "market",
        side: closeSide,
        quantity: parseFloat(position.quantity || "0"),
      })

      if (!executionResult.success) {
        console.error("[v0] Failed to execute closing order:", executionResult.error)
        return false
      }

      // Update position status
      await client.hset(`position:${positionId}`, {
        status: "closed",
        realized_pnl: String(realizedPnl),
        closed_at: new Date().toISOString()
      })

      // Update portfolio value
      await this.updatePortfolioValue(parseInt(position.portfolio_id || "0", 10), realizedPnl)

      console.log(`[v0] Position ${positionId} closed. Reason: ${reason}. PnL: ${realizedPnl}`)

      return true
    } catch (error) {
      console.error("[v0] Error closing position:", error)
      return false
    }
  }

  private calculateRealizedPnL(position: any): number {
    const entryPrice = parseFloat(position.entry_price || "0")
    const currentPrice = parseFloat(position.current_price || "0")
    const quantity = parseFloat(position.quantity || "0")
    const leverage = parseFloat(position.leverage || "1")
    const priceDiff = currentPrice - entryPrice
    const multiplier = position.position_type === "long" ? 1 : -1

    return priceDiff * quantity * multiplier * leverage
  }

  private async updatePortfolioValue(portfolioId: number, pnlChange: number): Promise<void> {
    const client = getRedisClient()
    const key = `portfolio:${portfolioId}`
    const portfolio = await client.hgetall(key)
    const currentValue = parseFloat(portfolio?.total_value || "0")
    await client.hset(key, {
      total_value: String(currentValue + pnlChange),
      updated_at: new Date().toISOString()
    })
  }

  async getOpenPositions(portfolioId: number) {
    const client = getRedisClient()
    const positionIds = await client.smembers("positions") || []
    const positions = []

    for (const id of positionIds) {
      const pos = await client.hgetall(`position:${id}`)
      if (pos && pos.portfolio_id === String(portfolioId) && pos.status === "open") {
        // Fetch trading pair data
        const tradingPairId = pos.trading_pair_id
        if (tradingPairId) {
          const tp = await client.hgetall(`trading_pair:${tradingPairId}`)
          positions.push({
            ...pos,
            id,
            symbol: tp?.symbol || null,
            base_currency: tp?.base_currency || null,
            quote_currency: tp?.quote_currency || null,
            opened_at: pos.opened_at || null
          } as any)
        }
      }
    }

    // Sort by opened_at descending
    return positions.sort((a: any, b: any) => {
      const aTime = a.opened_at ? new Date(a.opened_at).getTime() : 0
      const bTime = b.opened_at ? new Date(b.opened_at).getTime() : 0
      return bTime - aTime
    })
  }

  async updateTrailingStop(positionId: number): Promise<void> {
    const client = getRedisClient()
    const position = await client.hgetall(`position:${positionId}`)

    if (!position || position.status !== "open") return

    // Only update if position has unrealized profit
    const unrealizedPnl = parseFloat(position.unrealized_pnl || "0")
    if (unrealizedPnl <= 0) return

    const entryPrice = parseFloat(position.entry_price || "0")
    const trailingStopDistance = entryPrice * 0.02 // 2% trailing
    const currentPrice = parseFloat(position.current_price || "0")

    let newStopLoss: number

    if (position.position_type === "long") {
      newStopLoss = currentPrice - trailingStopDistance
      // Only update if new stop loss is higher than current
      const currentStopLoss = position.stop_loss ? parseFloat(position.stop_loss || "0") : null
      if (currentStopLoss === null || newStopLoss > currentStopLoss) {
        await client.hset(`position:${positionId}`, { stop_loss: String(newStopLoss) })
        console.log(`[v0] Updated trailing stop for position ${positionId} to ${newStopLoss}`)
      }
    } else {
      newStopLoss = currentPrice + trailingStopDistance
      // Only update if new stop loss is lower than current
      const currentStopLoss = position.stop_loss ? parseFloat(position.stop_loss || "0") : null
      if (currentStopLoss === null || newStopLoss < currentStopLoss) {
        await client.hset(`position:${positionId}`, { stop_loss: String(newStopLoss) })
        console.log(`[v0] Updated trailing stop for position ${positionId} to ${newStopLoss}`)
      }
    }
  }
}
