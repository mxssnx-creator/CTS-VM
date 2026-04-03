import { NextResponse, type NextRequest } from "next/server"
import { initRedis, getSettings, setSettings, getMarketData, getAllConnections, saveMarketData } from "@/lib/redis-db"
import { BingXMarketDataService } from "@/lib/bingx-market-data"

export const runtime = "nodejs"

/**
 * GET /api/market-data
 * Returns market data - uses real Redis-cached data first, then real exchange API, then synthetic fallback
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const symbol = searchParams.get("symbol") || "BTCUSDT"
    const exchange = searchParams.get("exchange") || "bybit"
    const interval = searchParams.get("interval") || "1m"

    await initRedis()

    // Try to get real market data from Redis first (populated by engine or market data loader)
    const realData = await getMarketData(symbol)
    if (realData && realData.price) {
      return NextResponse.json({
        success: true,
        data: {
          ...realData,
          timestamp: Date.now(),
          datetime: new Date().toISOString(),
          last_update: new Date().toISOString(),
        },
        source: "redis",
      })
    }

    // Try to fetch from exchange API if credentials exist
    const exchangeData = await fetchFromExchange(symbol, exchange, interval)
    if (exchangeData) {
      return NextResponse.json({
        success: true,
        data: exchangeData,
        source: "exchange",
      })
    }

    // Synthetic fallback
    const basePrice = getBasePrice(symbol)
    const variation = basePrice * 0.02
    
    const marketData = {
      symbol,
      exchange,
      interval,
      price: basePrice + (Math.random() - 0.5) * variation,
      open: basePrice,
      high: basePrice + variation,
      low: basePrice - variation,
      close: basePrice + (Math.random() - 0.5) * variation,
      volume: Math.random() * 1000000,
      volume_24h: Math.random() * 10000000,
      high_24h: basePrice + variation,
      low_24h: basePrice - variation,
      change_24h: (Math.random() - 0.5) * 5,
      change_24h_percentage: ((Math.random() - 0.5) * 5).toFixed(2) + "%",
      timestamp: Date.now(),
      datetime: new Date().toISOString(),
      bid: basePrice - 0.5,
      ask: basePrice + 0.5,
      bid_volume: Math.random() * 100,
      ask_volume: Math.random() * 100,
      last_update: new Date().toISOString(),
    }

    return NextResponse.json({
      success: true,
      data: marketData,
      source: "synthetic",
    })
  } catch (error) {
    console.error("[v0] Market data error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch market data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

async function fetchFromExchange(symbol: string, exchange: string, interval: string): Promise<any | null> {
  try {
    const allConnections = await getAllConnections()
    const conn = allConnections.find((c: any) => c.exchange === exchange && c.api_key && c.api_key.length >= 20)
    if (!conn) return null

    if (exchange === "bingx") {
      const bingxSymbol = symbol.endsWith("USDT") ? symbol.replace("USDT", "-USDT") : symbol + "-USDT"
      const service = new BingXMarketDataService({
        exchange: "bingx",
        apiType: conn.api_type || "perpetual_futures",
        isTestnet: conn.is_testnet === "1" || conn.is_testnet === true,
      })
      const candles = await service.fetchKlines(bingxSymbol, interval, 1)
      if (candles.length > 0) {
        const candle = candles[0]
        const data = {
          symbol,
          exchange,
          interval,
          price: candle.close,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
          timestamp: candle.timestamp,
          datetime: new Date(candle.timestamp).toISOString(),
          last_update: new Date().toISOString(),
        }
        await saveMarketData(symbol, data)
        return data
      }
    }
  } catch (error) {
    console.warn(`[v0] Exchange API fetch failed for ${exchange}/${symbol}:`, error instanceof Error ? error.message : String(error))
  }
  return null
}

/**
 * POST /api/market-data/batch
 * Fetch market data for multiple symbols
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { symbols, exchange = "bybit", interval = "1m" } = body

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json(
        { success: false, error: "Symbols array is required" },
        { status: 400 },
      )
    }

    await initRedis()

    const marketData: Record<string, any> = {}

    for (const symbol of symbols) {
      const cacheKey = `market:${exchange}:${symbol}:${interval}`
      let data = await getSettings(cacheKey)

      if (!data) {
        const basePrice = getBasePrice(symbol)
        const variation = basePrice * 0.02

        data = {
          symbol,
          exchange,
          interval,
          price: basePrice + (Math.random() - 0.5) * variation,
          open: basePrice,
          high: basePrice + variation,
          low: basePrice - variation,
          close: basePrice + (Math.random() - 0.5) * variation,
          volume: Math.random() * 1000000,
          timestamp: Date.now(),
          datetime: new Date().toISOString(),
          bid: basePrice - 0.5,
          ask: basePrice + 0.5,
          last_update: new Date().toISOString(),
        }

        await setSettings(cacheKey, JSON.stringify(data))
      } else if (typeof data === "string") {
        try {
          data = JSON.parse(data)
        } catch {
          // Use as-is if parsing fails
        }
      }

      marketData[symbol] = data
    }

    return NextResponse.json({
      success: true,
      count: Object.keys(marketData).length,
      data: marketData,
    })
  } catch (error) {
    console.error("[v0] Batch market data error:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch batch market data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

function getBasePrice(symbol: string): number {
  if (symbol.includes("BTC")) return 45000
  if (symbol.includes("ETH")) return 2500
  if (symbol.includes("BNB")) return 300
  if (symbol.includes("XRP")) return 0.5
  if (symbol.includes("ADA")) return 0.4
  if (symbol.includes("DOGE")) return 0.08
  if (symbol.includes("SOL")) return 100
  if (symbol.includes("MATIC")) return 0.8
  if (symbol.includes("DOT")) return 7
  if (symbol.includes("AVAX")) return 35
  return 100
}
