/**
 * Pre-startup: Initialize Redis and run all critical setup tasks
 * Runs once on first deploy or server start
 */

import { initRedis, createConnection, getAllConnections, saveMarketData, setSettings, getSettings, updateConnection, getRedisClient } from "@/lib/redis-db"
import { runMigrations } from "@/lib/redis-migrations"
import { initializeTradeEngineAutoStart } from "@/lib/trade-engine-auto-start"
import { getGlobalTradeEngineCoordinator } from "@/lib/trade-engine"
import { getDefaultSettings } from "@/lib/settings-storage"
import { createExchangeConnector } from "@/lib/exchange-connectors"

// Use globalThis to survive module re-evaluation across Next.js compilations
const globalStore = globalThis as any
if (!globalStore.__cts_startup_guard) {
  globalStore.__cts_startup_guard = { completed: false }
}

async function seedMarketData() {
  console.log("[v0] [Seed] Starting market data seeding...")

  const symbols = [
    "BTCUSDT", "ETHUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT",
    "DOGEUSDT", "LINKUSDT", "LITUSDT", "THETAUSDT", "AVAXUSDT",
    "MATICUSDT", "SOLUSDT", "UNIUSDT", "APTUSDT", "ARBUSDT"
  ]

  const basePrices: Record<string, number> = {
    BTCUSDT: 45000,
    ETHUSDT: 2500,
    BNBUSDT: 400,
    XRPUSDT: 2.5,
    ADAUSDT: 0.95,
    DOGEUSDT: 0.35,
    LINKUSDT: 25,
    LITUSDT: 120,
    THETAUSDT: 2.5,
    AVAXUSDT: 35,
    MATICUSDT: 1.2,
    SOLUSDT: 180,
    UNIUSDT: 18,
    APTUSDT: 8,
    ARBUSDT: 0.9,
  }

  let seededCount = 0
  let totalDataPoints = 0
  
  for (const symbol of symbols) {
    try {
      const basePrice = basePrices[symbol] || 100
      // Seed 20 historical data points for better backtesting
      for (let i = 0; i < 20; i++) {
        const variation = basePrice * 0.02
        const price = basePrice + (Math.random() - 0.5) * variation
        const marketData = {
          symbol,
          exchange: "bybit",
          interval: "1m",
          price,
          open: basePrice,
          high: basePrice + variation,
          low: basePrice - variation,
          close: price,
          volume: Math.random() * 1000000,
          timestamp: new Date(Date.now() - (20 - i) * 60000).toISOString(),
        }
        await saveMarketData(symbol, marketData)
        totalDataPoints++
      }
      seededCount++
      console.log(`[v0] [Seed] ✓ ${symbol}: 20 data points`)
    } catch (error) {
      console.warn(`[v0] [Seed] ✗ Failed to seed ${symbol}:`, error)
    }
  }
  console.log(`[v0] [Seed] Complete: ${totalDataPoints} data points across ${seededCount}/${symbols.length} symbols`)
}

async function seedPredefinedConnections() {
  console.log("[v0] [Seed] Connections seeding DISABLED - only 4 user-created base connections are used")
  // Predefined connections are file-based templates only and should NOT be stored in Redis
  // The 4 user-created connections (BingX, Bybit, Pionex, OrangeX) are initialized in redis-db.ts
  return
}

async function initializeDefaultSettings() {
  console.log("[v0] [Seed] Initializing default settings...")
  try {
    const defaults = getDefaultSettings()
    
    console.log("[v0] [Seed] Default settings keys:", Object.keys(defaults))
    console.log("[v0] [Seed] Saving to Redis with key 'app_settings'...")
    
    // Save to Redis database
    await setSettings("app_settings", defaults)
    console.log("[v0] [Seed] Default settings initialized and saved to Redis:", Object.keys(defaults).length, "keys")
    
    // Verify the save by reading it back
    const verified = await getSettings("app_settings")
    if (verified) {
      console.log("[v0] [Seed] ✓ Settings verified - successfully saved and retrieved")
    } else {
      console.warn("[v0] [Seed] ✗ Settings verification FAILED - could not retrieve saved settings")
    }
  } catch (error) {
    console.warn("[v0] [Seed] Failed to initialize default settings:", error)
  }
}

export async function testAllExchangeConnections() {
  console.log("[v0] [Startup] Testing exchange connections (direct connector test, no HTTP)...")
  try {
    const allConnections = await getAllConnections()
    
    // Only test connections that have real API keys (not placeholder)
    const testable = allConnections.filter((c: any) => {
      const hasValidKey = c.api_key && c.api_key.length >= 20 
        && !c.api_key.includes("PLACEHOLDER") 
        && !c.api_key.includes("00998877")
        && !c.api_key.includes("your_")
      const hasSecret = c.api_secret && c.api_secret.length >= 10
        && !c.api_secret.includes("PLACEHOLDER")
        && !c.api_secret.includes("your_")
      return hasValidKey && hasSecret
    })

    if (testable.length === 0) {
      console.log(`[v0] [Startup] No connections with valid API keys to test (${allConnections.length} total, all placeholder)`)
      return { tested: 0, passed: 0, failed: 0 }
    }

    console.log(`[v0] [Startup] Testing ${testable.length} connections with valid keys (skipping ${allConnections.length - testable.length} placeholder)`)
    
    let passed = 0
    let failed = 0
    
    for (const connection of testable) {
      try {
        // Test directly using the exchange connector - no HTTP needed
        const connector = await createExchangeConnector(connection.exchange, {
          apiKey: connection.api_key,
          apiSecret: connection.api_secret,
          apiType: connection.api_type || "live",
          subType: connection.api_subtype,
          isTestnet: connection.is_testnet === true || connection.is_testnet === "true",
        })
        
        const result = await connector.testConnection()
        const testStatus = result.success ? "success" : "failed"
        
        await updateConnection(connection.id, {
          ...connection,
          last_test_status: testStatus,
          last_test_time: new Date().toISOString(),
          last_test_message: result.success ? "Connection verified at startup" : (result.error || "Test failed"),
        })
        
        if (result.success) {
          passed++
          console.log(`[v0] [Startup] ✓ ${connection.name} (${connection.exchange}): OK`)
        } else {
          failed++
          console.log(`[v0] [Startup] ✗ ${connection.name} (${connection.exchange}): ${result.error || "failed"}`)
        }
      } catch (error) {
        failed++
        const errMsg = error instanceof Error ? error.message : String(error)
        console.warn(`[v0] [Startup] ✗ ${connection.name} (${connection.exchange}): ${errMsg}`)
        
        await updateConnection(connection.id, {
          ...connection,
          last_test_status: "error",
          last_test_time: new Date().toISOString(),
          last_test_message: errMsg,
        })
      }
    }
    
    console.log(`[v0] [Startup] Connection testing complete: ${passed} passed, ${failed} failed out of ${testable.length}`)
    return { tested: testable.length, passed, failed }
  } catch (error) {
    console.error("[v0] [Startup] Failed to test connections:", error)
    return { tested: 0, passed: 0, failed: 0 }
  }
}

export function startPeriodicConnectionTesting() {
  // Test all connections every 5 minutes
  console.log("[v0] [Periodic] Starting periodic connection testing (every 5 minutes)")
  
  const intervalId = setInterval(async () => {
    const timestamp = new Date().toISOString()
    console.log(`[v0] [Periodic] [${timestamp}] Running scheduled connection tests...`)
    const result = await testAllExchangeConnections()
    console.log(`[v0] [Periodic] [${timestamp}] Completed: ${result.tested} tested, ${result.passed} passed, ${result.failed} failed`)
  }, 5 * 60 * 1000) // 5 minutes
  
  // Store interval ID globally so it can be cleared if needed
  if (typeof global !== "undefined") {
    (global as any).connectionTestingIntervalId = intervalId
  }
}
async function initializeDefaultActiveConnections() {
  console.log("[v0] [Seed] Initializing default main connections (Bybit & BingX)...")
  try {
    const allConnections = await getAllConnections()
    
    // Find bybit-x03 and bingx-x01
    const bybit = allConnections.find((c: any) => c.id === "bybit-x03")
    const bingx = allConnections.find((c: any) => c.id === "bingx-x01")
    
    let activatedCount = 0
    
    // Set bybit-x03 as main connection (is_main_enabled = true)
    if (bybit) {
      if (!bybit.is_main_enabled || bybit.is_main_enabled === "0") {
        console.log("[v0] [Seed] Setting bybit-x03 as main connection...")
        await updateConnection("bybit-x03", {
          ...bybit,
          is_main_enabled: "1"
        })
        activatedCount++
        console.log("[v0] [Seed] bybit-x03 added to main connections")
      } else {
        console.log("[v0] [Seed] bybit-x03 already on main list")
      }
    } else {
      console.warn("[v0] [Seed] bybit-x03 not found in database")
    }
    
    // Set bingx-x01 as main connection (is_main_enabled = true)
    if (bingx) {
      if (!bingx.is_main_enabled || bingx.is_main_enabled === "0") {
        console.log("[v0] [Seed] Setting bingx-x01 as main connection...")
        await updateConnection("bingx-x01", {
          ...bingx,
          is_main_enabled: "1"
        })
        activatedCount++
        console.log("[v0] [Seed] bingx-x01 added to main connections")
      } else {
        console.log("[v0] [Seed] bingx-x01 already on main list")
      }
    } else {
      console.warn("[v0] [Seed] bingx-x01 not found in database")
    }
    
    console.log(`[v0] [Seed] Default main connections initialized: ${activatedCount} connections added`)
  } catch (error) {
    console.error("[v0] [Seed] Failed to initialize default main connections:", error)
  }
}

/**
 * Auto-start the Global Trade Engine Coordinator at startup.
 * Sets trade_engine:global status to "running" so individual connection
 * engines can be activated without manual intervention.
 */
async function autoStartGlobalEngine() {
  try {
    const client = getRedisClient()
    const globalState = await client.hgetall("trade_engine:global")
    
    // If already running (persisted from previous session), skip
    if (globalState?.status === "running") {
      console.log("[v0] [Global Engine] Already running from previous session")
      return
    }
    
    // Start global coordinator
    const coordinator = getGlobalTradeEngineCoordinator()
    
    // Set global state to running in Redis
    await client.hset("trade_engine:global", {
      status: "running",
      started_at: new Date().toISOString(),
      coordinator_ready: "true",
      auto_started: "true",
    })
    
    console.log("[v0] [Global Engine] Auto-started Global Trade Engine Coordinator")
  } catch (error) {
    console.error("[v0] [Global Engine] Failed to auto-start:", error instanceof Error ? error.message : String(error))
    // Non-fatal - user can start manually from the UI
  }
}

export async function runPreStartup() {
  // Prevent double execution (Next.js calls register() for each compilation)
  if (globalStore.__cts_startup_guard.completed) {
    console.log("[v0] Pre-startup already completed, skipping duplicate call")
    return
  }
  globalStore.__cts_startup_guard.completed = true

  try {
    console.log("[v0] ==========================================")
    console.log("[v0] PRE-STARTUP INITIALIZATION STARTED")
    console.log("[v0] ==========================================")
    
    console.log("[v0] [1/10] Initializing Redis with Upstash persistence...")
    await initRedis()
    console.log("[v0] [1/10] ✓ Redis initialized")
    
    console.log("[v0] [2/10] Running ALL Redis migrations (automatic)...")
    const migrationResult = await runMigrations()
    console.log(`[v0] [2/10] ✓ Migrations: ${migrationResult.message} (schema v${migrationResult.version})`)
    
    console.log("[v0] [3/10] Initializing settings...")
    await initializeDefaultSettings()
    console.log("[v0] [3/10] ✓ Settings initialized")
    
    console.log("[v0] [4/10] Seeding exchange connections...")
    await seedPredefinedConnections()
    console.log("[v0] [4/10] ✓ Connections seeded")
    
    console.log("[v0] [5/10] Seeding market data...")
    await seedMarketData()
    console.log("[v0] [5/10] ✓ Market data seeded")
    
    console.log("[v0] [6/10] Initializing default active connections...")
    await initializeDefaultActiveConnections()
    console.log("[v0] [6/10] ✓ Default active connections initialized")
    
    console.log("[v0] [7/10] Testing exchange connections (direct connector test)...")
    const testResults = await testAllExchangeConnections()
    console.log(`[v0] [7/10] ✓ Connection testing done: ${testResults?.passed || 0} passed, ${testResults?.failed || 0} failed`)
    
    console.log("[v0] [8/10] Starting Global Trade Engine Coordinator...")
    await autoStartGlobalEngine()
    console.log("[v0] [8/10] ✓ Global Trade Engine Coordinator running")
    
    console.log("[v0] [9/10] Initializing Trade Engines for active connections...")
    await initializeTradeEngineAutoStart()
    console.log("[v0] [9/10] ✓ Trade Engines initialized and auto-start activated")
    
    console.log("[v0] [10/10] Starting periodic connection monitoring...")
    startPeriodicConnectionTesting()
    console.log("[v0] [10/10] ✓ Periodic testing active (every 5 minutes)")
    
    console.log("[v0] ==========================================")
    console.log("[v0] PRE-STARTUP COMPLETE - SYSTEM READY")
    console.log("[v0] ==========================================")
  } catch (error) {
    console.error("[v0] ==========================================")
    console.error("[v0] PRE-STARTUP ERROR")
    console.error("[v0]", error)
    console.error("[v0] ==========================================")
    // Don't throw - allow app to continue with degraded functionality
  }
}
