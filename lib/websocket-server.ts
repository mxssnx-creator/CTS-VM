// WebSocket server for real-time data streaming using real exchange data
import { 
  getSymbolPrice, 
  getMostVolatileSymbols,
  type MarketPriceData 
} from "./market-data-service"
import { getRedisClient, initRedis } from "./redis-db"

export interface WebSocketMessage {
  type: string
  data: any
  timestamp: string
}

export interface PriceUpdate {
  symbol: string
  price: number
  change_24h: number
  volume_24h: number
}

export interface PositionUpdate {
  position_id: string
  symbol: string
  current_price: number
  unrealized_pnl: number
  pnl_percent: number
  side: "long" | "short"
  entry_price: number
  size: number
}

export class WebSocketManager {
  private connections: Set<any> = new Set()
  private priceUpdateInterval?: NodeJS.Timeout
  private positionUpdateInterval?: NodeJS.Timeout
  private volatileSymbols: MarketPriceData[] = []
  private lastPriceData = new Map<string, MarketPriceData>()

  constructor() {
    this.startPriceUpdates()
    this.startPositionUpdates()
    this.fetchVolatileSymbols()
  }

  addConnection(connection: any) {
    this.connections.add(connection)
    console.log(`[v0] WebSocket connection added. Total: ${this.connections.size}`)
  }

  removeConnection(connection: any) {
    this.connections.delete(connection)
    console.log(`[v0] WebSocket connection removed. Total: ${this.connections.size}`)
  }

  broadcast(message: WebSocketMessage) {
    const messageStr = JSON.stringify(message)
    this.connections.forEach((connection) => {
      try {
        if (connection.readyState === 1) {
          // OPEN state
          connection.send(messageStr)
        }
      } catch (error) {
        console.error("[v0] Error broadcasting message:", error)
        this.connections.delete(connection)
      }
    })
  }

  /**
   * Fetch and cache the most volatile symbols for display
   */
  private async fetchVolatileSymbols() {
    try {
      this.volatileSymbols = await getMostVolatileSymbols(10)
      console.log(`[v0] [WebSocket] Loaded ${this.volatileSymbols.length} volatile symbols`)
    } catch (error) {
      console.error("[v0] [WebSocket] Failed to fetch volatile symbols:", error)
    }
  }

  /**
   * Get real position data from Redis/database
   */
  private async getRealPositions(): Promise<PositionUpdate[]> {
    try {
      await initRedis()
      const client = getRedisClient()
      
      // Get all position keys
      const positionKeys = await client.keys("position:*")
      const positions: PositionUpdate[] = []

      for (const key of positionKeys.slice(0, 10)) { // Limit to 10 positions
        const posData = await client.get(key)
        if (posData) {
          try {
            const pos = JSON.parse(posData)
            // Get current price for this symbol
            const currentPrice = await getSymbolPrice(pos.symbol)
            
            if (currentPrice) {
              // Calculate unrealized P&L
              const priceDiff = currentPrice.price - pos.entry_price
              const isLong = pos.side === "long" || pos.side === "LONG"
              const unrealizedPnl = isLong 
                ? priceDiff * pos.size 
                : -priceDiff * pos.size
              const pnlPercent = (priceDiff / pos.entry_price) * 100 * (isLong ? 1 : -1)

              positions.push({
                position_id: pos.id || key.replace("position:", ""),
                symbol: pos.symbol,
                current_price: currentPrice.price,
                unrealized_pnl: unrealizedPnl,
                pnl_percent: pnlPercent,
                side: isLong ? "long" : "short",
                entry_price: pos.entry_price,
                size: pos.size,
              })
            }
          } catch (e) {
            // Skip invalid position data
          }
        }
      }

      return positions
    } catch (error) {
      console.error("[v0] [WebSocket] Failed to get positions:", error)
      return []
    }
  }

  private startPriceUpdates() {
    // Fetch real-time price updates every 3 seconds
    this.priceUpdateInterval = setInterval(async () => {
      try {
        // Get prices for tracked symbols
        const symbolsToTrack = this.volatileSymbols.length > 0 
          ? this.volatileSymbols.map(s => s.symbol)
          : ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"]

        for (const symbol of symbolsToTrack.slice(0, 5)) {
          const priceData = await getSymbolPrice(symbol)
          if (priceData) {
            this.lastPriceData.set(symbol, priceData)
            
            this.broadcast({
              type: "price_update",
              data: {
                symbol: priceData.symbol,
                price: priceData.price,
                change_24h: priceData.change_24h_percent,
                volume_24h: priceData.volume_24h,
                high_24h: priceData.high_24h,
                low_24h: priceData.low_24h,
              },
              timestamp: priceData.last_update,
            })
          }
        }

        // Refresh volatile symbols list every minute
        if (Date.now() % 60000 < 3000) {
          this.fetchVolatileSymbols()
        }
      } catch (error) {
        console.error("[v0] [WebSocket] Error in price updates:", error)
      }
    }, 3000)
  }

  private startPositionUpdates() {
    // Fetch real position updates every 5 seconds
    this.positionUpdateInterval = setInterval(async () => {
      try {
        const positions = await this.getRealPositions()
        
        for (const position of positions) {
          this.broadcast({
            type: "position_update",
            data: position,
            timestamp: new Date().toISOString(),
          })
        }
      } catch (error) {
        console.error("[v0] [WebSocket] Error in position updates:", error)
      }
    }, 5000)
  }

  stop() {
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval)
    }
    if (this.positionUpdateInterval) {
      clearInterval(this.positionUpdateInterval)
    }
    this.connections.clear()
  }

  /**
   * Get the current most volatile symbols
   */
  getVolatileSymbols(): MarketPriceData[] {
    return this.volatileSymbols
  }
}

// Global WebSocket manager instance
let wsManager: WebSocketManager | null = null

export function getWebSocketManager(): WebSocketManager {
  if (!wsManager) {
    wsManager = new WebSocketManager()
  }
  return wsManager
}
