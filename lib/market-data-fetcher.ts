// Market data fetcher for real-time price updates
import { getRedisClient, saveMarketData } from "./redis-db"

export interface MarketDataPoint {
  trading_pair_id: number
  symbol: string
  timestamp: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export class MarketDataFetcher {
  private isRunning = false
  private fetchInterval?: NodeJS.Timeout
  private updateInterval: number

  constructor(updateInterval = 60000) {
    // Default 1 minute
    this.updateInterval = updateInterval
  }

  async start() {
    if (this.isRunning) return

    console.log("[v0] Starting market data fetcher...")
    this.isRunning = true

    // Fetch immediately
    await this.fetchMarketData()

    // Then fetch at intervals
    this.fetchInterval = setInterval(() => {
      this.fetchMarketData()
    }, this.updateInterval)
  }

  stop() {
    if (this.fetchInterval) {
      clearInterval(this.fetchInterval)
      this.fetchInterval = undefined
    }
    this.isRunning = false
    console.log("[v0] Market data fetcher stopped")
  }

  private async fetchMarketData() {
    try {
      const client = getRedisClient()
      
      // Get all trading pair IDs from the set
      const tradingPairIds = await client.smembers("trading_pairs") || []
      const tradingPairs = []

      // Filter active pairs and get symbol from hash
      for (const id of tradingPairIds) {
        const hashKey = `trading_pair:${id}`
        const pairData = await client.hgetall(hashKey)
        
        if (pairData && pairData.is_active === "1") {
          tradingPairs.push({
            id: parseInt(id, 10),
            symbol: pairData.symbol || ""
          })
        }
      }

      for (const pair of tradingPairs) {
        // Simulate fetching market data (in production, call exchange API)
        const marketData = this.generateMarketData(pair.id, pair.symbol)

        // Store in Redis as JSON
        await saveMarketData(pair.symbol, marketData)
      }

      console.log(`[v0] Fetched market data for ${tradingPairs.length} trading pairs`)
    } catch (error) {
      console.error("[v0] Error fetching market data:", error)
    }
  }

  private generateMarketData(tradingPairId: number, symbol: string): MarketDataPoint {
    const basePrice = 50000
    const volatility = 1000

    const open = basePrice + (Math.random() - 0.5) * volatility
    const close = open + (Math.random() - 0.5) * volatility * 0.5
    const high = Math.max(open, close) + Math.random() * volatility * 0.2
    const low = Math.min(open, close) - Math.random() * volatility * 0.2
    const volume = 1000000 + Math.random() * 500000

    return {
      trading_pair_id: tradingPairId,
      symbol,
      timestamp: new Date(),
      open,
      high,
      low,
      close,
      volume,
    }
  }
}

// Global market data fetcher instance
let marketDataFetcher: MarketDataFetcher | null = null

export function getMarketDataFetcher(): MarketDataFetcher {
  if (!marketDataFetcher) {
    marketDataFetcher = new MarketDataFetcher()
  }
  return marketDataFetcher
}

export function startMarketDataFetcher(interval?: number) {
  const fetcher = getMarketDataFetcher()
  fetcher.start()
  return fetcher
}