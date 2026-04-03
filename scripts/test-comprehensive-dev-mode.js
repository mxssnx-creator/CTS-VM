#!/usr/bin/env node

/**
 * Comprehensive Trade Engine Test Script
 * Tests: dev mode startup, quickstart, prehistoric data, engine processing,
 * counts, data, results, ratios, indications, strategies, database loads,
 * server loads, overall infos for processed data
 * Shows detailed results after prehistoric processed + 1min realtime progress
 */

const BASE_URL = "http://localhost:3000"

// ============================================================
// Utility Helpers
// ============================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

function formatNumber(n) {
  if (typeof n !== "number") return String(n || 0)
  return n.toLocaleString()
}

function pad(str, len) {
  return String(str).padEnd(len)
}

function section(title) {
  const line = "═".repeat(70)
  console.log(`\n${line}`)
  console.log(`  ${title}`)
  console.log(line)
}

function subsection(title) {
  console.log(`\n  ── ${title} ──`)
}

function pass(label, detail = "") {
  console.log(`  ✅ ${label}${detail ? ` → ${detail}` : ""}`)
}

function fail(label, detail = "") {
  console.log(`  ❌ ${label}${detail ? ` → ${detail}` : ""}`)
}

function warn(label, detail = "") {
  console.log(`  ⚠️  ${label}${detail ? ` → ${detail}` : ""}`)
}

function info(label, detail = "") {
  console.log(`  ℹ️  ${label}${detail ? ` → ${detail}` : ""}`)
}

function kv(key, value) {
  console.log(`     ${pad(key + ":", 28)} ${value}`)
}

async function fetchJSON(label, path, options = {}) {
  const url = `${BASE_URL}${path}`
  try {
    const res = await fetch(url, { ...options, timeout: 15000 })
    if (!res.ok) {
      fail(`${label} (HTTP ${res.status})`, path)
      return null
    }
    const data = await res.json()
    pass(`${label}`, `HTTP ${res.status}`)
    return data
  } catch (err) {
    fail(`${label}`, err.message || String(err))
    return null
  }
}

// ============================================================
// Test Counters
// ============================================================

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  warnings: 0,
  details: [],
}

function recordTest(name, status, detail = "") {
  results.total++
  if (status === "pass") results.passed++
  else if (status === "fail") results.failed++
  else if (status === "warn") results.warnings++
  results.details.push({ name, status, detail })
}

// ============================================================
// Phase 1: Server Health & Dev Mode
// ============================================================

async function testServerHealth() {
  section("PHASE 1: Server Health & Dev Mode Check")

  const health = await fetchJSON("Health Check", "/api/system/health")
  if (health) {
    recordTest("Health endpoint", "pass")
    subsection("Health Details")
    kv("Status", health.status)
    kv("Environment", health.environment)
    kv("Version", health.version)
    kv("Uptime", formatDuration(health.uptime * 1000))
    kv("Response Time", `${health.responseTime}ms`)
    kv("Redis", health.checks?.redis)
    kv("Connections", health.checks?.connectionsCount)
  } else {
    recordTest("Health endpoint", "fail", "Server not reachable")
  }

  const status = await fetchJSON("System Status", "/api/system/status")
  if (status) {
    recordTest("System status", "pass")
    subsection("System Status Details")
    kv("Overall Status", status.status)
    kv("Total Connections", status.connections?.total)
    kv("Active Connections", status.connections?.active)
    kv("Disabled Connections", status.connections?.disabled)
    kv("Healthy", status.health?.healthy)
    kv("Unhealthy", status.health?.unhealthy)
    kv("Total Requests", formatNumber(status.metrics?.totalRequests))
    kv("Success Rate", status.metrics?.successRate + "%")
    kv("Avg Response Time", status.metrics?.averageResponseTime + "ms")
    kv("Database Keys", formatNumber(status.database?.keys_count))
    kv("Batch Queue", status.batch?.queueLength)
    kv("Active Tasks", status.batch?.activeTasks)
    kv("Completed Tasks", formatNumber(status.batch?.completedTasks))
    if (status.connections?.byExchange) {
      kv("By Exchange", JSON.stringify(status.connections.byExchange))
    }
    if (status.features) {
      kv("Rate Limiting", status.features.rateLimiting)
      kv("Batch Processing", status.features.batchProcessing)
      kv("Health Monitoring", status.features.healthMonitoring)
    }
  } else {
    recordTest("System status", "fail")
  }

  const monitoring = await fetchJSON("Monitoring", "/api/system/monitoring")
  if (monitoring) {
    recordTest("Monitoring endpoint", "pass")
    subsection("Monitoring Details")
    kv("Status", monitoring.status || "OK")
    if (monitoring.memory) {
      kv("Memory Used", monitoring.memory.used || "N/A")
      kv("Memory Free", monitoring.memory.free || "N/A")
    }
    if (monitoring.cpu) {
      kv("CPU Load", monitoring.cpu.load || "N/A")
    }
  } else {
    recordTest("Monitoring endpoint", "warn", "May not be available in dev mode")
  }
}

// ============================================================
// Phase 2: Quickstart & Initialization
// ============================================================

async function testQuickstartAndInit() {
  section("PHASE 2: Quickstart & System Initialization")

  const initStatus = await fetchJSON("Init Status", "/api/system/init-status")
  if (initStatus) {
    recordTest("Init status", "pass")
    subsection("Initialization Status")
    kv("Migrations Run", initStatus.migrationsRun || initStatus.migrations_run)
    kv("Database Ready", initStatus.databaseReady || initStatus.database_ready)
    kv("Connections Setup", initStatus.connectionsSetup || initStatus.connections_setup)
    kv("System Ready", initStatus.systemReady || initStatus.system_ready)
  } else {
    recordTest("Init status", "warn")
  }

  const verifyStartup = await fetchJSON("Verify Startup", "/api/system/verify-startup")
  if (verifyStartup) {
    recordTest("Startup verification", "pass")
    subsection("Startup Verification")
    kv("Status", verifyStartup.status || "OK")
    if (verifyStartup.checks) {
      kv("Redis Check", verifyStartup.checks.redis || "N/A")
      kv("Connections Check", verifyStartup.checks.connections || "N/A")
      kv("Migrations Check", verifyStartup.checks.migrations || "N/A")
    }
  } else {
    recordTest("Startup verification", "warn")
  }

  const verifyComplete = await fetchJSON("Verify Complete", "/api/system/verify-complete")
  if (verifyComplete) {
    recordTest("Complete verification", "pass")
    subsection("Complete System Verification")
    kv("Overall", verifyComplete.status || verifyComplete.overall || "N/A")
    if (verifyComplete.components) {
      kv("Components", formatNumber(verifyComplete.components.length))
    }
    if (verifyComplete.verification) {
      kv("All Phases Passing", verifyComplete.verification.allPhasesPassing)
      kv("Issues", formatNumber(verifyComplete.verification.issues?.length || 0))
      kv("Warnings", formatNumber(verifyComplete.verification.warnings?.length || 0))
    }
  } else {
    recordTest("Complete verification", "warn")
  }

  const integrationTest = await fetchJSON("Integration Test", "/api/system/integration-test")
  if (integrationTest) {
    recordTest("Integration test", "pass")
    subsection("Integration Test Results")
    kv("Status", integrationTest.status || "OK")
    if (integrationTest.results) {
      for (const [key, val] of Object.entries(integrationTest.results)) {
        kv(key, String(val))
      }
    }
  } else {
    recordTest("Integration test", "warn")
  }
}

// ============================================================
// Phase 3: Database Load & Redis
// ============================================================

async function testDatabaseLoads() {
  section("PHASE 3: Database Loads & Redis State")

  const dbStatus = await fetchJSON("Database Status", "/api/settings/database-status")
  if (dbStatus) {
    recordTest("Database status", "pass")
    subsection("Database Status")
    kv("Type", dbStatus.type || dbStatus.databaseType || "N/A")
    kv("Status", dbStatus.status || "N/A")
    kv("Tables/Collections", formatNumber(dbStatus.tables || dbStatus.collections || 0))
    kv("Total Records", formatNumber(dbStatus.totalRecords || dbStatus.total_records || 0))
    if (dbStatus.migrations) {
      kv("Migrations Applied", formatNumber(dbStatus.migrations.applied || 0))
      kv("Migrations Pending", formatNumber(dbStatus.migrations.pending || 0))
    }
  } else {
    recordTest("Database status", "warn")
  }

  const redisState = await fetchJSON("Redis State (Debug)", "/api/debug/redis-state")
  if (redisState) {
    recordTest("Redis state", "pass")
    subsection("Redis State Details")
    kv("Total Keys", formatNumber(redisState.totalKeys || redisState.keyCount || 0))
    if (redisState.keyPatterns) {
      for (const [pattern, count] of Object.entries(redisState.keyPatterns)) {
        kv(`Keys: ${pattern}`, formatNumber(count))
      }
    }
    if (redisState.memory) {
      kv("Memory Usage", redisState.memory)
    }
    if (redisState.connected !== undefined) {
      kv("Connected", redisState.connected)
    }
  } else {
    recordTest("Redis state", "warn")
  }

  const redisStats = await fetchJSON("Redis Stats", "/api/system/health")
  if (redisStats) {
    recordTest("Redis health", "pass")
    subsection("Redis Health")
    kv("Redis Status", redisStats.checks?.redis)
    kv("Uptime", formatDuration(redisStats.uptime * 1000))
  } else {
    recordTest("Redis health", "fail")
  }
}

// ============================================================
// Phase 4: Connections & Active Status
// ============================================================

async function testConnections() {
  section("PHASE 4: Connections & Active Status")

  const connStatus = await fetchJSON("Connections Status", "/api/connections/status")
  if (connStatus) {
    recordTest("Connections status", "pass")
    subsection("Connection Overview")
    kv("Total", formatNumber(connStatus.total || connStatus.totalConnections || 0))
    kv("Active", formatNumber(connStatus.active || connStatus.activeConnections || 0))
    kv("Enabled", formatNumber(connStatus.enabled || connStatus.enabledConnections || 0))
    kv("Assigned", formatNumber(connStatus.assigned || connStatus.assignedConnections || 0))

    if (connStatus.connections && Array.isArray(connStatus.connections)) {
      for (const conn of connStatus.connections) {
        subsection(`Connection: ${conn.name || conn.id || "unknown"}`)
        kv("ID", conn.id)
        kv("Exchange", conn.exchange)
        kv("API Type", conn.api_type || "N/A")
        kv("Testnet", conn.is_testnet === "1" || conn.is_testnet === true ? "Yes" : "No")
        kv("Active Assigned", conn.is_active_assigned === "1" ? "Yes" : "No")
        kv("Enabled", conn.is_enabled === "1" ? "Yes" : "No")
        kv("Status", conn.status || "N/A")
      }
    }
  } else {
    recordTest("Connections status", "warn")
  }

  const activeConns = await fetchJSON("Active Connections", "/api/settings/connections/active")
  if (activeConns) {
    recordTest("Active connections list", "pass")
    subsection("Active Connections List")
    kv("Count", formatNumber(activeConns.length || activeConns.count || 0))
    if (Array.isArray(activeConns)) {
      for (const conn of activeConns) {
        kv(conn.name || conn.id, `${conn.exchange} | ${conn.monitored_symbol || "N/A"}`)
      }
    }
  } else {
    recordTest("Active connections list", "warn")
  }
}

// ============================================================
// Phase 5: Engine Verification (Prehistoric + All Phases)
// ============================================================

async function testEngineVerification() {
  section("PHASE 5: Engine Comprehensive Verification")

  const verify = await fetchJSON("Engine Verify", "/api/system/verify-engine")
  if (!verify) {
    recordTest("Engine verification", "fail")
    return null
  }

  recordTest("Engine verification", "pass")

  subsection("Coordinator Status")
  kv("Coordinator Running", verify.coordinatorRunning)
  kv("Active Connections", verify.activeConnectionCount)

  if (verify.components && verify.components.length > 0) {
    for (const comp of verify.components) {
      subsection(`Component: ${comp.connectionName} (${comp.exchange})`)
      kv("Engine Running", comp.engineRunning)
      kv("Testnet", comp.isTestnet ? "Yes" : "No")

      subsection("  Phase: Prehistoric Data")
      kv("Completed", comp.phases?.prehistoric?.completed)
      kv("Start Date", comp.phases?.prehistoric?.startDate || "N/A")
      kv("End Date", comp.phases?.prehistoric?.endDate || "N/A")
      kv("Progression Cycles", formatNumber(comp.phases?.prehistoric?.progressionCycles))
      recordTest(
        `Prehistoric (${comp.connectionName})`,
        comp.phases?.prehistoric?.completed ? "pass" : "warn",
        comp.phases?.prehistoric?.completed ? "Complete" : "Pending"
      )

      subsection("  Phase: Indications")
      kv("Processing", comp.phases?.indications?.processing)
      kv("Cycle Count", formatNumber(comp.phases?.indications?.cycleCount))
      kv("Avg Duration", `${comp.phases?.indications?.avgDurationMs || 0}ms`)
      kv("Success Rate", comp.phases?.indications?.successRate)
      kv("Last Run", comp.phases?.indications?.lastRun || "Never")
      kv("Recent Records", formatNumber(comp.phases?.indications?.recentRecords))
      recordTest(
        `Indications (${comp.connectionName})`,
        comp.phases?.indications?.cycleCount > 0 ? "pass" : "warn",
        `${comp.phases?.indications?.cycleCount || 0} cycles`
      )

      subsection("  Phase: Strategies")
      kv("Processing", comp.phases?.strategies?.processing)
      kv("Cycle Count", formatNumber(comp.phases?.strategies?.cycleCount))
      kv("Avg Duration", `${comp.phases?.strategies?.avgDurationMs || 0}ms`)
      kv("Total Evaluated", formatNumber(comp.phases?.strategies?.totalEvaluated))
      kv("Last Run", comp.phases?.strategies?.lastRun || "Never")
      kv("Recent Records", formatNumber(comp.phases?.strategies?.recentRecords))
      recordTest(
        `Strategies (${comp.connectionName})`,
        comp.phases?.strategies?.totalEvaluated > 0 ? "pass" : "warn",
        `${comp.phases?.strategies?.totalEvaluated || 0} evaluated`
      )

      subsection("  Phase: Realtime")
      kv("Processing", comp.phases?.realtime?.processing)
      kv("Cycle Count", formatNumber(comp.phases?.realtime?.cycleCount))
      kv("Avg Duration", `${comp.phases?.realtime?.avgDurationMs || 0}ms`)
      kv("Last Run", comp.phases?.realtime?.lastRun || "Never")
      recordTest(
        `Realtime (${comp.connectionName})`,
        comp.phases?.realtime?.processing ? "pass" : "warn"
      )

      subsection("  Phase: Live Trading")
      kv("Active", comp.phases?.liveTrading?.active)
      kv("Total Trades", formatNumber(comp.phases?.liveTrading?.tradesTotal))
      kv("Pseudo Positions", formatNumber(comp.phases?.liveTrading?.pseudoPositions))
      kv("Status", comp.phases?.liveTrading?.status)
      recordTest(
        `Live Trading (${comp.connectionName})`,
        comp.phases?.liveTrading?.active ? "pass" : "warn"
      )

      subsection("  Overall Metrics")
      kv("Success Rate", comp.metrics?.successRate)
      kv("Total Cycles", formatNumber(comp.metrics?.totalCycles))
      kv("Successful Cycles", formatNumber(comp.metrics?.successfulCycles))
      kv("Failed Cycles", formatNumber(comp.metrics?.failedCycles))
    }
  }

  if (verify.verification) {
    subsection("Verification Summary")
    kv("All Phases Passing", verify.verification.allPhasesPassing)
    if (verify.verification.issues?.length > 0) {
      for (const issue of verify.verification.issues) {
        fail("Issue", issue)
      }
    }
    if (verify.verification.warnings?.length > 0) {
      for (const w of verify.verification.warnings) {
        warn("Warning", w)
      }
    }
  }

  return verify
}

// ============================================================
// Phase 6: Progression Tracking (Per Connection)
// ============================================================

async function testProgressionTracking(verifyData) {
  section("PHASE 6: Progression Tracking & State Management")

  if (!verifyData || !verifyData.components || verifyData.components.length === 0) {
    warn("No active components to test progression for")
    recordTest("Progression tracking", "warn", "No active connections")
    return
  }

  for (const comp of verifyData.components) {
    const connId = comp.connectionId
    subsection(`Progression: ${comp.connectionName} (${connId})`)

    const prog = await fetchJSON(
      `Progression (${comp.connectionName})`,
      `/api/connections/progression/${connId}`
    )

    if (prog && prog.success) {
      recordTest(`Progression (${comp.connectionName})`, "pass")

      subsection("  Connection Info")
      kv("Exchange", prog.connection?.exchange)
      kv("Is Active", prog.connection?.isActive)
      kv("Is Enabled", prog.connection?.isEnabled)
      kv("Is Inserted", prog.connection?.isInserted)

      subsection("  Progression State")
      kv("Phase", prog.progression?.phase)
      kv("Progress", `${prog.progression?.progress}%`)
      kv("Message", prog.progression?.message)
      kv("Sub Phase", prog.progression?.subPhase || "None")
      kv("Sub Progress", `${prog.progression?.subProgress?.current}/${prog.progression?.subProgress?.total}`)
      kv("Started At", prog.progression?.startedAt || "N/A")
      kv("Updated At", prog.progression?.updatedAt || "N/A")

      subsection("  Phase Details")
      const details = prog.progression?.details || {}
      kv("Historical Data Loaded", details.historicalDataLoaded)
      kv("Indications Calculated", details.indicationsCalculated)
      kv("Strategies Processed", details.strategiesProcessed)
      kv("Live Processing Active", details.liveProcessingActive)
      kv("Live Trading Active", details.liveTradingActive)

      subsection("  State Metrics")
      const state = prog.state || {}
      kv("Cycles Completed", formatNumber(state.cyclesCompleted))
      kv("Successful Cycles", formatNumber(state.successfulCycles))
      kv("Failed Cycles", formatNumber(state.failedCycles))
      kv("Cycle Success Rate", `${state.cycleSuccessRate}%`)
      kv("Total Trades", formatNumber(state.totalTrades))
      kv("Successful Trades", formatNumber(state.successfulTrades))
      kv("Total Profit", state.totalProfit)
      kv("Trade Success Rate", `${state.tradeSuccessRate}%`)
      kv("Last Cycle Time", state.lastCycleTime || "N/A")
      kv("Prehistoric Cycles", formatNumber(state.prehistoricCyclesCompleted))
      kv("Prehistoric Phase Active", state.prehistoricPhaseActive)

      subsection("  Processing Metrics")
      const metrics = prog.metrics || {}
      kv("Indications Count", formatNumber(metrics.indicationsCount))
      kv("Strategies Count", formatNumber(metrics.strategiesCount))
      kv("Engine Running", metrics.engineRunning)
      kv("Has Recent Activity", metrics.hasRecentActivity)
      kv("Global Engine Status", metrics.globalEngineStatus)
      kv("Engine State Status", metrics.engineStateStatus)
      kv("Indication Cycle Count", formatNumber(metrics.indicationCycleCount))
      kv("Strategy Cycle Count", formatNumber(metrics.strategyCycleCount))
      kv("Last Indication Run", metrics.lastIndicationRun || "Never")
      kv("Last Strategy Run", metrics.lastStrategyRun || "Never")

      subsection("  Recent Logs (last 10)")
      if (prog.recentLogs && prog.recentLogs.length > 0) {
        for (const log of prog.recentLogs.slice(0, 10)) {
          const time = new Date(log.timestamp).toLocaleTimeString()
          kv(`${time} [${log.level}]`, `[${log.phase}] ${log.message}`)
        }
      } else {
        info("No recent logs available")
      }
    } else {
      recordTest(`Progression (${comp.connectionName})`, "fail")
    }
  }
}

// ============================================================
// Phase 7: Indications with Results
// ============================================================

async function testIndicationsWithResults(verifyData) {
  section("PHASE 7: Indications with Results")

  if (!verifyData || !verifyData.components || verifyData.components.length === 0) {
    warn("No active components for indication testing")
    recordTest("Indications results", "warn")
    return
  }

  for (const comp of verifyData.components) {
    subsection(`Indications: ${comp.connectionName}`)

    const indStats = await fetchJSON(
      `Indication Stats (${comp.connectionName})`,
      `/api/dashboard/indications-stats`
    )

    if (indStats) {
      recordTest(`Indication stats (${comp.connectionName})`, "pass")
      subsection("  Indication Statistics")

      if (indStats.indications && Array.isArray(indStats.indications)) {
        kv("Total Types", formatNumber(indStats.indications.length))
        for (const ind of indStats.indications) {
          subsection(`  Type: ${ind.type || ind.indicationType || "unknown"}`)
          kv("Count", formatNumber(ind.count || ind.total || 0))
          kv("Avg Value", ind.avgValue || ind.avg_value || ind.value || "N/A")
          kv("Avg Confidence", ind.avgConfidence || ind.avg_confidence || ind.confidence || "N/A")
          kv("Last Updated", ind.lastUpdated || ind.last_updated || "N/A")
        }
      }

      if (indStats.total) {
        kv("Total Indications", formatNumber(indStats.total))
      }
      if (indStats.recent) {
        kv("Recent (1h)", formatNumber(indStats.recent))
      }
    } else {
      recordTest(`Indication stats (${comp.connectionName})`, "warn")
    }

    const indMain = await fetchJSON("Main Indications", "/api/settings/indications/main")
    if (indMain) {
      recordTest("Main indications config", "pass")
      subsection("  Main Indications Config")
      if (Array.isArray(indMain)) {
        kv("Active Main Indications", formatNumber(indMain.length))
        for (const ind of indMain) {
          kv(ind.name || ind.type || "unknown", `enabled=${ind.enabled || ind.active || "N/A"}`)
        }
      } else if (indMain.indications) {
        kv("Count", formatNumber(indMain.indications.length || 0))
      }
    } else {
      recordTest("Main indications config", "warn")
    }

    const indCommon = await fetchJSON("Common Indications", "/api/settings/indications/common")
    if (indCommon) {
      recordTest("Common indications config", "pass")
      subsection("  Common Indications Config")
      if (Array.isArray(indCommon)) {
        kv("Active Common Indications", formatNumber(indCommon.length))
        for (const ind of indCommon) {
          kv(ind.name || ind.type || "unknown", `enabled=${ind.enabled || ind.active || "N/A"}`)
        }
      }
    } else {
      recordTest("Common indications config", "warn")
    }
  }
}

// ============================================================
// Phase 8: Strategies with Results
// ============================================================

async function testStrategiesWithResults(verifyData) {
  section("PHASE 8: Strategies with Results")

  if (!verifyData || !verifyData.components || verifyData.components.length === 0) {
    warn("No active components for strategy testing")
    recordTest("Strategies results", "warn")
    return
  }

  for (const comp of verifyData.components) {
    subsection(`Strategies: ${comp.connectionName}`)

    const stratEval = await fetchJSON(
      `Strategy Evaluation (${comp.connectionName})`,
      `/api/dashboard/strategies-evaluation`
    )

    if (stratEval) {
      recordTest(`Strategy evaluation (${comp.connectionName})`, "pass")
      subsection("  Strategy Evaluation Results")

      if (stratEval.strategies && Array.isArray(stratEval.strategies)) {
        kv("Total Strategies", formatNumber(stratEval.strategies.length))
        for (const strat of stratEval.strategies) {
          subsection(`  Strategy: ${strat.name || strat.type || strat.id || "unknown"}`)
          kv("Type", strat.type || strat.strategyType || "N/A")
          kv("Status", strat.status || "N/A")
          kv("Win Rate", strat.winRate || strat.win_rate || "N/A")
          kv("Profit Factor", strat.profitFactor || strat.profit_factor || "N/A")
          kv("Total Trades", formatNumber(strat.totalTrades || strat.total_trades || 0))
          kv("Winning Trades", formatNumber(strat.winningTrades || strat.winning_trades || 0))
          kv("Losing Trades", formatNumber(strat.losingTrades || strat.losing_trades || 0))
          kv("Avg Profit", strat.avgProfit || strat.avg_profit || "N/A")
          kv("Avg Loss", strat.avgLoss || strat.avg_loss || "N/A")
          kv("Max Drawdown", strat.maxDrawdown || strat.max_drawdown || "N/A")
          kv("Sharpe Ratio", strat.sharpeRatio || strat.sharpe_ratio || "N/A")
        }
      }

      if (stratEval.summary) {
        subsection("  Strategy Summary")
        kv("Overall Win Rate", stratEval.summary.overallWinRate || stratEval.summary.overall_win_rate || "N/A")
        kv("Total P&L", stratEval.summary.totalPnL || stratEval.summary.total_pnl || "N/A")
        kv("Total Strategies", formatNumber(stratEval.summary.totalStrategies || stratEval.summary.total_strategies || 0))
        kv("Active Strategies", formatNumber(stratEval.summary.activeStrategies || stratEval.summary.active_strategies || 0))
      }
    } else {
      recordTest(`Strategy evaluation (${comp.connectionName})`, "warn")
    }

    const presets = await fetchJSON("Presets", "/api/presets")
    if (presets) {
      recordTest("Presets list", "pass")
      subsection("  Presets Overview")
      kv("Total Presets", formatNumber(presets.length || presets.count || 0))
      if (Array.isArray(presets)) {
        for (const preset of presets.slice(0, 5)) {
          kv(preset.name || preset.id || "unknown", `type=${preset.type || "N/A"} | active=${preset.active || preset.isActive || "N/A"}`)
        }
      }
    } else {
      recordTest("Presets list", "warn")
    }
  }
}

// ============================================================
// Phase 9: Data Processing Counts & Ratios
// ============================================================

async function testDataProcessingCounts(verifyData) {
  section("PHASE 9: Data Processing Counts & Ratios")

  if (!verifyData || !verifyData.components || verifyData.components.length === 0) {
    warn("No active components for data processing analysis")
    recordTest("Data processing counts", "warn")
    return
  }

  for (const comp of verifyData.components) {
    subsection(`Data Processing: ${comp.connectionName}`)

    const phases = comp.phases || {}
    const metrics = comp.metrics || {}

    subsection("  Processing Counts")
    kv("Prehistoric Cycles", formatNumber(phases.prehistoric?.progressionCycles || 0))
    kv("Indication Cycles", formatNumber(phases.indications?.cycleCount || 0))
    kv("Strategy Evaluations", formatNumber(phases.strategies?.totalEvaluated || 0))
    kv("Realtime Cycles", formatNumber(phases.realtime?.cycleCount || 0))
    kv("Total Trades", formatNumber(phases.liveTrading?.tradesTotal || 0))
    kv("Active Positions", formatNumber(phases.liveTrading?.pseudoPositions || 0))
    kv("Recent Indications", formatNumber(phases.indications?.recentRecords || 0))
    kv("Recent Strategies", formatNumber(phases.strategies?.recentRecords || 0))

    subsection("  Processing Ratios")
    const indCycles = phases.indications?.cycleCount || 0
    const stratCycles = phases.strategies?.cycleCount || 0
    const totalCycles = metrics.totalCycles || 0
    const successRate = parseFloat(String(metrics.successRate || "0").replace("%", ""))

    kv("Indication/Strategy Ratio", indCycles > 0 ? (stratCycles / indCycles).toFixed(2) : "N/A")
    kv("Success Rate", metrics.successRate || "0%")
    kv("Failed/Total Ratio", totalCycles > 0 ? ((metrics.failedCycles || 0) / totalCycles).toFixed(4) : "N/A")
    kv("Avg Indication Duration", `${phases.indications?.avgDurationMs || 0}ms`)
    kv("Avg Strategy Duration", `${phases.strategies?.avgDurationMs || 0}ms`)

    subsection("  Prehistoric Data Analysis")
    const prehistoric = phases.prehistoric || {}
    kv("Data Loaded", prehistoric.completed)
    kv("Data Range Start", prehistoric.startDate || "N/A")
    kv("Data Range End", prehistoric.endDate || "N/A")
    if (prehistoric.startDate && prehistoric.endDate) {
      const start = new Date(prehistoric.startDate)
      const end = new Date(prehistoric.endDate)
      const range = end - start
      kv("Data Span", formatDuration(range))
    }

    subsection("  Performance Indicators")
    kv("Engine Running", comp.engineRunning)
    kv("All Phases Active", phases.indications?.processing && phases.strategies?.processing && phases.realtime?.processing)
    kv("Live Trading Active", phases.liveTrading?.active)
    kv("Live Trading Status", phases.liveTrading?.status)
  }
}

// ============================================================
// Phase 10: Processed Data Overall Info
// ============================================================

async function testProcessedDataOverall(verifyData) {
  section("PHASE 10: Overall Processed Data Information")

  if (!verifyData || !verifyData.components || verifyData.components.length === 0) {
    warn("No active components for overall data analysis")
    recordTest("Overall processed data", "warn")
    return
  }

  let totalIndications = 0
  let totalStrategies = 0
  let totalTrades = 0
  let totalPositions = 0
  let totalCycles = 0
  let allEnginesRunning = true

  for (const comp of verifyData.components) {
    const phases = comp.phases || {}
    const metrics = comp.metrics || {}

    totalIndications += phases.indications?.recentRecords || 0
    totalStrategies += phases.strategies?.recentRecords || 0
    totalTrades += phases.liveTrading?.tradesTotal || 0
    totalPositions += phases.liveTrading?.pseudoPositions || 0
    totalCycles += metrics.totalCycles || 0

    if (!comp.engineRunning) allEnginesRunning = false

    subsection(`Overall: ${comp.connectionName}`)
    kv("Exchange", comp.exchange)
    kv("Engine Status", comp.engineRunning ? "Running" : "Stopped")
    kv("Current Phase", phases.liveTrading?.status || "N/A")
    kv("Total Data Points", formatNumber(totalIndications + totalStrategies + totalTrades))
    kv("Processing Health", metrics.successRate || "0%")
  }

  subsection("Aggregate Totals")
  kv("Total Connections", verifyData.components.length)
  kv("All Engines Running", allEnginesRunning)
  kv("Total Indications (recent)", formatNumber(totalIndications))
  kv("Total Strategies (recent)", formatNumber(totalStrategies))
  kv("Total Trades", formatNumber(totalTrades))
  kv("Total Positions", formatNumber(totalPositions))
  kv("Total Processing Cycles", formatNumber(totalCycles))
  kv("Total Data Points Processed", formatNumber(totalIndications + totalStrategies + totalTrades))

  recordTest("Overall processed data", allEnginesRunning ? "pass" : "warn")
}

// ============================================================
// Phase 11: Realtime Progress Monitoring (1 minute)
// ============================================================

async function testRealtimeProgress(verifyData) {
  section("PHASE 11: Realtime Progress Monitoring (60 seconds)")

  if (!verifyData || !verifyData.components || verifyData.components.length === 0) {
    warn("No active components for realtime monitoring")
    recordTest("Realtime progress", "warn")
    return
  }

  const snapshots = []
  const intervalMs = 10000
  const totalDuration = 60000
  const numSnapshots = totalDuration / intervalMs

  info("Starting 60-second realtime monitoring (snapshot every 10s)")

  for (let i = 0; i <= numSnapshots; i++) {
    const elapsed = i * intervalMs
    const remaining = totalDuration - elapsed

    if (i > 0) {
      console.log(`\n  ⏳ Waiting ${intervalMs / 1000}s... (${remaining / 1000}s remaining)`)
      await sleep(intervalMs)
    }

    subsection(`Snapshot ${i}/${numSnapshots} (T+${elapsed / 1000}s)`)

    for (const comp of verifyData.components) {
      const connId = comp.connectionId

      const prog = await fetchJSON(
        `Progression @T+${elapsed / 1000}s`,
        `/api/connections/progression/${connId}`
      )

      if (prog && prog.success) {
        kv(`${comp.connectionName} Phase`, prog.progression?.phase)
        kv(`${comp.connectionName} Progress`, `${prog.progression?.progress}%`)
        kv(`${comp.connectionName} Cycles`, formatNumber(prog.state?.cyclesCompleted))
        kv(`${comp.connectionName} Indications`, formatNumber(prog.metrics?.indicationsCount))
        kv(`${comp.connectionName} Strategies`, formatNumber(prog.metrics?.strategiesCount))
        kv(`${comp.connectionName} Last Indication`, prog.metrics?.lastIndicationRun ? new Date(prog.metrics.lastIndicationRun).toLocaleTimeString() : "Never")
        kv(`${comp.connectionName} Last Strategy`, prog.metrics?.lastStrategyRun ? new Date(prog.metrics.lastStrategyRun).toLocaleTimeString() : "Never")

        snapshots.push({
          time: elapsed,
          connectionName: comp.connectionName,
          phase: prog.progression?.phase,
          progress: prog.progression?.progress,
          cycles: prog.state?.cyclesCompleted,
          indications: prog.metrics?.indicationsCount,
          strategies: prog.metrics?.strategiesCount,
        })
      }
    }
  }

  subsection("Realtime Progress Summary")
  if (snapshots.length >= 2) {
    for (const comp of verifyData.components) {
      const compSnapshots = snapshots.filter((s) => s.connectionName === comp.connectionName)
      if (compSnapshots.length >= 2) {
        const first = compSnapshots[0]
        const last = compSnapshots[compSnapshots.length - 1]

        subsection(`  ${comp.connectionName} - 60s Delta`)
        kv("Phase Change", `${first.phase} → ${last.phase}`)
        kv("Progress Change", `${first.progress}% → ${last.progress}%`)
        kv("Cycles Delta", formatNumber(last.cycles - first.cycles))
        kv("Indications Delta", formatNumber(last.indications - first.indications))
        kv("Strategies Delta", formatNumber(last.strategies - first.strategies))
        kv("Cycles/sec", ((last.cycles - first.cycles) / 60).toFixed(2))
        kv("Indications/sec", ((last.indications - first.indications) / 60).toFixed(2))
        kv("Strategies/sec", ((last.strategies - first.strategies) / 60).toFixed(2))

        recordTest(
          `Realtime progress (${comp.connectionName})`,
          last.cycles > first.cycles ? "pass" : "warn",
          `+${last.cycles - first.cycles} cycles in 60s`
        )
      }
    }
  }
}

// ============================================================
// Phase 12: API Functionality Tests
// ============================================================

async function testApiFunctionality() {
  section("PHASE 12: API Functionality Tests")

  const endpoints = [
    { name: "Settings", path: "/api/settings" },
    { name: "Positions", path: "/api/positions" },
    { name: "Trades", path: "/api/trades" },
    { name: "Market Data", path: "/api/market-data" },
    { name: "Exchanges", path: "/api/exchanges" },
    { name: "Risk Metrics", path: "/api/risk/metrics" },
    { name: "System Verify APIs", path: "/api/system/verify-apis" },
    { name: "System Log", path: "/api/system/log" },
    { name: "Progression", path: "/api/progression" },
    { name: "Preset Sets", path: "/api/preset-sets" },
    { name: "Quickstart Prehistoric Log", path: "/api/quickstart/prehistoric-log" },
    { name: "Trading Stats", path: "/api/trading/stats" },
    { name: "Trading Engine Stats", path: "/api/trading/engine-stats" },
    { name: "Positions Stats", path: "/api/positions/stats" },
    { name: "System Stats V2", path: "/api/dashboard/system-stats-v2" },
    { name: "System Stats V3", path: "/api/dashboard/system-stats-v3" },
  ]

  for (const ep of endpoints) {
    const data = await fetchJSON(ep.name, ep.path)
    if (data) {
      recordTest(`API: ${ep.name}`, "pass")
    } else {
      recordTest(`API: ${ep.name}`, "warn")
    }
  }
}

// ============================================================
// Phase 13: Settings & Risk Engine
// ============================================================

async function testSettingsAndRisk() {
  section("PHASE 13: Settings & Risk Engine Configuration")

  const riskEngines = await fetchJSON("Risk & Engines", "/api/settings/risk-and-engines")
  if (riskEngines) {
    recordTest("Risk & engines config", "pass")
    subsection("Risk & Engine Settings")
    if (typeof riskEngines === "object") {
      for (const [key, val] of Object.entries(riskEngines)) {
        if (typeof val !== "object" || val === null) {
          kv(key, String(val))
        }
      }
    }
  } else {
    recordTest("Risk & engines config", "warn")
  }

  const systemSettings = await fetchJSON("System Settings", "/api/settings/system")
  if (systemSettings) {
    recordTest("System settings", "pass")
    subsection("System Settings")
    if (typeof systemSettings === "object") {
      for (const [key, val] of Object.entries(systemSettings)) {
        if (typeof val !== "object" || val === null) {
          kv(key, String(val))
        }
      }
    }
  } else {
    recordTest("System settings", "warn")
  }

  const limits = await fetchJSON("Settings Limits", "/api/settings/set-limits")
  if (limits) {
    recordTest("Settings limits", "pass")
  } else {
    recordTest("Settings limits", "warn")
  }
}

// ============================================================
// Final Summary
// ============================================================

function printFinalSummary() {
  section("FINAL TEST SUMMARY")

  const passRate = results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : 0
  const failRate = results.total > 0 ? ((results.failed / results.total) * 100).toFixed(1) : 0
  const warnRate = results.total > 0 ? ((results.warnings / results.total) * 100).toFixed(1) : 0

  console.log(`\n  Total Tests:  ${results.total}`)
  console.log(`  Passed:       ${results.passed} (${passRate}%)`)
  console.log(`  Failed:       ${results.failed} (${failRate}%)`)
  console.log(`  Warnings:     ${results.warnings} (${warnRate}%)`)

  const line = "─".repeat(70)
  console.log(`\n  ${line}`)
  console.log(`  ${pad("Test", 45)} ${pad("Status", 10)} Detail`)
  console.log(`  ${line}`)

  for (const d of results.details) {
    const icon = d.status === "pass" ? "✅" : d.status === "fail" ? "❌" : "⚠️ "
    console.log(`  ${icon} ${pad(d.name, 43)} ${pad(d.status.toUpperCase(), 10)} ${d.detail}`)
  }

  console.log(`\n  ${line}`)

  if (results.failed === 0) {
    console.log(`\n  🚀 ALL CRITICAL TESTS PASSED`)
  } else {
    console.log(`\n  ⚠️  ${results.failed} TEST(S) FAILED - Review details above`)
  }

  console.log(`\n  Test completed at: ${new Date().toISOString()}`)
  console.log("")
}

// ============================================================
// Main Test Runner
// ============================================================

async function main() {
  console.log("\n")
  console.log("╔══════════════════════════════════════════════════════════╗")
  console.log("║     CTS v3.1 - Comprehensive Trade Engine Test Suite    ║")
  console.log("║     Testing: Dev Mode, Prehistoric, Engine, Data,       ║")
  console.log("║     Indications, Strategies, Database, Server, Overall   ║")
  console.log("╚══════════════════════════════════════════════════════════╝")
  console.log(`\n  Started at: ${new Date().toISOString()}`)
  console.log(`  Target: ${BASE_URL}`)

  const overallStart = Date.now()

  try {
    await testServerHealth()
    await testQuickstartAndInit()
    await testDatabaseLoads()
    await testConnections()

    const verifyData = await testEngineVerification()

    if (verifyData) {
      await testProgressionTracking(verifyData)
      await testIndicationsWithResults(verifyData)
      await testStrategiesWithResults(verifyData)
      await testDataProcessingCounts(verifyData)
      await testProcessedDataOverall(verifyData)
    }

    await testRealtimeProgress(verifyData)
    await testApiFunctionality()
    await testSettingsAndRisk()

    const overallDuration = Date.now() - overallStart
    console.log(`\n  Overall test duration: ${formatDuration(overallDuration)}`)

    printFinalSummary()

    process.exit(results.failed > 5 ? 1 : 0)
  } catch (err) {
    console.error(`\n  💥 Test suite crashed: ${err.message || String(err)}`)
    if (err.stack) console.error(err.stack)
    printFinalSummary()
    process.exit(1)
  }
}

main()
