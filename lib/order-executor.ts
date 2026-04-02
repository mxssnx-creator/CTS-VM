// Order execution engine for trading bot
import { getRedisClient } from "./redis-db"

export interface OrderParams {
  user_id: number
  portfolio_id: number
  trading_pair_id: number
  order_type: "market" | "limit" | "stop_loss" | "take_profit"
  side: "buy" | "sell"
  price?: number
  quantity: number
  time_in_force?: "GTC" | "IOC" | "FOK"
}

export interface ExecutionResult {
  success: boolean
  order_id?: number
  filled_quantity?: number
  average_price?: number
  error?: string
}

export class OrderExecutor {
  private async getNextOrderId(): Promise<number> {
    const client = getRedisClient()
    return await client.hincrby("counters", "order_id", 1)
  }

  async executeOrder(params: OrderParams): Promise<ExecutionResult> {
    try {
      console.log("[v0] Executing order:", params)
      const client = getRedisClient()
      
      // Fetch trading pair symbol for denormalization
      const tp = await client.hgetall(`trading_pair:${params.trading_pair_id}`)
      const symbol = tp?.symbol || null
      
      // Generate order ID
      const orderId = await this.getNextOrderId()
      const now = Date.now()
      
      // Build order hash data
      const orderData: Record<string, string> = {
        id: String(orderId),
        user_id: String(params.user_id),
        portfolio_id: String(params.portfolio_id),
        trading_pair_id: String(params.trading_pair_id),
        order_type: params.order_type,
        side: params.side,
        quantity: String(params.quantity),
        remaining_quantity: String(params.quantity),
        status: "pending",
        time_in_force: params.time_in_force || "GTC",
        created_at: String(now),
      }
      if (params.price !== undefined && params.price !== null) {
        orderData.price = String(params.price)
      }
      if (symbol) {
        orderData.symbol = symbol
      }
      
      // Store order hash
      await client.hset(`order:${orderId}`, orderData)
      
      // Add to orders sets
      await client.sadd("orders", String(orderId))
      await client.sadd(`user:${params.user_id}:orders`, String(orderId))
      
      // Simulate execution
      const executionPrice = params.price || await this.getMarketPrice(params.trading_pair_id)
      const filledQuantity = params.quantity
      const executedAt = Date.now()
      
      // Update order to filled status
      const updateData: Record<string, string> = {
        status: "filled",
        filled_quantity: String(filledQuantity),
        average_fill_price: String(executionPrice),
        executed_at: String(executedAt),
        remaining_quantity: "0"
      }
      await client.hset(`order:${orderId}`, updateData)
      
      // Create trade record
      const tradeId = `trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const tradeData: Record<string, string> = {
        id: tradeId,
        order_id: String(orderId),
        user_id: String(params.user_id),
        price: String(executionPrice),
        quantity: String(filledQuantity),
        executed_at: String(executedAt)
      }
      if (symbol) {
        tradeData.symbol = symbol
      }
      await client.hset(`trade:${tradeId}`, tradeData)
      await client.sadd("trades", tradeId)
      
      console.log(`[v0] Order ${orderId} executed successfully`)
      
      return {
        success: true,
        order_id: orderId,
        filled_quantity: filledQuantity,
        average_price: executionPrice,
      }
    } catch (error) {
      console.error("[v0] Order execution error:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  async cancelOrder(orderId: number, userId: number): Promise<boolean> {
    try {
      const client = getRedisClient()
      const orderKey = `order:${orderId}`
      const order = await client.hgetall(orderKey)
      if (!order || Object.keys(order).length === 0) {
        return false
      }
      
      const orderUserId = parseInt(order.user_id || "0", 10)
      const status = order.status || ""
      if (orderUserId !== userId || !["pending", "open"].includes(status)) {
        return false
      }
      
      await client.hset(orderKey, { status: "cancelled" })
      return true
    } catch (error) {
      console.error("[v0] Order cancellation error:", error)
      return false
    }
  }

  private async getMarketPrice(tradingPairId: number): Promise<number> {
    const client = getRedisClient()
    const tp = await client.hgetall(`trading_pair:${tradingPairId}`)
    const symbol = tp?.symbol
    if (!symbol) {
      return 50000
    }
    
    const marketDataRaw = await client.get(`market_data:${symbol}`)
    if (!marketDataRaw) {
      return 50000
    }
    try {
      const marketData = JSON.parse(marketDataRaw)
      return parseFloat(marketData.close) || 50000
    } catch {
      return 50000
    }
  }

  async getOrderStatus(orderId: number, userId: number) {
    const client = getRedisClient()
    const order = await client.hgetall(`order:${orderId}`)
    
    if (!order || Object.keys(order).length === 0) {
      return null
    }
    
    const orderUserId = parseInt(order.user_id || "0", 10)
    if (orderUserId !== userId) {
      return null
    }
    
    // Ensure symbol is present
    if (!order.symbol) {
      const tp = await client.hgetall(`trading_pair:${order.trading_pair_id}`)
      if (tp?.symbol) {
        order.symbol = tp.symbol
      }
    }
    
    return order
  }
}
