/**
 * BingX Market Data Service
 * Fetches real market data from BingX API (spot & swap v2)
 * Docs: https://bingx-api.github.io/docs/#/en-us/swapV2/changelog
 */

import { getClient, initRedis } from "@/lib/redis-db"
import { getSettings } from "@/lib/redis-db"
import { logProgressionEvent } from "@/lib/engine-progression-logs"

export interface BingXMarketDataConfig {
  exchange: string
  apiType?: string
  isTestnet?: boolean
  apiKey?: string
  apiSecret?: string
}

export interface BingXCandle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface BingXTicker {
  symbol: string
  price: number
  high24h: number
  low24h: number
  volume24h: number
  priceChangePercent: number
}

const INTERVAL_MAP: Record<string, string> = {
  "1s": "1s",
  "1m": "1m",
  "3m": "3m",
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "2h": "2h",
  "4h": "4h",
  "6h": "6h",
  "8h": "8h",
  "12h": "12h",
  "1d": "1d",
  "3d": "3d",
  "1w": "1w",
  "1M": "1M",
}

function getBaseUrl(apiType: string = "perpetual_futures", isTestnet: boolean = false): string {
  const host = isTestnet ? "testnet-open-api.bingx.com" : "open-api.bingx.com"
  return `https://${host}`
}

export class BingXMarketDataService {
  private config: BingXMarketDataConfig
  private connectionId: string = ""
  private priceCache = new Map<string, { price: number; ts: number }>()
  private readonly CACHE_TTL = 500

  constructor(config: BingXMarketDataConfig) {
    this.config = config
  }

  setConnectionId(id: string) {
    this.connectionId = id
  }

  private log(level: "info" | "warning" | "error", message: string, data?: any) {
    if (this.connectionId) {
      logProgressionEvent(this.connectionId, "market_data", level, message, data)
    } else {
      console.log(`[v0] [BingXMarketData] ${message}`)
    }
  }

  async fetchKlines(
    symbol: string,
    interval: string = "1m",
    limit: number = 500,
    startTime?: number,
    endTime?: number
  ): Promise<BingXCandle[]> {
    try {
      const apiType = this.config.apiType || "perpetual_futures"
      const baseUrl = getBaseUrl(apiType, this.config.isTestnet)
      const bingxInterval = INTERVAL_MAP[interval] || interval

      let url: string
      if (apiType === "spot") {
        const params = new URLSearchParams({
          symbol,
          interval: bingxInterval,
          limit: String(Math.min(limit, 1440)),
        })
        if (startTime) params.append("startTime", String(startTime))
        if (endTime) params.append("endTime", String(endTime))
        url = `${baseUrl}/openApi/spot/v2/market/kline?${params.toString()}`
      } else {
        const params = new URLSearchParams({
          symbol,
          interval: bingxInterval,
          limit: String(Math.min(limit, 1000)),
        })
        if (startTime) params.append("startTime", String(startTime))
        if (endTime) params.append("endTime", String(endTime))
        url = `${baseUrl}/openApi/swap/v2/quote/klines?${params.toString()}`
      }

      this.log("info", `Fetching klines: ${symbol} ${interval} limit=${limit}`, { url })

      const response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15000),
      })

      if (!response.ok) {
        this.log("error", `Klines HTTP error: ${response.status} ${response.statusText}`, { symbol, interval })
        return []
      }

      const data = await response.json()

      if (data.code !== 0) {
        this.log("error", `Klines API error: ${data.msg || "Unknown"}`, { code: data.code, symbol })
        return []
      }

      const klines = data.data || []
      const candles: BingXCandle[] = klines.map((k: any) => ({
        timestamp: Number(k.time || k[0]),
        open: Number.parseFloat(k.open || k[1]),
        high: Number.parseFloat(k.high || k[2]),
        low: Number.parseFloat(k.low || k[3]),
        close: Number.parseFloat(k.close || k[4]),
        volume: Number.parseFloat(k.volume || k[5]),
      }))

      this.log("info", `Fetched ${candles.length} klines for ${symbol}`, {
        firstTs: candles[0]?.timestamp,
        lastTs: candles[candles.length - 1]?.timestamp,
      })

      return candles
    } catch (error) {
      this.log("error", `Failed to fetch klines: ${error instanceof Error ? error.message : String(error)}`, { symbol, interval })
      return []
    }
  }

  async fetchTickerPrice(symbol: string): Promise<number> {
    const cached = this.priceCache.get(symbol)
    if (cached && Date.now() - cached.ts < this.CACHE_TTL) {
      return cached.price
    }

    try {
      const apiType = this.config.apiType || "perpetual_futures"
      const baseUrl = getBaseUrl(apiType, this.config.isTestnet)

      let url: string
      if (apiType === "spot") {
        url = `${baseUrl}/openApi/spot/v1/ticker/price?symbol=${symbol}`
      } else {
        url = `${baseUrl}/openApi/swap/v2/quote/price?symbol=${symbol}`
      }

      const response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) return 0

      const data = await response.json()
      if (data.code !== 0) return 0

      const priceData = data.data
      const price = Number.parseFloat(priceData?.price || "0")

      if (price > 0) {
        this.priceCache.set(symbol, { price, ts: Date.now() })
      }

      return price
    } catch {
      return 0
    }
  }

  async fetchTicker24hr(symbol?: string): Promise<BingXTicker | BingXTicker[] | null> {
    try {
      const apiType = this.config.apiType || "perpetual_futures"
      const baseUrl = getBaseUrl(apiType, this.config.isTestnet)

      let url: string
      if (apiType === "spot") {
        url = symbol
          ? `${baseUrl}/openApi/spot/v1/ticker/24hr?symbol=${symbol}`
          : `${baseUrl}/openApi/spot/v1/ticker/24hr`
      } else {
        url = symbol
          ? `${baseUrl}/openApi/swap/v2/quote/ticker?symbol=${symbol}`
          : `${baseUrl}/openApi/swap/v2/quote/ticker`
      }

      const response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) return null

      const data = await response.json()
      if (data.code !== 0) return null

      const tickerData = data.data
      if (!tickerData) return null

      if (Array.isArray(tickerData)) {
        return tickerData.map((t: any) => ({
          symbol: t.symbol || "",
          price: Number.parseFloat(t.lastPrice || t.price || t.close || "0"),
          high24h: Number.parseFloat(t.highPrice || t.high || "0"),
          low24h: Number.parseFloat(t.lowPrice || t.low || "0"),
          volume24h: Number.parseFloat(t.volume || "0"),
          priceChangePercent: Number.parseFloat(t.priceChangePercent || "0"),
        }))
      }

      return {
        symbol: tickerData.symbol || "",
        price: Number.parseFloat(tickerData.lastPrice || tickerData.price || "0"),
        high24h: Number.parseFloat(tickerData.highPrice || tickerData.high || "0"),
        low24h: Number.parseFloat(tickerData.lowPrice || tickerData.low || "0"),
        volume24h: Number.parseFloat(tickerData.volume || "0"),
        priceChangePercent: Number.parseFloat(tickerData.priceChangePercent || "0"),
      }
    } catch {
      return null
    }
  }

  async fetchDepth(symbol: string, limit: number = 20): Promise<{ bids: [number, number][]; asks: [number, number][] }> {
    try {
      const apiType = this.config.apiType || "perpetual_futures"
      const baseUrl = getBaseUrl(apiType, this.config.isTestnet)

      let url: string
      if (apiType === "spot") {
        url = `${baseUrl}/openApi/spot/v1/market/depth?symbol=${symbol}&limit=${limit}`
      } else {
        url = `${baseUrl}/openApi/swap/v2/quote/depth?symbol=${symbol}&limit=${limit}`
      }

      const response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) return { bids: [], asks: [] }

      const data = await response.json()
      if (data.code !== 0) return { bids: [], asks: [] }

      const depthData = data.data || {}
      return {
        bids: (depthData.bids || []).map((b: any) => [Number.parseFloat(b[0]), Number.parseFloat(b[1])]),
        asks: (depthData.asks || []).map((a: any) => [Number.parseFloat(a[0]), Number.parseFloat(a[1])]),
      }
    } catch {
      return { bids: [], asks: [] }
    }
  }

  async fetchHistoricalKlines(
    symbol: string,
    interval: string = "1m",
    startTime: number,
    endTime: number
  ): Promise<BingXCandle[]> {
    const allCandles: BingXCandle[] = []
    let currentStart = startTime
    const maxPerRequest = interval === "1s" ? 1000 : 1000

    this.log("info", `Fetching historical klines: ${symbol} ${interval}`, {
      start: new Date(startTime).toISOString(),
      end: new Date(endTime).toISOString(),
    })

    while (currentStart < endTime) {
      const candles = await this.fetchKlines(symbol, interval, maxPerRequest, currentStart, endTime)
      if (candles.length === 0) break

      allCandles.push(...candles)

      const lastTs = candles[candles.length - 1].timestamp
      if (lastTs <= currentStart) break
      currentStart = lastTs + 1

      await new Promise((r) => setTimeout(r, 200))
    }

    this.log("info", `Historical fetch complete: ${allCandles.length} candles for ${symbol}`)
    return allCandles
  }

  async saveCandlesToRedis(symbol: string, candles: BingXCandle[]): Promise<void> {
    if (candles.length === 0) return

    await initRedis()
    const client = getClient()

    const marketData = {
      symbol,
      timeframe: "1m",
      candles,
      lastUpdated: new Date().toISOString(),
    }

    const key = `market_data:${symbol}:1m`
    await client.set(key, JSON.stringify(marketData))
    await client.expire(key, 86400)

    const candlesKey = `market_data:${symbol}:candles`
    await client.set(candlesKey, JSON.stringify(candles))
    await client.expire(candlesKey, 86400)

    const latest = candles[candles.length - 1]
    if (latest) {
      const hashKey = `market_data:${symbol}`
      const flatHash: Record<string, string> = {
        symbol,
        exchange: "bingx",
        interval: "1m",
        price: String(latest.close),
        open: String(latest.open),
        high: String(latest.high),
        low: String(latest.low),
        close: String(latest.close),
        volume: String(latest.volume),
        timestamp: new Date(latest.timestamp).toISOString(),
        candles_count: String(candles.length),
      }
      const flatArgs: string[] = []
      for (const [k, v] of Object.entries(flatHash)) {
        flatArgs.push(k, v)
      }
      await client.hmset(hashKey, ...flatArgs)
      await client.expire(hashKey, 86400)
    }

    this.log("info", `Saved ${candles.length} candles to Redis for ${symbol}`, {
      latestPrice: candles[candles.length - 1]?.close,
    })
  }

  async loadMarketDataForSymbols(
    symbols: string[],
    interval: string = "1m",
    candleCount: number = 250
  ): Promise<number> {
    let loaded = 0

    this.log("info", `Loading market data for ${symbols.length} symbols from BingX`, { interval, candleCount })

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i]
      let bingxSymbol = symbol
      if (!bingxSymbol.includes("-")) {
        if (bingxSymbol.endsWith("USDT")) {
          bingxSymbol = bingxSymbol.replace("USDT", "-USDT")
        } else if (bingxSymbol.endsWith("USDC")) {
          bingxSymbol = bingxSymbol.replace("USDC", "-USDC")
        } else {
          bingxSymbol = bingxSymbol + "-USDT"
        }
      }
      try {
        const candles = await this.fetchKlines(bingxSymbol, interval, candleCount)

        if (candles.length > 0) {
          await this.saveCandlesToRedis(symbol, candles)
          loaded++
          this.log("info", `[${i + 1}/${symbols.length}] Loaded ${symbol}: ${candles.length} candles, latest=$${candles[candles.length - 1]?.close.toFixed(2)}`)
        } else {
          this.log("warning", `[${i + 1}/${symbols.length}] No data for ${symbol}`)
        }

        if (i < symbols.length - 1) {
          await new Promise((r) => setTimeout(r, 150))
        }
      } catch (error) {
        this.log("error", `Failed to load ${symbol}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    this.log("info", `Market data loading complete: ${loaded}/${symbols.length} symbols loaded from BingX`)
    return loaded
  }

  async loadPrehistoricData(
    symbols: string[],
    interval: string,
    days: number
  ): Promise<{ total: number; loaded: number }> {
    const endTime = Date.now()
    const startTime = endTime - days * 24 * 60 * 60 * 1000
    let loaded = 0

    this.log("info", `Loading prehistoric data: ${symbols.length} symbols, ${days} days, interval=${interval}`)

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i]
      try {
        const candles = await this.fetchHistoricalKlines(symbol, interval, startTime, endTime)

        if (candles.length > 0) {
          await this.saveCandlesToRedis(symbol, candles)
          loaded++
          this.log("info", `[Prehistoric ${i + 1}/${symbols.length}] ${symbol}: ${candles.length} candles loaded`)
        }

        if (i < symbols.length - 1) {
          await new Promise((r) => setTimeout(r, 300))
        }
      } catch (error) {
        this.log("error", `Prehistoric load failed for ${symbol}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    this.log("info", `Prehistoric data loading complete: ${loaded}/${symbols.length} symbols`)
    return { total: symbols.length, loaded }
  }
}

const marketDataServiceCache = new Map<string, BingXMarketDataService>()

export function getBingXMarketDataService(
  connectionId: string,
  config?: Partial<BingXMarketDataConfig>
): BingXMarketDataService {
  const cacheKey = connectionId

  if (marketDataServiceCache.has(cacheKey)) {
    return marketDataServiceCache.get(cacheKey)!
  }

  const service = new BingXMarketDataService({
    exchange: "bingx",
    apiType: "perpetual_futures",
    isTestnet: false,
    ...config,
  })

  marketDataServiceCache.set(cacheKey, service)
  return service
}

export async function getTimeframeFromSettings(): Promise<string> {
  try {
    await initRedis()
    const settings = (await getSettings("all_settings")) || {}
    const marketTimeframe = settings.marketTimeframe ?? 0
    const prehistoricDataDays = settings.prehistoricDataDays || 1

    const timeframeMap: Record<number, string> = {
      0: "1s",
      1: "1m",
      2: "1m",
      3: "1m",
      5: "5m",
      10: "5m",
      15: "15m",
    }

    return timeframeMap[marketTimeframe] || "1s"
  } catch {
    return "1s"
  }
}
