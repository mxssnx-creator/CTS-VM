/**
 * Market Data Loader
 * Populates Redis with OHLCV data for trading engine
 * Supports real BingX API data or synthetic fallback
 *
 * KEY ARCHITECTURE:
 *   market_data:{symbol}:1m       → JSON string, full MarketData object with 250 candles (used by engine loader)
 *   market_data:{symbol}:candles  → JSON string, raw candles array (used by indication processor for history)
 *   market_data:{symbol}          → Redis hash, single latest candle (used by getMarketData() in redis-db)
 */

import { getClient, initRedis, getSettings } from "@/lib/redis-db"
import { BingXMarketDataService, getTimeframeFromSettings } from "@/lib/bingx-market-data"
import { logProgressionEvent } from "@/lib/engine-progression-logs"

export interface MarketDataCandle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface MarketData {
  symbol: string
  timeframe: string
  candles: MarketDataCandle[]
  lastUpdated: string
}

interface BingXRawCandle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

function normalizeBingXCandles(rawCandles: BingXRawCandle[]): MarketDataCandle[] {
  return rawCandles.map(c => ({
    timestamp: c.timestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
  }))
}

async function getCandlesFromBingX(
  symbol: string,
  interval: string,
  count: number
): Promise<MarketDataCandle[]> {
  try {
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
    const service = new BingXMarketDataService({
      exchange: "bingx",
      apiType: "perpetual_futures",
      isTestnet: false,
    })

    const candles = await service.fetchKlines(bingxSymbol, interval, count)
    if (candles.length > 0) {
      console.log(`[v0] [MarketData] BingX API returned ${candles.length} candles for ${symbol}`)
      return normalizeBingXCandles(candles)
    }
  } catch (error) {
    console.warn(`[v0] [MarketData] BingX API failed for ${symbol}, falling back to synthetic:`, error instanceof Error ? error.message : String(error))
  }
  return []
}

/**
 * DEPRECATED: Synthetic candle generation is disabled.
 * Use getCandlesFromBingX or fetch from real exchange APIs.
 */
export function generateSyntheticCandles(
  _symbol: string,
  _basePrice: number,
  _candleCount: number = 100
): MarketDataCandle[] {
  console.warn("[MarketData] generateSyntheticCandles is deprecated. Use real exchange data.")
  return []
}

/**
 * Fetch candles from Binance public API as fallback
 */
async function getCandlesFromBinance(
  symbol: string,
  interval: string,
  count: number
): Promise<MarketDataCandle[]> {
  try {
    const binanceSymbol = symbol.replace("-", "")
    const intervalMap: Record<string, string> = {
      "1m": "1m",
      "5m": "5m",
      "15m": "15m",
      "1h": "1h",
      "4h": "4h",
      "1d": "1d",
    }
    const binanceInterval = intervalMap[interval] || "1m"
    
    const response = await fetch(
      `https://fapi.binance.com/fapi/v1/klines?symbol=${binanceSymbol}&interval=${binanceInterval}&limit=${count}`,
      { next: { revalidate: 0 } }
    )
    
    if (!response.ok) throw new Error(`Binance API error: ${response.status}`)
    
    const data = await response.json()
    return data.map((c: any[]) => ({
      timestamp: c[0],
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
    }))
  } catch (error) {
    console.error(`[MarketData] Binance fallback failed for ${symbol}:`, error)
    return []
  }
}

async function saveCandlesToRedis(client: any, symbol: string, candles: MarketDataCandle[], source: string): Promise<void> {
  const marketData: MarketData = {
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

  const latestCandle = candles[candles.length - 1]
  if (latestCandle) {
    const hashKey = `market_data:${symbol}`
    const flatHash: Record<string, string> = {
      symbol,
      exchange: source,
      interval: "1m",
      price: String(latestCandle.close),
      open: String(latestCandle.open),
      high: String(latestCandle.high),
      low: String(latestCandle.low),
      close: String(latestCandle.close),
      volume: String(latestCandle.volume),
      timestamp: new Date(latestCandle.timestamp).toISOString(),
      candles_count: String(candles.length),
    }
    const flatArgs: string[] = []
    for (const [k, v] of Object.entries(flatHash)) {
      flatArgs.push(k, v)
    }
    await client.hmset(hashKey, ...flatArgs)
    await client.expire(hashKey, 86400)
  }
}

export async function loadMarketDataForEngine(symbols: string[] = []): Promise<number> {
  try {
    await initRedis()
    const client = getClient()

    const targetSymbols = symbols.length > 0 ? symbols : [
      "BTCUSDT", "ETHUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT",
      "DOGEUSDT", "LINKUSDT", "LITUSDT", "THETAUSDT", "AVAXUSDT",
      "MATICUSDT", "SOLUSDT", "UNIUSDT", "APTUSDT", "ARBUSDT"
    ]

    const basePrices: Record<string, number> = {
      BTCUSDT: 45000,
      ETHUSDT: 2500,
      BNBUSDT: 600,
      XRPUSDT: 0.5,
      ADAUSDT: 0.8,
      DOGEUSDT: 0.12,
      LINKUSDT: 25,
      LITUSDT: 120,
      THETAUSDT: 2.5,
      AVAXUSDT: 35,
      MATICUSDT: 1.2,
      SOLUSDT: 140,
      UNIUSDT: 15,
      APTUSDT: 10,
      ARBUSDT: 1.8,
    }

    const timeframe = await getTimeframeFromSettings()
    console.log(`[v0] [MarketData] Loading market data for ${targetSymbols.length} symbols, timeframe=${timeframe}`)

    let loaded = 0

    for (const symbol of targetSymbols) {
      try {
        let candles: MarketDataCandle[] = []

        candles = await getCandlesFromBingX(symbol, timeframe, 250)

        if (candles.length === 0) {
          // Fallback to Binance public API
          candles = await getCandlesFromBinance(symbol, timeframe, 250)
          console.log(`[v0] [MarketData] Binance fallback candles for ${symbol}: ${candles.length}`)
        }

        const source = candles.length > 0 ? (candles[0].volume > 0 ? "bingx" : "binance") : "none"
        await saveCandlesToRedis(client, symbol, candles, source)

        loaded++
        const priceStr = candles[candles.length - 1]?.close.toFixed(2) ?? "N/A"
        console.log(`[v0] [MarketData] ✓ Loaded ${symbol}: ${candles.length} candles, latest=$${priceStr} [${source}]`)
      } catch (error) {
        console.error(`[v0] [MarketData] Failed to load ${symbol}:`, error)
      }
    }

    console.log(`[v0] [MarketData] ✅ Successfully loaded market data for ${loaded}/${targetSymbols.length} symbols`)
    return loaded
  } catch (error) {
    console.error("[v0] [MarketData] Failed to load market data:", error)
    return 0
  }
}

export async function loadPrehistoricMarketData(
  symbols: string[] = [],
  connectionId?: string
): Promise<{ total: number; loaded: number }> {
  try {
    await initRedis()
    const client = getClient()

    const settings = (await getSettings("all_settings")) || {}
    const days = settings.prehistoricDataDays || 1
    const marketTimeframe = settings.marketTimeframe ?? 0

    const timeframeMap: Record<number, string> = {
      0: "1s",
      1: "1m",
      2: "1m",
      3: "1m",
      5: "5m",
      10: "5m",
      15: "15m",
    }
    const interval = timeframeMap[marketTimeframe] || "1s"

    const intervalMsMap: Record<string, number> = {
      "1s": 1000,
      "1m": 60000,
      "5m": 300000,
      "15m": 900000,
    }
    const intervalMs = intervalMsMap[interval] || 1000

    const targetSymbols = symbols.length > 0 ? symbols : [
      "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
    ]

    const endTime = Date.now()
    const startTime = endTime - days * 24 * 60 * 60 * 1000

    console.log(`[v0] [PrehistoricMarketData] Loading ${days} day(s) of data, interval=${interval}, symbols=${targetSymbols.length}`)
    console.log(`[v0] [PrehistoricMarketData] Time range: ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`)

    let loaded = 0
    let totalCandlesLoaded = 0

    for (let i = 0; i < targetSymbols.length; i++) {
      const symbol = targetSymbols[i]
      try {
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
        const service = new BingXMarketDataService({
          exchange: "bingx",
          apiType: "perpetual_futures",
          isTestnet: false,
        })

        if (connectionId) {
          service.setConnectionId(connectionId)
        }

        // Check existing data to load only missing time ranges
        const existingKey = `market_data:${symbol}:candles`
        const existingData = await client.get(existingKey)
        let existingCandles: any[] = []
        let existingStartTime = startTime
        let existingEndTime = endTime

        if (existingData) {
          try {
            existingCandles = JSON.parse(existingData)
            if (Array.isArray(existingCandles) && existingCandles.length > 0) {
              const firstTs = existingCandles[0].timestamp
              const lastTs = existingCandles[existingCandles.length - 1].timestamp

              // Check if we need to fill gaps or extend range
              if (firstTs > startTime) {
                existingStartTime = firstTs
                console.log(`[v0] [PrehistoricMarketData] ${symbol}: Loading missing range ${new Date(startTime).toISOString()} to ${new Date(firstTs).toISOString()}`)
              }
              if (lastTs < endTime - intervalMs) {
                existingEndTime = lastTs
                console.log(`[v0] [PrehistoricMarketData] ${symbol}: Loading missing range ${new Date(lastTs).toISOString()} to ${new Date(endTime).toISOString()}`)
              }
            }
          } catch (parseErr) {
            console.warn(`[v0] [PrehistoricMarketData] ${symbol}: Failed to parse existing data, loading full range`)
          }
        }

        // Load only the missing time range
        const loadStart = existingStartTime
        const loadEnd = existingEndTime

        // Process by intervals to avoid large requests
        const allCandles: any[] = [...existingCandles]
        let currentStart = loadStart

        while (currentStart < loadEnd) {
          const chunkEnd = Math.min(currentStart + (1000 * intervalMs), loadEnd)
          const candles = await service.fetchHistoricalKlines(bingxSymbol, interval, currentStart, chunkEnd)

          if (candles.length > 0) {
            const normalized = normalizeBingXCandles(candles)
            allCandles.push(...normalized)
            totalCandlesLoaded += candles.length
          }

          currentStart = chunkEnd + intervalMs

          if (candles.length === 0) break

          await new Promise((r) => setTimeout(r, 100))
        }

        // Deduplicate and sort by timestamp
        const uniqueCandles = allCandles
          .filter((c, index, self) => index === self.findIndex((t) => t.timestamp === c.timestamp))
          .sort((a, b) => a.timestamp - b.timestamp)
          .slice(-250)

        if (uniqueCandles.length > 0) {
          await saveCandlesToRedis(client, symbol, uniqueCandles, "bingx_prehistoric")
          loaded++
          console.log(`[v0] [PrehistoricMarketData] [${i + 1}/${targetSymbols.length}] ${symbol}: ${uniqueCandles.length} candles (loaded ${totalCandlesLoaded} new)`)

          if (connectionId) {
            await logProgressionEvent(connectionId, "prehistoric_market_data", "info", `Loaded ${symbol}`, {
              symbol,
              candlesCount: uniqueCandles.length,
              newCandlesLoaded: totalCandlesLoaded,
              days,
              interval,
              timeRange: `${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`,
            })
          }
        } else {
          console.warn(`[v0] [PrehistoricMarketData] No data for ${symbol}`)
        }

        if (i < targetSymbols.length - 1) {
          await new Promise((r) => setTimeout(r, 300))
        }
      } catch (error) {
        console.error(`[v0] [PrehistoricMarketData] Failed for ${symbol}:`, error instanceof Error ? error.message : String(error))
        if (connectionId) {
          await logProgressionEvent(connectionId, "prehistoric_market_data", "error", `Failed ${symbol}`, {
            symbol,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }

    console.log(`[v0] [PrehistoricMarketData] ✅ Complete: ${loaded}/${targetSymbols.length} symbols, ${totalCandlesLoaded} total candles loaded`)
    return { total: targetSymbols.length, loaded }
  } catch (error) {
    console.error("[v0] [PrehistoricMarketData] Failed:", error)
    return { total: 0, loaded: 0 }
  }
}

export async function updateMarketDataForSymbol(symbol: string, newCandles: MarketDataCandle[] = []): Promise<void> {
  try {
    await initRedis()
    const client = getClient()

    const key = `market_data:${symbol}:1m`
    const existing = await client.get(key)

    let marketData: MarketData = existing
      ? JSON.parse(existing)
      : {
          symbol,
          timeframe: "1m",
          candles: [],
          lastUpdated: new Date().toISOString(),
        }

    if (newCandles.length > 0) {
      marketData.candles = [...marketData.candles, ...newCandles].slice(-250)
    } else {
      const timeframe = await getTimeframeFromSettings()
      const bingxCandles = await getCandlesFromBingX(symbol, timeframe, 1)

      if (bingxCandles.length > 0) {
        marketData.candles = [...marketData.candles, ...bingxCandles].slice(-250)
      } else {
        // Try Binance fallback
        const binanceCandles = await getCandlesFromBinance(symbol, timeframe, 1)
        if (binanceCandles.length > 0) {
          marketData.candles = [...marketData.candles, ...binanceCandles].slice(-250)
        }
        // If no new data available, keep existing candles (don't generate synthetic)
      }
    }

    marketData.lastUpdated = new Date().toISOString()
    await client.set(key, JSON.stringify(marketData))
    await client.expire(key, 86400)
  } catch (error) {
    console.error(`[v0] [MarketData] Failed to update ${symbol}:`, error)
  }
}

export async function loadHistoricalMarketData(
  symbol: string,
  startDate: Date,
  endDate: Date,
  timeframe: string = "1h"
): Promise<MarketDataCandle[]> {
  try {
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
    const service = new BingXMarketDataService({
      exchange: "bingx",
      apiType: "perpetual_futures",
      isTestnet: false,
    })

    const candles = await service.fetchHistoricalKlines(
      bingxSymbol,
      timeframe,
      startDate.getTime(),
      endDate.getTime()
    )

    if (candles.length > 0) {
      console.log(`[v0] [MarketData] BingX historical: ${candles.length} candles for ${symbol}`)
      return normalizeBingXCandles(candles)
    }

    console.warn(`[v0] [MarketData] BingX returned no data for ${symbol}, returning empty`)
    return []
  } catch (error) {
    console.error("[v0] [MarketData] Failed to load historical data:", error)
    return []
  }
}
