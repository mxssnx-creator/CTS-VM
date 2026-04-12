// Real-time market data service using exchange public APIs
// Fetches actual price data from exchanges without requiring authentication

export interface MarketPriceData {
  symbol: string
  price: number
  change_24h: number
  change_24h_percent: number
  volume_24h: number
  high_24h: number
  low_24h: number
  last_update: string
  source: string
}

export interface TickerData {
  symbol: string
  lastPrice: number
  priceChange: number
  priceChangePercent: number
  volume: number
  highPrice: number
  lowPrice: number
  quoteVolume: number
}

// Cache for market data
const priceCache = new Map<string, { data: MarketPriceData; timestamp: number }>()
const CACHE_TTL = 5000 // 5 seconds

/**
 * Fetch real-time ticker data from Binance public API
 */
async function fetchBinanceTickers(): Promise<TickerData[]> {
  try {
    const response = await fetch("https://fapi.binance.com/fapi/v1/ticker/24hr", {
      next: { revalidate: 0 },
    })
    if (!response.ok) throw new Error(`Binance API error: ${response.status}`)
    const data = await response.json()
    return data.map((t: any) => ({
      symbol: t.symbol,
      lastPrice: parseFloat(t.lastPrice),
      priceChange: parseFloat(t.priceChange),
      priceChangePercent: parseFloat(t.priceChangePercent),
      volume: parseFloat(t.volume),
      highPrice: parseFloat(t.highPrice),
      lowPrice: parseFloat(t.lowPrice),
      quoteVolume: parseFloat(t.quoteVolume),
    }))
  } catch (error) {
    console.error("[MarketData] Failed to fetch Binance tickers:", error)
    return []
  }
}

/**
 * Fetch real-time ticker data from Bybit public API
 */
async function fetchBybitTickers(): Promise<TickerData[]> {
  try {
    const response = await fetch("https://api.bybit.com/v5/market/tickers?category=linear", {
      next: { revalidate: 0 },
    })
    if (!response.ok) throw new Error(`Bybit API error: ${response.status}`)
    const data = await response.json()
    if (data.retCode !== 0) throw new Error(data.retMsg)
    return (data.result?.list || []).map((t: any) => ({
      symbol: t.symbol,
      lastPrice: parseFloat(t.lastPrice),
      priceChange: parseFloat(t.price24hPcnt) * parseFloat(t.lastPrice),
      priceChangePercent: parseFloat(t.price24hPcnt) * 100,
      volume: parseFloat(t.volume24h),
      highPrice: parseFloat(t.highPrice24h),
      lowPrice: parseFloat(t.lowPrice24h),
      quoteVolume: parseFloat(t.turnover24h),
    }))
  } catch (error) {
    console.error("[MarketData] Failed to fetch Bybit tickers:", error)
    return []
  }
}

/**
 * Fetch real-time ticker data from BingX public API
 */
async function fetchBingXTickers(): Promise<TickerData[]> {
  try {
    const response = await fetch("https://open-api.bingx.com/openApi/swap/v2/quote/tickers", {
      next: { revalidate: 0 },
    })
    if (!response.ok) throw new Error(`BingX API error: ${response.status}`)
    const data = await response.json()
    if (data.code !== 0) throw new Error(data.msg)
    return (data.data || []).map((t: any) => ({
      symbol: t.symbol,
      lastPrice: parseFloat(t.lastPrice),
      priceChange: parseFloat(t.priceChange),
      priceChangePercent: parseFloat(t.priceChangePercent),
      volume: parseFloat(t.volume),
      highPrice: parseFloat(t.highPrice),
      lowPrice: parseFloat(t.lowPrice),
      quoteVolume: parseFloat(t.quoteVolume),
    }))
  } catch (error) {
    console.error("[MarketData] Failed to fetch BingX tickers:", error)
    return []
  }
}

/**
 * Get the most volatile symbols from all exchanges
 */
export async function getMostVolatileSymbols(limit = 5): Promise<MarketPriceData[]> {
  try {
    // Fetch from all exchanges
    const [binanceTickers, bybitTickers, bingxTickers] = await Promise.all([
      fetchBinanceTickers(),
      fetchBybitTickers(),
      fetchBingXTickers(),
    ])

    // Combine and find most volatile
    const allTickers = [...binanceTickers, ...bybitTickers, ...bingxTickers]
    
    // Filter for USDT pairs only and sort by volatility (absolute price change %)
    const usdtPairs = allTickers.filter(t => t.symbol.endsWith("USDT"))
    const sortedByVolatility = usdtPairs.sort((a, b) => 
      Math.abs(b.priceChangePercent) - Math.abs(a.priceChangePercent)
    )

    // Get top volatile symbols
    const topVolatile = sortedByVolatility.slice(0, limit)

    return topVolatile.map(t => ({
      symbol: t.symbol,
      price: t.lastPrice,
      change_24h: t.priceChange,
      change_24h_percent: t.priceChangePercent,
      volume_24h: t.quoteVolume,
      high_24h: t.highPrice,
      low_24h: t.lowPrice,
      last_update: new Date().toISOString(),
      source: "multi-exchange",
    }))
  } catch (error) {
    console.error("[MarketData] Failed to get volatile symbols:", error)
    return []
  }
}

/**
 * Get real-time price for a specific symbol
 */
export async function getSymbolPrice(symbol: string): Promise<MarketPriceData | null> {
  const cacheKey = symbol.toUpperCase()
  const cached = priceCache.get(cacheKey)
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }

  try {
    // Try Binance first
    const response = await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${cacheKey}`, {
      next: { revalidate: 0 },
    })
    
    if (response.ok) {
      const data = await response.json()
      const priceData: MarketPriceData = {
        symbol: data.symbol,
        price: parseFloat(data.lastPrice),
        change_24h: parseFloat(data.priceChange),
        change_24h_percent: parseFloat(data.priceChangePercent),
        volume_24h: parseFloat(data.quoteVolume),
        high_24h: parseFloat(data.highPrice),
        low_24h: parseFloat(data.lowPrice),
        last_update: new Date().toISOString(),
        source: "binance",
      }
      priceCache.set(cacheKey, { data: priceData, timestamp: Date.now() })
      return priceData
    }

    // Fallback to Bybit
    const bybitResponse = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${cacheKey}`, {
      next: { revalidate: 0 },
    })
    
    if (bybitResponse.ok) {
      const data = await bybitResponse.json()
      const ticker = data.result?.list?.[0]
      if (ticker) {
        const priceData: MarketPriceData = {
          symbol: ticker.symbol,
          price: parseFloat(ticker.lastPrice),
          change_24h: parseFloat(ticker.price24hPcnt) * parseFloat(ticker.lastPrice),
          change_24h_percent: parseFloat(ticker.price24hPcnt) * 100,
          volume_24h: parseFloat(ticker.turnover24h),
          high_24h: parseFloat(ticker.highPrice24h),
          low_24h: parseFloat(ticker.lowPrice24h),
          last_update: new Date().toISOString(),
          source: "bybit",
        }
        priceCache.set(cacheKey, { data: priceData, timestamp: Date.now() })
        return priceData
      }
    }

    return null
  } catch (error) {
    console.error(`[MarketData] Failed to get price for ${symbol}:`, error)
    return cached?.data || null
  }
}

/**
 * Get top symbols by volume from an exchange
 */
export async function getTopSymbolsByVolume(exchange: string, limit = 10): Promise<string[]> {
  try {
    let tickers: TickerData[] = []
    
    switch (exchange.toLowerCase()) {
      case "binance":
        tickers = await fetchBinanceTickers()
        break
      case "bybit":
        tickers = await fetchBybitTickers()
        break
      case "bingx":
        tickers = await fetchBingXTickers()
        break
      default:
        tickers = await fetchBinanceTickers()
    }

    // Filter USDT pairs and sort by volume
    const usdtPairs = tickers.filter(t => t.symbol.endsWith("USDT"))
    const sortedByVolume = usdtPairs.sort((a, b) => b.volume - a.volume)
    
    return sortedByVolume.slice(0, limit).map(t => t.symbol)
  } catch (error) {
    console.error(`[MarketData] Failed to get top symbols for ${exchange}:`, error)
    // Return default symbols as fallback
    return ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"]
  }
}

/**
 * Fetch candlestick data for a symbol
 */
export async function getCandlestickData(
  symbol: string, 
  interval: string = "1h", 
  limit: number = 100
): Promise<any[]> {
  try {
    const response = await fetch(
      `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=${limit}`,
      { next: { revalidate: 0 } }
    )
    
    if (!response.ok) throw new Error(`Failed to fetch candles: ${response.status}`)
    
    const data = await response.json()
    return data.map((candle: any[]) => ({
      timestamp: candle[0],
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5]),
      close_time: candle[6],
    }))
  } catch (error) {
    console.error(`[MarketData] Failed to get candles for ${symbol}:`, error)
    return []
  }
}
