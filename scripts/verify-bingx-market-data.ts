/**
 * BingX Market Data Verification Script
 * Tests all BingX market data API endpoints
 */

import { BingXMarketDataService, getTimeframeFromSettings } from "@/lib/bingx-market-data"
import { initRedis, getSettings, getAllConnections } from "@/lib/redis-db"

async function testBingXMarketData() {
  console.log("=== BingX Market Data Verification ===\n")

  await initRedis()

  const settings = (await getSettings("all_settings")) || {}
  console.log(`Settings: prehistoricDataDays=${settings.prehistoricDataDays || 5}, marketTimeframe=${settings.marketTimeframe || 1}`)

  const timeframe = await getTimeframeFromSettings()
  console.log(`Resolved timeframe: ${timeframe}\n`)

  const connections = await getAllConnections()
  const bingxConn = connections.find((c: any) => c.exchange === "bingx")

  let service: BingXMarketDataService
  let hasCredentials = false

  if (bingxConn && bingxConn.api_key && bingxConn.api_key.length > 10) {
    console.log(`Using BingX connection: ${bingxConn.id}`)
    console.log(`API Type: ${bingxConn.api_type || "perpetual_futures"}`)
    console.log(`Testnet: ${bingxConn.is_testnet === "1" || bingxConn.is_testnet === true}\n`)

    service = new BingXMarketDataService({
      exchange: "bingx",
      apiType: bingxConn.api_type || "perpetual_futures",
      isTestnet: bingxConn.is_testnet === "1" || bingxConn.is_testnet === true,
      apiKey: bingxConn.api_key,
      apiSecret: bingxConn.api_secret,
    })
    hasCredentials = true
  } else {
    console.log("No BingX credentials found, using public endpoints\n")
    service = new BingXMarketDataService({
      exchange: "bingx",
      apiType: "perpetual_futures",
      isTestnet: false,
    })
  }

  const symbols = ["BTC-USDT", "ETH-USDT", "SOL-USDT"]

  // Test 1: Fetch Klines
  console.log("--- Test 1: Fetch Klines ---")
  for (const symbol of symbols) {
    try {
      const candles = await service.fetchKlines(symbol, "1m", 5)
      if (candles.length > 0) {
        const latest = candles[candles.length - 1]
        console.log(`✓ ${symbol}: ${candles.length} candles, latest=$${latest.close.toFixed(2)}`)
      } else {
        console.log(`✗ ${symbol}: No candles returned`)
      }
    } catch (error) {
      console.log(`✗ ${symbol}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Test 2: Fetch Ticker Price
  console.log("\n--- Test 2: Fetch Ticker Price ---")
  for (const symbol of symbols) {
    try {
      const price = await service.fetchTickerPrice(symbol)
      if (price > 0) {
        console.log(`✓ ${symbol}: $${price.toFixed(2)}`)
      } else {
        console.log(`✗ ${symbol}: No price returned`)
      }
    } catch (error) {
      console.log(`✗ ${symbol}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Test 3: Fetch 24hr Ticker
  console.log("\n--- Test 3: Fetch 24hr Ticker ---")
  try {
    const ticker = await service.fetchTicker24hr("BTC-USDT")
    if (ticker && !Array.isArray(ticker)) {
      console.log(`✓ BTC-USDT 24h: price=$${ticker.price.toFixed(2)}, change=${ticker.priceChangePercent.toFixed(2)}%, vol=${ticker.volume24h.toFixed(0)}`)
    } else if (Array.isArray(ticker)) {
      console.log(`✓ 24h tickers: ${ticker.length} symbols returned`)
    } else {
      console.log(`✗ No ticker data returned`)
    }
  } catch (error) {
    console.log(`✗ 24hr ticker: ${error instanceof Error ? error.message : String(error)}`)
  }

  // Test 4: Fetch Depth
  console.log("\n--- Test 4: Fetch Order Book Depth ---")
  try {
    const depth = await service.fetchDepth("BTC-USDT", 5)
    if (depth.bids.length > 0 && depth.asks.length > 0) {
      console.log(`✓ BTC-USDT depth: ${depth.bids.length} bids, ${depth.asks.length} asks`)
      console.log(`  Best bid: $${depth.bids[0][0].toFixed(2)} (${depth.bids[0][1].toFixed(4)})`)
      console.log(`  Best ask: $${depth.asks[0][0].toFixed(2)} (${depth.asks[0][1].toFixed(4)})`)
    } else {
      console.log(`✗ No depth data returned`)
    }
  } catch (error) {
    console.log(`✗ Depth: ${error instanceof Error ? error.message : String(error)}`)
  }

  // Test 5: Load Market Data for Symbols
  console.log("\n--- Test 5: Load Market Data for Symbols ---")
  try {
    const loadSymbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
    const loaded = await service.loadMarketDataForSymbols(loadSymbols, timeframe, 50)
    console.log(`✓ Loaded ${loaded}/${loadSymbols.length} symbols to Redis`)
  } catch (error) {
    console.log(`✗ Load market data: ${error instanceof Error ? error.message : String(error)}`)
  }

  // Test 6: Historical Klines (small range)
  console.log("\n--- Test 6: Historical Klines (last 1 hour) ---")
  try {
    const endTime = Date.now()
    const startTime = endTime - 60 * 60 * 1000
    const histCandles = await service.fetchHistoricalKlines("BTC-USDT", "1m", startTime, endTime)
    if (histCandles.length > 0) {
      console.log(`✓ BTC-USDT historical: ${histCandles.length} candles in last hour`)
    } else {
      console.log(`✗ No historical candles returned`)
    }
  } catch (error) {
    console.log(`✗ Historical klines: ${error instanceof Error ? error.message : String(error)}`)
  }

  console.log("\n=== Verification Complete ===")
  console.log(`Credentials available: ${hasCredentials ? "YES (authenticated endpoints)" : "NO (public endpoints only)"}`)
  console.log(`Timeframe from settings: ${timeframe}`)
}

testBingXMarketData().catch(console.error)
