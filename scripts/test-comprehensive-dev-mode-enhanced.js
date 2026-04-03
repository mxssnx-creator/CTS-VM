#!/usr/bin/env node

/**
 * CTS v3.1 - Enhanced Comprehensive Trade Engine Test Script
 * 
 * Tests: dev mode startup, quickstart, prehistoric data, engine processing,
 * counts, data, results, ratios, indications, strategies, database loads,
 * server loads, overall infos for processed data
 * 
 * Features:
 * - Crash recovery with state persistence
 * - Retry logic with exponential backoff
 * - Graceful degradation for missing endpoints
 * - Detailed results after prehistoric processed + 1min realtime progress
 * - Intermediate result saving
 * - Timeout handling per request
 * - Signal handling for graceful shutdown
 * 
 * Usage: node scripts/test-comprehensive-dev-mode-enhanced.js
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

// ============================================================
// Configuration
// ============================================================

const CONFIG = {
  BASE_URL: process.env.BASE_URL || "http://localhost:3000",
  DEFAULT_TIMEOUT: 15000,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 2000,
  RETRY_BACKOFF_MULTIPLIER: 2,
  REALTIME_MONITOR_DURATION_MS: 60000,
  REALTIME_SNAPSHOT_INTERVAL_MS: 10000,
  PREHISTORIC_CHECK_INTERVAL_MS: 5000,
  PREHISTORIC_MAX_WAIT_MS: 300000,
  STATE_FILE: path.join(__dirname, ".test-state.json"),
  RESULTS_FILE: path.join(__dirname, ".test-results.json"),
  LOG_FILE: path.join(__dirname, ".test-log.txt"),
  CRASH_RECOVERY: true,
  SAVE_INTERVAL_MS: 5000,
};

// ============================================================
// State Management
// ============================================================

class TestState {
  constructor() {
    this.phases = {};
    this.currentPhase = null;
    this.startTime = Date.now();
    this.crashCount = 0;
    this.lastSaveTime = 0;
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      warnings: 0,
      details: [],
      phaseResults: {},
    };
    this.verifyData = null;
    this.realtimeSnapshots = [];
    this.prehistoricComplete = false;
    this.prehistoricCompleteTime = null;
  }

  markPhaseStart(phase) {
    this.currentPhase = phase;
    this.phases[phase] = {
      status: "running",
      startTime: Date.now(),
      endTime: null,
      error: null,
    };
    this.save();
  }

  markPhaseComplete(phase, error = null) {
    if (this.phases[phase]) {
      this.phases[phase].status = error ? "failed" : "complete";
      this.phases[phase].endTime = Date.now();
      this.phases[phase].error = error;
    }
    this.currentPhase = null;
    this.save();
  }

  recordTest(name, status, detail = "", phase = null) {
    this.results.total++;
    if (status === "pass") this.results.passed++;
    else if (status === "fail") this.results.failed++;
    else if (status === "warn") this.results.warnings++;

    this.results.details.push({
      name,
      status,
      detail,
      phase: phase || this.currentPhase,
      timestamp: new Date().toISOString(),
    });

    if (phase && !this.results.phaseResults[phase]) {
      this.results.phaseResults[phase] = { total: 0, passed: 0, failed: 0, warnings: 0 };
    }
    if (phase) {
      this.results.phaseResults[phase].total++;
      if (status === "pass") this.results.phaseResults[phase].passed++;
      else if (status === "fail") this.results.phaseResults[phase].failed++;
      else if (status === "warn") this.results.phaseResults[phase].warnings++;
    }
  }

  save() {
    const now = Date.now();
    if (now - this.lastSaveTime < CONFIG.SAVE_INTERVAL_MS && this.currentPhase) return;
    this.lastSaveTime = now;

    try {
      const stateData = {
        phases: this.phases,
        currentPhase: this.currentPhase,
        startTime: this.startTime,
        crashCount: this.crashCount,
        results: this.results,
        verifyData: this.verifyData,
        realtimeSnapshots: this.realtimeSnapshots,
        prehistoricComplete: this.prehistoricComplete,
        prehistoricCompleteTime: this.prehistoricCompleteTime,
      };
      fs.writeFileSync(CONFIG.STATE_FILE, JSON.stringify(stateData, null, 2));
    } catch (err) {
      console.error(`  [WARN] Failed to save state: ${err.message}`);
    }
  }

  saveResults() {
    try {
      const resultsData = {
        ...this.results,
        phases: this.phases,
        startTime: this.startTime,
        endTime: Date.now(),
        duration: Date.now() - this.startTime,
        crashCount: this.crashCount,
        prehistoricComplete: this.prehistoricComplete,
        prehistoricCompleteTime: this.prehistoricCompleteTime,
        realtimeSnapshots: this.realtimeSnapshots,
      };
      fs.writeFileSync(CONFIG.RESULTS_FILE, JSON.stringify(resultsData, null, 2));
    } catch (err) {
      console.error(`  [WARN] Failed to save results: ${err.message}`);
    }
  }

  log(message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}\n`;
    try {
      fs.appendFileSync(CONFIG.LOG_FILE, line);
    } catch (err) {}
  }

  static load() {
    try {
      if (fs.existsSync(CONFIG.STATE_FILE)) {
        const data = JSON.parse(fs.readFileSync(CONFIG.STATE_FILE, "utf8"));
        const state = new TestState();
        Object.assign(state, data);
        return state;
      }
    } catch (err) {
      console.error(`  [WARN] Failed to load state: ${err.message}`);
    }
    return new TestState();
  }
}

// ============================================================
// HTTP Client with Retry
// ============================================================

class HttpClient {
  static async fetch(url, options = {}) {
    const timeout = options.timeout || CONFIG.DEFAULT_TIMEOUT;
    const maxRetries = options.retries !== undefined ? options.retries : CONFIG.MAX_RETRIES;
    const label = options.label || url;

    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = CONFIG.RETRY_DELAY_MS * Math.pow(CONFIG.RETRY_BACKOFF_MULTIPLIER, attempt - 1);
        state.log(`  Retry ${attempt}/${maxRetries} for ${label} (waiting ${delay}ms)`);
        await sleep(delay);
      }

      try {
        const result = await HttpClient._request(url, { ...options, timeout });
        return result;
      } catch (err) {
        lastError = err;
        state.log(`  Request failed for ${label}: ${err.message} (attempt ${attempt + 1}/${maxRetries + 1})`);

        if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
          break;
        }
      }
    }

    return { success: false, error: lastError?.message || "Unknown error", statusCode: lastError?.statusCode };
  }

  static _request(url, options) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url, CONFIG.BASE_URL);
      const isHttps = urlObj.protocol === "https:";
      const client = isHttps ? https : http;

      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        timeout: options.timeout,
      };

      const req = client.request(requestOptions, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            resolve({
              success: res.statusCode >= 200 && res.statusCode < 300,
              statusCode: res.statusCode,
              data: parsed,
            });
          } catch (err) {
            resolve({
              success: res.statusCode >= 200 && res.statusCode < 300,
              statusCode: res.statusCode,
              data: data,
              raw: true,
            });
          }
        });
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`Request timeout after ${options.timeout}ms`));
      });

      req.on("error", (err) => {
        reject(err);
      });

      if (options.body) {
        req.write(JSON.stringify(options.body));
      }

      req.end();
    });
  }
}

// ============================================================
// Utility Helpers
// ============================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function formatNumber(n) {
  if (typeof n !== "number") return String(n || 0);
  return n.toLocaleString();
}

function formatPercent(n) {
  if (typeof n !== "number") return "N/A";
  return `${n.toFixed(1)}%`;
}

function pad(str, len) {
  return String(str).padEnd(len);
}

function safeGet(obj, path, defaultValue = "N/A") {
  if (!obj) return defaultValue;
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return defaultValue;
    current = current[part];
  }
  return current !== null && current !== undefined ? current : defaultValue;
}

function safeNumber(obj, path, defaultValue = 0) {
  const val = safeGet(obj, path, defaultValue);
  const num = Number(val);
  return isNaN(num) ? defaultValue : num;
}

function section(title) {
  const line = "═".repeat(70);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(line);
}

function subsection(title) {
  console.log(`\n  ── ${title} ──`);
}

function pass(label, detail = "") {
  console.log(`  ✅ ${label}${detail ? ` → ${detail}` : ""}`);
}

function fail(label, detail = "") {
  console.log(`  ❌ ${label}${detail ? ` → ${detail}` : ""}`);
}

function warn(label, detail = "") {
  console.log(`  ⚠️  ${label}${detail ? ` → ${detail}` : ""}`);
}

function info(label, detail = "") {
  console.log(`  ℹ️  ${label}${detail ? ` → ${detail}` : ""}`);
}

function kv(key, value) {
  console.log(`     ${pad(key + ":", 28)} ${value}`);
}

// ============================================================
// Crash Handler
// ============================================================

function setupCrashHandlers() {
  process.on("SIGINT", () => {
    console.log("\n\n  ⚠️  Received SIGINT - Saving results and exiting...");
    state.saveResults();
    printFinalSummary();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n\n  ⚠️  Received SIGTERM - Saving results and exiting...");
    state.saveResults();
    printFinalSummary();
    process.exit(0);
  });

  process.on("uncaughtException", (err) => {
    state.crashCount++;
    state.log(`CRASH #${state.crashCount}: ${err.message}\n${err.stack}`);
    console.error(`\n  💥 Uncaught exception (crash #${state.crashCount}): ${err.message}`);

    if (state.currentPhase) {
      state.markPhaseComplete(state.currentPhase, err.message);
    }

    state.recordTest(`Phase: ${state.currentPhase || "unknown"}`, "fail", `Crash: ${err.message}`);
    state.saveResults();

    if (state.crashCount >= 3) {
      console.log(`  💥 Too many crashes (${state.crashCount}). Exiting.`);
      printFinalSummary();
      process.exit(1);
    }

    console.log(`  🔄 Attempting to continue...`);
  });

  process.on("unhandledRejection", (reason, promise) => {
    state.crashCount++;
    const msg = reason instanceof Error ? reason.message : String(reason);
    state.log(`UNHANDLED REJECTION #${state.crashCount}: ${msg}`);
    console.error(`\n  💥 Unhandled rejection (crash #${state.crashCount}): ${msg}`);

    if (state.currentPhase) {
      state.markPhaseComplete(state.currentPhase, msg);
    }

    state.recordTest(`Phase: ${state.currentPhase || "unknown"}`, "fail", `Rejection: ${msg}`);
    state.saveResults();

    if (state.crashCount >= 3) {
      console.log(`  💥 Too many crashes (${state.crashCount}). Exiting.`);
      printFinalSummary();
      process.exit(1);
    }
  });
}

// ============================================================
// Prehistoric Wait Logic
// ============================================================

async function waitForPrehistoricComplete(verifyData) {
  if (!verifyData || !verifyData.components || verifyData.components.length === 0) {
    warn("No components to check for prehistoric completion");
    state.prehistoricComplete = true;
    state.prehistoricCompleteTime = Date.now();
    return true;
  }

  const startTime = Date.now();
  let allComplete = false;

  info("Waiting for prehistoric data processing to complete...");

  while (Date.now() - startTime < CONFIG.PREHISTORIC_MAX_WAIT_MS) {
    allComplete = true;

    for (const comp of verifyData.components) {
      try {
        const prog = await HttpClient.fetch(
          `${CONFIG.BASE_URL}/api/connections/progression/${comp.connectionId}`,
          { label: `Prehistoric check (${comp.connectionName})`, retries: 1 }
        );

        if (prog.success && prog.data) {
          const phase = safeGet(prog.data, "progression.phase", "");
          const prehistoricDone = phase !== "prehistoric_data" && phase !== "initializing";

          if (!prehistoricDone) {
            allComplete = false;
            const progress = safeGet(prog.data, "progression.progress", 0);
            process.stdout.write(`\r     ⏳ ${comp.connectionName}: Prehistoric progress ${progress}%`);
          }
        } else {
          allComplete = false;
        }
      } catch (err) {
        allComplete = false;
      }
    }

    if (allComplete) {
      console.log(`\r     ✅ All components prehistoric processing complete!`);
      state.prehistoricComplete = true;
      state.prehistoricCompleteTime = Date.now();
      state.log(`Prehistoric complete after ${formatDuration(Date.now() - startTime)}`);
      return true;
    }

    await sleep(CONFIG.PREHISTORIC_CHECK_INTERVAL_MS);
  }

  console.log(`\n     ⚠️  Prehistoric wait timeout after ${formatDuration(CONFIG.PREHISTORIC_MAX_WAIT_MS)}`);
  state.prehistoricComplete = false;
  state.recordTest("Prehistoric completion wait", "warn", "Timeout reached");
  return false;
}

// ============================================================
// Phase 1: Server Health & Dev Mode
// ============================================================

async function testServerHealth() {
  const phase = "server_health";
  state.markPhaseStart(phase);

  try {
    section("PHASE 1: Server Health & Dev Mode Check");

    const health = await HttpClient.fetch(`${CONFIG.BASE_URL}/api/system/health`, { label: "Health Check" });
    if (health.success && health.data) {
      state.recordTest("Health endpoint", "pass", `HTTP ${health.statusCode}`, phase);
      subsection("Health Details");
      kv("Status", safeGet(health.data, "status"));
      kv("Environment", safeGet(health.data, "environment"));
      kv("Version", safeGet(health.data, "version"));
      kv("Uptime", formatDuration(safeNumber(health.data, "uptime", 0) * 1000));
      kv("Response Time", `${safeGet(health.data, "responseTime", "N/A")}ms`);
      kv("Redis", safeGet(health.data, "checks.redis"));
      kv("Connections", safeNumber(health.data, "checks.connectionsCount"));
    } else {
      state.recordTest("Health endpoint", "fail", health.error || `HTTP ${health.statusCode}`, phase);
    }

    const status = await HttpClient.fetch(`${CONFIG.BASE_URL}/api/system/status`, { label: "System Status" });
    if (status.success && status.data) {
      state.recordTest("System status", "pass", `HTTP ${status.statusCode}`, phase);
      subsection("System Status Details");
      kv("Overall Status", safeGet(status.data, "status"));
      kv("Total Connections", safeNumber(status.data, "connections.total"));
      kv("Active Connections", safeNumber(status.data, "connections.active"));
      kv("Disabled Connections", safeNumber(status.data, "connections.disabled"));
      kv("Healthy", safeNumber(status.data, "health.healthy"));
      kv("Unhealthy", safeNumber(status.data, "health.unhealthy"));
      kv("Total Requests", formatNumber(safeNumber(status.data, "metrics.totalRequests")));
      kv("Success Rate", formatPercent(safeNumber(status.data, "metrics.successRate")));
      kv("Avg Response Time", `${safeNumber(status.data, "metrics.averageResponseTime")}ms`);
      kv("Database Keys", formatNumber(safeNumber(status.data, "database.keys_count")));
      kv("Batch Queue", safeNumber(status.data, "batch.queueLength"));
      kv("Active Tasks", safeNumber(status.data, "batch.activeTasks"));
      kv("Completed Tasks", formatNumber(safeNumber(status.data, "batch.completedTasks")));
      if (status.data.connections?.byExchange) {
        kv("By Exchange", JSON.stringify(status.data.connections.byExchange));
      }
      if (status.data.features) {
        kv("Rate Limiting", safeGet(status.data, "features.rateLimiting"));
        kv("Batch Processing", safeGet(status.data, "features.batchProcessing"));
        kv("Health Monitoring", safeGet(status.data, "features.healthMonitoring"));
      }
    } else {
      state.recordTest("System status", "fail", status.error || `HTTP ${status.statusCode}`, phase);
    }

    const monitoring = await HttpClient.fetch(`${CONFIG.BASE_URL}/api/system/monitoring`, { label: "Monitoring" });
    if (monitoring.success && monitoring.data) {
      state.recordTest("Monitoring endpoint", "pass", `HTTP ${monitoring.statusCode}`, phase);
      subsection("Monitoring Details");
      kv("Status", safeGet(monitoring.data, "status", "OK"));
      if (monitoring.data.memory) {
        kv("Memory Used", safeGet(monitoring.data, "memory.used", "N/A"));
        kv("Memory Free", safeGet(monitoring.data, "memory.free", "N/A"));
      }
      if (monitoring.data.cpu) {
        kv("CPU Load", safeGet(monitoring.data, "cpu.load", "N/A"));
      }
    } else {
      state.recordTest("Monitoring endpoint", "warn", "May not be available in dev mode", phase);
    }

    state.markPhaseComplete(phase);
  } catch (err) {
    state.markPhaseComplete(phase, err.message);
    state.recordTest("Server health phase", "fail", err.message, phase);
    throw err;
  }
}

// ============================================================
// Phase 2: Quickstart & Initialization
// ============================================================

async function testQuickstartAndInit() {
  const phase = "quickstart_init";
  state.markPhaseStart(phase);

  try {
    section("PHASE 2: Quickstart & System Initialization");

    const endpoints = [
      { name: "Init Status", path: "/api/system/init-status", key: "initStatus" },
      { name: "Verify Startup", path: "/api/system/verify-startup", key: "verifyStartup" },
      { name: "Verify Complete", path: "/api/system/verify-complete", key: "verifyComplete" },
      { name: "Integration Test", path: "/api/system/integration-test", key: "integrationTest" },
    ];

    for (const ep of endpoints) {
      const result = await HttpClient.fetch(`${CONFIG.BASE_URL}${ep.path}`, { label: ep.name });
      if (result.success && result.data) {
        state.recordTest(ep.name, "pass", `HTTP ${result.statusCode}`, phase);
        subsection(`${ep.name} Details`);

        if (typeof result.data === "object") {
          for (const [key, val] of Object.entries(result.data)) {
            if (typeof val !== "object" || val === null || Array.isArray(val)) {
              kv(key, Array.isArray(val) ? formatNumber(val.length) : String(val));
            }
          }
        }

        if (ep.key === "verifyStartup" && result.data.checks) {
          kv("Redis Check", safeGet(result.data, "checks.redis", "N/A"));
          kv("Connections Check", safeGet(result.data, "checks.connections", "N/A"));
          kv("Migrations Check", safeGet(result.data, "checks.migrations", "N/A"));
        }

        if (ep.key === "verifyComplete" && result.data.verification) {
          kv("All Phases Passing", safeGet(result.data, "verification.allPhasesPassing"));
          kv("Issues", formatNumber(safeNumber(result.data, "verification.issues.length")));
          kv("Warnings", formatNumber(safeNumber(result.data, "verification.warnings.length")));
        }
      } else {
        state.recordTest(ep.name, "warn", result.error || `HTTP ${result.statusCode}`, phase);
      }
    }

    state.markPhaseComplete(phase);
  } catch (err) {
    state.markPhaseComplete(phase, err.message);
    state.recordTest("Quickstart init phase", "fail", err.message, phase);
    throw err;
  }
}

// ============================================================
// Phase 3: Database Load & Redis
// ============================================================

async function testDatabaseLoads() {
  const phase = "database_loads";
  state.markPhaseStart(phase);

  try {
    section("PHASE 3: Database Loads & Redis State");

    const dbStatus = await HttpClient.fetch(`${CONFIG.BASE_URL}/api/settings/database-status`, { label: "Database Status" });
    if (dbStatus.success && dbStatus.data) {
      state.recordTest("Database status", "pass", `HTTP ${dbStatus.statusCode}`, phase);
      subsection("Database Status");
      kv("Type", safeGet(dbStatus.data, "type", safeGet(dbStatus.data, "databaseType")));
      kv("Status", safeGet(dbStatus.data, "status"));
      kv("Tables/Collections", formatNumber(safeNumber(dbStatus.data, "tables", safeNumber(dbStatus.data, "collections"))));
      kv("Total Records", formatNumber(safeNumber(dbStatus.data, "totalRecords", safeNumber(dbStatus.data, "total_records"))));
      if (dbStatus.data.migrations) {
        kv("Migrations Applied", formatNumber(safeNumber(dbStatus.data, "migrations.applied")));
        kv("Migrations Pending", formatNumber(safeNumber(dbStatus.data, "migrations.pending")));
      }
    } else {
      state.recordTest("Database status", "warn", dbStatus.error || `HTTP ${dbStatus.statusCode}`, phase);
    }

    const redisState = await HttpClient.fetch(`${CONFIG.BASE_URL}/api/debug/redis-state`, { label: "Redis State" });
    if (redisState.success && redisState.data) {
      state.recordTest("Redis state", "pass", `HTTP ${redisState.statusCode}`, phase);
      subsection("Redis State Details");
      kv("Total Keys", formatNumber(safeNumber(redisState.data, "totalKeys", safeNumber(redisState.data, "keyCount"))));
      if (redisState.data.keyPatterns) {
        for (const [pattern, count] of Object.entries(redisState.data.keyPatterns)) {
          kv(`Keys: ${pattern}`, formatNumber(count));
        }
      }
      if (redisState.data.memory) {
        kv("Memory Usage", redisState.data.memory);
      }
      if (redisState.data.connected !== undefined) {
        kv("Connected", redisState.data.connected);
      }
    } else {
      state.recordTest("Redis state", "warn", redisState.error || `HTTP ${redisState.statusCode}`, phase);
    }

    const redisHealth = await HttpClient.fetch(`${CONFIG.BASE_URL}/api/system/health`, { label: "Redis Health" });
    if (redisHealth.success && redisHealth.data) {
      state.recordTest("Redis health", "pass", `HTTP ${redisHealth.statusCode}`, phase);
      subsection("Redis Health");
      kv("Redis Status", safeGet(redisHealth.data, "checks.redis"));
      kv("Uptime", formatDuration(safeNumber(redisHealth.data, "uptime", 0) * 1000));
    } else {
      state.recordTest("Redis health", "fail", redisHealth.error || `HTTP ${redisHealth.statusCode}`, phase);
    }

    state.markPhaseComplete(phase);
  } catch (err) {
    state.markPhaseComplete(phase, err.message);
    state.recordTest("Database loads phase", "fail", err.message, phase);
    throw err;
  }
}

// ============================================================
// Phase 4: Connections & Active Status
// ============================================================

async function testConnections() {
  const phase = "connections";
  state.markPhaseStart(phase);

  try {
    section("PHASE 4: Connections & Active Status");

    const connStatus = await HttpClient.fetch(`${CONFIG.BASE_URL}/api/connections/status`, { label: "Connections Status" });
    if (connStatus.success && connStatus.data) {
      state.recordTest("Connections status", "pass", `HTTP ${connStatus.statusCode}`, phase);
      subsection("Connection Overview");
      kv("Total", formatNumber(safeNumber(connStatus.data, "total", safeNumber(connStatus.data, "totalConnections"))));
      kv("Active", formatNumber(safeNumber(connStatus.data, "active", safeNumber(connStatus.data, "activeConnections"))));
      kv("Enabled", formatNumber(safeNumber(connStatus.data, "enabled", safeNumber(connStatus.data, "enabledConnections"))));
      kv("Assigned", formatNumber(safeNumber(connStatus.data, "assigned", safeNumber(connStatus.data, "assignedConnections"))));

      if (connStatus.data.connections && Array.isArray(connStatus.data.connections)) {
        for (const conn of connStatus.data.connections) {
          subsection(`Connection: ${safeGet(conn, "name", safeGet(conn, "id", "unknown"))}`);
          kv("ID", safeGet(conn, "id"));
          kv("Exchange", safeGet(conn, "exchange"));
          kv("API Type", safeGet(conn, "api_type"));
          kv("Testnet", safeGet(conn, "is_testnet") === "1" || safeGet(conn, "is_testnet") === true ? "Yes" : "No");
          kv("Active Assigned", safeGet(conn, "is_active_assigned") === "1" ? "Yes" : "No");
          kv("Enabled", safeGet(conn, "is_enabled") === "1" ? "Yes" : "No");
          kv("Status", safeGet(conn, "status"));
        }
      }
    } else {
      state.recordTest("Connections status", "warn", connStatus.error || `HTTP ${connStatus.statusCode}`, phase);
    }

    const activeConns = await HttpClient.fetch(`${CONFIG.BASE_URL}/api/settings/connections/active`, { label: "Active Connections" });
    if (activeConns.success && activeConns.data) {
      state.recordTest("Active connections list", "pass", `HTTP ${activeConns.statusCode}`, phase);
      subsection("Active Connections List");
      const conns = Array.isArray(activeConns.data) ? activeConns.data : (activeConns.data.connections || []);
      kv("Count", formatNumber(conns.length));
      for (const conn of conns.slice(0, 10)) {
        kv(safeGet(conn, "name", safeGet(conn, "id", "unknown")), `${safeGet(conn, "exchange")} | ${safeGet(conn, "monitored_symbol")}`);
      }
    } else {
      state.recordTest("Active connections list", "warn", activeConns.error || `HTTP ${activeConns.statusCode}`, phase);
    }

    state.markPhaseComplete(phase);
  } catch (err) {
    state.markPhaseComplete(phase, err.message);
    state.recordTest("Connections phase", "fail", err.message, phase);
    throw err;
  }
}

// ============================================================
// Phase 5: Engine Verification
// ============================================================

async function testEngineVerification() {
  const phase = "engine_verification";
  state.markPhaseStart(phase);

  try {
    section("PHASE 5: Engine Comprehensive Verification");

    const verify = await HttpClient.fetch(`${CONFIG.BASE_URL}/api/system/verify-engine`, { label: "Engine Verify", timeout: 30000 });
    if (!verify.success || !verify.data) {
      state.recordTest("Engine verification", "fail", verify.error || `HTTP ${verify.statusCode}`, phase);
      state.markPhaseComplete(phase, verify.error);
      return null;
    }

    state.recordTest("Engine verification", "pass", `HTTP ${verify.statusCode}`, phase);
    const data = verify.data;

    subsection("Coordinator Status");
    kv("Coordinator Running", safeGet(data, "coordinatorRunning"));
    kv("Active Connections", safeNumber(data, "activeConnectionCount"));

    if (data.components && Array.isArray(data.components) && data.components.length > 0) {
      state.verifyData = data;

      for (const comp of data.components) {
        subsection(`Component: ${safeGet(comp, "connectionName")} (${safeGet(comp, "exchange")})`);
        kv("Engine Running", safeGet(comp, "engineRunning"));
        kv("Testnet", safeGet(comp, "isTestnet") ? "Yes" : "No");

        const phases = comp.phases || {};

        subsection("  Phase: Prehistoric Data");
        kv("Completed", safeGet(phases, "prehistoric.completed"));
        kv("Start Date", safeGet(phases, "prehistoric.startDate"));
        kv("End Date", safeGet(phases, "prehistoric.endDate"));
        kv("Progression Cycles", formatNumber(safeNumber(phases, "prehistoric.progressionCycles")));
        state.recordTest(
          `Prehistoric (${safeGet(comp, "connectionName")})`,
          safeGet(phases, "prehistoric.completed") ? "pass" : "warn",
          safeGet(phases, "prehistoric.completed") ? "Complete" : "Pending",
          phase
        );

        subsection("  Phase: Indications");
        kv("Processing", safeGet(phases, "indications.processing"));
        kv("Cycle Count", formatNumber(safeNumber(phases, "indications.cycleCount")));
        kv("Avg Duration", `${safeNumber(phases, "indications.avgDurationMs")}ms`);
        kv("Success Rate", formatPercent(safeNumber(phases, "indications.successRate")));
        kv("Last Run", safeGet(phases, "indications.lastRun", "Never"));
        kv("Recent Records", formatNumber(safeNumber(phases, "indications.recentRecords")));
        state.recordTest(
          `Indications (${safeGet(comp, "connectionName")})`,
          safeNumber(phases, "indications.cycleCount") > 0 ? "pass" : "warn",
          `${safeNumber(phases, "indications.cycleCount")} cycles`,
          phase
        );

        subsection("  Phase: Strategies");
        kv("Processing", safeGet(phases, "strategies.processing"));
        kv("Cycle Count", formatNumber(safeNumber(phases, "strategies.cycleCount")));
        kv("Avg Duration", `${safeNumber(phases, "strategies.avgDurationMs")}ms`);
        kv("Total Evaluated", formatNumber(safeNumber(phases, "strategies.totalEvaluated")));
        kv("Last Run", safeGet(phases, "strategies.lastRun", "Never"));
        kv("Recent Records", formatNumber(safeNumber(phases, "strategies.recentRecords")));
        state.recordTest(
          `Strategies (${safeGet(comp, "connectionName")})`,
          safeNumber(phases, "strategies.totalEvaluated") > 0 ? "pass" : "warn",
          `${safeNumber(phases, "strategies.totalEvaluated")} evaluated`,
          phase
        );

        subsection("  Phase: Realtime");
        kv("Processing", safeGet(phases, "realtime.processing"));
        kv("Cycle Count", formatNumber(safeNumber(phases, "realtime.cycleCount")));
        kv("Avg Duration", `${safeNumber(phases, "realtime.avgDurationMs")}ms`);
        kv("Last Run", safeGet(phases, "realtime.lastRun", "Never"));
        state.recordTest(
          `Realtime (${safeGet(comp, "connectionName")})`,
          safeGet(phases, "realtime.processing") ? "pass" : "warn",
          "",
          phase
        );

        subsection("  Phase: Live Trading");
        kv("Active", safeGet(phases, "liveTrading.active"));
        kv("Total Trades", formatNumber(safeNumber(phases, "liveTrading.tradesTotal")));
        kv("Pseudo Positions", formatNumber(safeNumber(phases, "liveTrading.pseudoPositions")));
        kv("Status", safeGet(phases, "liveTrading.status"));
        state.recordTest(
          `Live Trading (${safeGet(comp, "connectionName")})`,
          safeGet(phases, "liveTrading.active") ? "pass" : "warn",
          "",
          phase
        );

        subsection("  Overall Metrics");
        const metrics = comp.metrics || {};
        kv("Success Rate", formatPercent(safeNumber(metrics, "successRate")));
        kv("Total Cycles", formatNumber(safeNumber(metrics, "totalCycles")));
        kv("Successful Cycles", formatNumber(safeNumber(metrics, "successfulCycles")));
        kv("Failed Cycles", formatNumber(safeNumber(metrics, "failedCycles")));
      }
    }

    if (data.verification) {
      subsection("Verification Summary");
      kv("All Phases Passing", safeGet(data, "verification.allPhasesPassing"));
      if (data.verification.issues?.length > 0) {
        for (const issue of data.verification.issues) {
          fail("Issue", issue);
        }
      }
      if (data.verification.warnings?.length > 0) {
        for (const w of data.verification.warnings) {
          warn("Warning", w);
        }
      }
    }

    state.markPhaseComplete(phase);
    return data;
  } catch (err) {
    state.markPhaseComplete(phase, err.message);
    state.recordTest("Engine verification phase", "fail", err.message, phase);
    throw err;
  }
}

// ============================================================
// Phase 6: Progression Tracking
// ============================================================

async function testProgressionTracking(verifyData) {
  const phase = "progression_tracking";
  state.markPhaseStart(phase);

  try {
    section("PHASE 6: Progression Tracking & State Management");

    if (!verifyData || !verifyData.components || verifyData.components.length === 0) {
      warn("No active components to test progression for");
      state.recordTest("Progression tracking", "warn", "No active connections", phase);
      state.markPhaseComplete(phase);
      return;
    }

    for (const comp of verifyData.components) {
      const connId = comp.connectionId;
      subsection(`Progression: ${safeGet(comp, "connectionName")} (${connId})`);

      const prog = await HttpClient.fetch(
        `${CONFIG.BASE_URL}/api/connections/progression/${connId}`,
        { label: `Progression (${safeGet(comp, "connectionName")})` }
      );

      if (prog.success && prog.data && prog.data.success) {
        state.recordTest(`Progression (${safeGet(comp, "connectionName")})`, "pass", `HTTP ${prog.statusCode}`, phase);

        subsection("  Connection Info");
        kv("Exchange", safeGet(prog.data, "connection.exchange"));
        kv("Is Active", safeGet(prog.data, "connection.isActive"));
        kv("Is Enabled", safeGet(prog.data, "connection.isEnabled"));
        kv("Is Inserted", safeGet(prog.data, "connection.isInserted"));

        subsection("  Progression State");
        kv("Phase", safeGet(prog.data, "progression.phase"));
        kv("Progress", `${safeNumber(prog.data, "progression.progress")}%`);
        kv("Message", safeGet(prog.data, "progression.message"));
        kv("Sub Phase", safeGet(prog.data, "progression.subPhase", "None"));
        kv("Sub Progress", `${safeNumber(prog.data, "progression.subProgress.current")}/${safeNumber(prog.data, "progression.subProgress.total")}`);
        kv("Started At", safeGet(prog.data, "progression.startedAt", "N/A"));
        kv("Updated At", safeGet(prog.data, "progression.updatedAt", "N/A"));

        subsection("  Phase Details");
        const details = prog.data.progression?.details || {};
        kv("Historical Data Loaded", safeGet(details, "historicalDataLoaded"));
        kv("Indications Calculated", safeGet(details, "indicationsCalculated"));
        kv("Strategies Processed", safeGet(details, "strategiesProcessed"));
        kv("Live Processing Active", safeGet(details, "liveProcessingActive"));
        kv("Live Trading Active", safeGet(details, "liveTradingActive"));

        subsection("  State Metrics");
        const stateData = prog.data.state || {};
        kv("Cycles Completed", formatNumber(safeNumber(stateData, "cyclesCompleted")));
        kv("Successful Cycles", formatNumber(safeNumber(stateData, "successfulCycles")));
        kv("Failed Cycles", formatNumber(safeNumber(stateData, "failedCycles")));
        kv("Cycle Success Rate", formatPercent(safeNumber(stateData, "cycleSuccessRate")));
        kv("Total Trades", formatNumber(safeNumber(stateData, "totalTrades")));
        kv("Successful Trades", formatNumber(safeNumber(stateData, "successfulTrades")));
        kv("Total Profit", safeGet(stateData, "totalProfit"));
        kv("Trade Success Rate", formatPercent(safeNumber(stateData, "tradeSuccessRate")));
        kv("Last Cycle Time", safeGet(stateData, "lastCycleTime", "N/A"));
        kv("Prehistoric Cycles", formatNumber(safeNumber(stateData, "prehistoricCyclesCompleted")));
        kv("Prehistoric Phase Active", safeGet(stateData, "prehistoricPhaseActive"));

        subsection("  Processing Metrics");
        const metrics = prog.data.metrics || {};
        kv("Indications Count", formatNumber(safeNumber(metrics, "indicationsCount")));
        kv("Strategies Count", formatNumber(safeNumber(metrics, "strategiesCount")));
        kv("Engine Running", safeGet(metrics, "engineRunning"));
        kv("Has Recent Activity", safeGet(metrics, "hasRecentActivity"));
        kv("Global Engine Status", safeGet(metrics, "globalEngineStatus"));
        kv("Engine State Status", safeGet(metrics, "engineStateStatus"));
        kv("Indication Cycle Count", formatNumber(safeNumber(metrics, "indicationCycleCount")));
        kv("Strategy Cycle Count", formatNumber(safeNumber(metrics, "strategyCycleCount")));
        kv("Last Indication Run", safeGet(metrics, "lastIndicationRun", "Never"));
        kv("Last Strategy Run", safeGet(metrics, "lastStrategyRun", "Never"));

        subsection("  Recent Logs (last 10)");
        if (prog.data.recentLogs && prog.data.recentLogs.length > 0) {
          for (const log of prog.data.recentLogs.slice(0, 10)) {
            const time = new Date(log.timestamp).toLocaleTimeString();
            kv(`${time} [${safeGet(log, "level")}]`, `[${safeGet(log, "phase")}] ${safeGet(log, "message")}`);
          }
        } else {
          info("No recent logs available");
        }
      } else {
        state.recordTest(`Progression (${safeGet(comp, "connectionName")})`, "fail", prog.error || "No data", phase);
      }
    }

    state.markPhaseComplete(phase);
  } catch (err) {
    state.markPhaseComplete(phase, err.message);
    state.recordTest("Progression tracking phase", "fail", err.message, phase);
    throw err;
  }
}

// ============================================================
// Phase 7: Indications with Results
// ============================================================

async function testIndicationsWithResults(verifyData) {
  const phase = "indications_results";
  state.markPhaseStart(phase);

  try {
    section("PHASE 7: Indications with Results");

    if (!verifyData || !verifyData.components || verifyData.components.length === 0) {
      warn("No active components for indication testing");
      state.recordTest("Indications results", "warn", "No active connections", phase);
      state.markPhaseComplete(phase);
      return;
    }

    for (const comp of verifyData.components) {
      subsection(`Indications: ${safeGet(comp, "connectionName")}`);

      const indStats = await HttpClient.fetch(
        `${CONFIG.BASE_URL}/api/dashboard/indications-stats`,
        { label: `Indication Stats (${safeGet(comp, "connectionName")})` }
      );

      if (indStats.success && indStats.data) {
        state.recordTest(`Indication stats (${safeGet(comp, "connectionName")})`, "pass", `HTTP ${indStats.statusCode}`, phase);
        subsection("  Indication Statistics");

        if (indStats.data.indications && Array.isArray(indStats.data.indications)) {
          kv("Total Types", formatNumber(indStats.data.indications.length));
          for (const ind of indStats.data.indications) {
            subsection(`  Type: ${safeGet(ind, "type", safeGet(ind, "indicationType", "unknown"))}`);
            kv("Count", formatNumber(safeNumber(ind, "count", safeNumber(ind, "total"))));
            kv("Avg Value", safeGet(ind, "avgValue", safeGet(ind, "avg_value", safeGet(ind, "value"))));
            kv("Avg Confidence", safeGet(ind, "avgConfidence", safeGet(ind, "avg_confidence", safeGet(ind, "confidence"))));
            kv("Last Updated", safeGet(ind, "lastUpdated", safeGet(ind, "last_updated")));
          }
        }

        kv("Total Indications", formatNumber(safeNumber(indStats.data, "total")));
        kv("Recent (1h)", formatNumber(safeNumber(indStats.data, "recent")));
      } else {
        state.recordTest(`Indication stats (${safeGet(comp, "connectionName")})`, "warn", indStats.error || `HTTP ${indStats.statusCode}`, phase);
      }

      const indMain = await HttpClient.fetch(`${CONFIG.BASE_URL}/api/settings/indications/main`, { label: "Main Indications" });
      if (indMain.success && indMain.data) {
        state.recordTest("Main indications config", "pass", `HTTP ${indMain.statusCode}`, phase);
        subsection("  Main Indications Config");
        if (Array.isArray(indMain.data)) {
          kv("Active Main Indications", formatNumber(indMain.data.length));
          for (const ind of indMain.data.slice(0, 10)) {
            kv(safeGet(ind, "name", safeGet(ind, "type", "unknown")), `enabled=${safeGet(ind, "enabled", safeGet(ind, "active"))}`);
          }
        } else if (indMain.data.indications) {
          kv("Count", formatNumber(indMain.data.indications.length || 0));
        }
      } else {
        state.recordTest("Main indications config", "warn", indMain.error || `HTTP ${indMain.statusCode}`, phase);
      }

      const indCommon = await HttpClient.fetch(`${CONFIG.BASE_URL}/api/settings/indications/common`, { label: "Common Indications" });
      if (indCommon.success && indCommon.data) {
        state.recordTest("Common indications config", "pass", `HTTP ${indCommon.statusCode}`, phase);
        subsection("  Common Indications Config");
        if (Array.isArray(indCommon.data)) {
          kv("Active Common Indications", formatNumber(indCommon.data.length));
          for (const ind of indCommon.data.slice(0, 10)) {
            kv(safeGet(ind, "name", safeGet(ind, "type", "unknown")), `enabled=${safeGet(ind, "enabled", safeGet(ind, "active"))}`);
          }
        }
      } else {
        state.recordTest("Common indications config", "warn", indCommon.error || `HTTP ${indCommon.statusCode}`, phase);
      }
    }

    state.markPhaseComplete(phase);
  } catch (err) {
    state.markPhaseComplete(phase, err.message);
    state.recordTest("Indications results phase", "fail", err.message, phase);
    throw err;
  }
}

// ============================================================
// Phase 8: Strategies with Results
// ============================================================

async function testStrategiesWithResults(verifyData) {
  const phase = "strategies_results";
  state.markPhaseStart(phase);

  try {
    section("PHASE 8: Strategies with Results");

    if (!verifyData || !verifyData.components || verifyData.components.length === 0) {
      warn("No active components for strategy testing");
      state.recordTest("Strategies results", "warn", "No active connections", phase);
      state.markPhaseComplete(phase);
      return;
    }

    for (const comp of verifyData.components) {
      subsection(`Strategies: ${safeGet(comp, "connectionName")}`);

      const stratEval = await HttpClient.fetch(
        `${CONFIG.BASE_URL}/api/dashboard/strategies-evaluation`,
        { label: `Strategy Evaluation (${safeGet(comp, "connectionName")})` }
      );

      if (stratEval.success && stratEval.data) {
        state.recordTest(`Strategy evaluation (${safeGet(comp, "connectionName")})`, "pass", `HTTP ${stratEval.statusCode}`, phase);
        subsection("  Strategy Evaluation Results");

        if (stratEval.data.strategies && Array.isArray(stratEval.data.strategies)) {
          kv("Total Strategies", formatNumber(stratEval.data.strategies.length));
          for (const strat of stratEval.data.strategies) {
            subsection(`  Strategy: ${safeGet(strat, "name", safeGet(strat, "type", safeGet(strat, "id", "unknown")))}`);
            kv("Type", safeGet(strat, "type", safeGet(strat, "strategyType")));
            kv("Status", safeGet(strat, "status"));
            kv("Win Rate", safeGet(strat, "winRate", safeGet(strat, "win_rate")));
            kv("Profit Factor", safeGet(strat, "profitFactor", safeGet(strat, "profit_factor")));
            kv("Total Trades", formatNumber(safeNumber(strat, "totalTrades", safeNumber(strat, "total_trades"))));
            kv("Winning Trades", formatNumber(safeNumber(strat, "winningTrades", safeNumber(strat, "winning_trades"))));
            kv("Losing Trades", formatNumber(safeNumber(strat, "losingTrades", safeNumber(strat, "losing_trades"))));
            kv("Avg Profit", safeGet(strat, "avgProfit", safeGet(strat, "avg_profit")));
            kv("Avg Loss", safeGet(strat, "avgLoss", safeGet(strat, "avg_loss")));
            kv("Max Drawdown", safeGet(strat, "maxDrawdown", safeGet(strat, "max_drawdown")));
            kv("Sharpe Ratio", safeGet(strat, "sharpeRatio", safeGet(strat, "sharpe_ratio")));
          }
        }

        if (stratEval.data.summary) {
          subsection("  Strategy Summary");
          kv("Overall Win Rate", safeGet(stratEval.data, "summary.overallWinRate", safeGet(stratEval.data, "summary.overall_win_rate")));
          kv("Total P&L", safeGet(stratEval.data, "summary.totalPnL", safeGet(stratEval.data, "summary.total_pnl")));
          kv("Total Strategies", formatNumber(safeNumber(stratEval.data, "summary.totalStrategies", safeNumber(stratEval.data, "summary.total_strategies"))));
          kv("Active Strategies", formatNumber(safeNumber(stratEval.data, "summary.activeStrategies", safeNumber(stratEval.data, "summary.active_strategies"))));
        }
      } else {
        state.recordTest(`Strategy evaluation (${safeGet(comp, "connectionName")})`, "warn", stratEval.error || `HTTP ${stratEval.statusCode}`, phase);
      }

      const presets = await HttpClient.fetch(`${CONFIG.BASE_URL}/api/presets`, { label: "Presets" });
      if (presets.success && presets.data) {
        state.recordTest("Presets list", "pass", `HTTP ${presets.statusCode}`, phase);
        subsection("  Presets Overview");
        const presetData = Array.isArray(presets.data) ? presets.data : (presets.data.presets || []);
        kv("Total Presets", formatNumber(presetData.length));
        for (const preset of presetData.slice(0, 5)) {
          kv(safeGet(preset, "name", safeGet(preset, "id", "unknown")), `type=${safeGet(preset, "type")} | active=${safeGet(preset, "active", safeGet(preset, "isActive"))}`);
        }
      } else {
        state.recordTest("Presets list", "warn", presets.error || `HTTP ${presets.statusCode}`, phase);
      }
    }

    state.markPhaseComplete(phase);
  } catch (err) {
    state.markPhaseComplete(phase, err.message);
    state.recordTest("Strategies results phase", "fail", err.message, phase);
    throw err;
  }
}

// ============================================================
// Phase 9: Data Processing Counts & Ratios
// ============================================================

async function testDataProcessingCounts(verifyData) {
  const phase = "data_processing_counts";
  state.markPhaseStart(phase);

  try {
    section("PHASE 9: Data Processing Counts & Ratios");

    if (!verifyData || !verifyData.components || verifyData.components.length === 0) {
      warn("No active components for data processing analysis");
      state.recordTest("Data processing counts", "warn", "No active connections", phase);
      state.markPhaseComplete(phase);
      return;
    }

    for (const comp of verifyData.components) {
      subsection(`Data Processing: ${safeGet(comp, "connectionName")}`);

      const phases = comp.phases || {};
      const metrics = comp.metrics || {};

      subsection("  Processing Counts");
      kv("Prehistoric Cycles", formatNumber(safeNumber(phases, "prehistoric.progressionCycles")));
      kv("Indication Cycles", formatNumber(safeNumber(phases, "indications.cycleCount")));
      kv("Strategy Evaluations", formatNumber(safeNumber(phases, "strategies.totalEvaluated")));
      kv("Realtime Cycles", formatNumber(safeNumber(phases, "realtime.cycleCount")));
      kv("Total Trades", formatNumber(safeNumber(phases, "liveTrading.tradesTotal")));
      kv("Active Positions", formatNumber(safeNumber(phases, "liveTrading.pseudoPositions")));
      kv("Recent Indications", formatNumber(safeNumber(phases, "indications.recentRecords")));
      kv("Recent Strategies", formatNumber(safeNumber(phases, "strategies.recentRecords")));

      subsection("  Processing Ratios");
      const indCycles = safeNumber(phases, "indications.cycleCount");
      const stratCycles = safeNumber(phases, "strategies.cycleCount");
      const totalCycles = safeNumber(metrics, "totalCycles");
      const failedCycles = safeNumber(metrics, "failedCycles");

      kv("Indication/Strategy Ratio", indCycles > 0 ? (stratCycles / indCycles).toFixed(2) : "N/A");
      kv("Success Rate", formatPercent(safeNumber(metrics, "successRate")));
      kv("Failed/Total Ratio", totalCycles > 0 ? (failedCycles / totalCycles).toFixed(4) : "N/A");
      kv("Avg Indication Duration", `${safeNumber(phases, "indications.avgDurationMs")}ms`);
      kv("Avg Strategy Duration", `${safeNumber(phases, "strategies.avgDurationMs")}ms`);

      subsection("  Prehistoric Data Analysis");
      const prehistoric = phases.prehistoric || {};
      kv("Data Loaded", safeGet(prehistoric, "completed"));
      kv("Data Range Start", safeGet(prehistoric, "startDate", "N/A"));
      kv("Data Range End", safeGet(prehistoric, "endDate", "N/A"));
      if (prehistoric.startDate && prehistoric.endDate) {
        const start = new Date(prehistoric.startDate);
        const end = new Date(prehistoric.endDate);
        const range = end - start;
        kv("Data Span", formatDuration(range));
      }

      subsection("  Performance Indicators");
      kv("Engine Running", safeGet(comp, "engineRunning"));
      kv("All Phases Active", safeGet(phases, "indications.processing") && safeGet(phases, "strategies.processing") && safeGet(phases, "realtime.processing"));
      kv("Live Trading Active", safeGet(phases, "liveTrading.active"));
      kv("Live Trading Status", safeGet(phases, "liveTrading.status"));
    }

    state.markPhaseComplete(phase);
  } catch (err) {
    state.markPhaseComplete(phase, err.message);
    state.recordTest("Data processing counts phase", "fail", err.message, phase);
    throw err;
  }
}

// ============================================================
// Phase 10: Processed Data Overall Info
// ============================================================

async function testProcessedDataOverall(verifyData) {
  const phase = "processed_data_overall";
  state.markPhaseStart(phase);

  try {
    section("PHASE 10: Overall Processed Data Information");

    if (!verifyData || !verifyData.components || verifyData.components.length === 0) {
      warn("No active components for overall data analysis");
      state.recordTest("Overall processed data", "warn", "No active connections", phase);
      state.markPhaseComplete(phase);
      return;
    }

    let totalIndications = 0;
    let totalStrategies = 0;
    let totalTrades = 0;
    let totalPositions = 0;
    let totalCycles = 0;
    let allEnginesRunning = true;

    for (const comp of verifyData.components) {
      const phases = comp.phases || {};
      const metrics = comp.metrics || {};

      totalIndications += safeNumber(phases, "indications.recentRecords");
      totalStrategies += safeNumber(phases, "strategies.recentRecords");
      totalTrades += safeNumber(phases, "liveTrading.tradesTotal");
      totalPositions += safeNumber(phases, "liveTrading.pseudoPositions");
      totalCycles += safeNumber(metrics, "totalCycles");

      if (!safeGet(comp, "engineRunning")) allEnginesRunning = false;

      subsection(`Overall: ${safeGet(comp, "connectionName")}`);
      kv("Exchange", safeGet(comp, "exchange"));
      kv("Engine Status", safeGet(comp, "engineRunning") ? "Running" : "Stopped");
      kv("Current Phase", safeGet(phases, "liveTrading.status"));
      kv("Total Data Points", formatNumber(totalIndications + totalStrategies + totalTrades));
      kv("Processing Health", formatPercent(safeNumber(metrics, "successRate")));
    }

    subsection("Aggregate Totals");
    kv("Total Connections", verifyData.components.length);
    kv("All Engines Running", allEnginesRunning);
    kv("Total Indications (recent)", formatNumber(totalIndications));
    kv("Total Strategies (recent)", formatNumber(totalStrategies));
    kv("Total Trades", formatNumber(totalTrades));
    kv("Total Positions", formatNumber(totalPositions));
    kv("Total Processing Cycles", formatNumber(totalCycles));
    kv("Total Data Points Processed", formatNumber(totalIndications + totalStrategies + totalTrades));

    state.recordTest("Overall processed data", allEnginesRunning ? "pass" : "warn", "", phase);
    state.markPhaseComplete(phase);
  } catch (err) {
    state.markPhaseComplete(phase, err.message);
    state.recordTest("Processed data overall phase", "fail", err.message, phase);
    throw err;
  }
}

// ============================================================
// Phase 11: Realtime Progress Monitoring (1 minute)
// ============================================================

async function testRealtimeProgress(verifyData) {
  const phase = "realtime_progress";
  state.markPhaseStart(phase);

  try {
    section("PHASE 11: Realtime Progress Monitoring (60 seconds)");

    if (!verifyData || !verifyData.components || verifyData.components.length === 0) {
      warn("No active components for realtime monitoring");
      state.recordTest("Realtime progress", "warn", "No active connections", phase);
      state.markPhaseComplete(phase);
      return;
    }

    state.realtimeSnapshots = [];
    const intervalMs = CONFIG.REALTIME_SNAPSHOT_INTERVAL_MS;
    const totalDuration = CONFIG.REALTIME_MONITOR_DURATION_MS;
    const numSnapshots = totalDuration / intervalMs;

    info(`Starting ${totalDuration / 1000}-second realtime monitoring (snapshot every ${intervalMs / 1000}s)`);

    for (let i = 0; i <= numSnapshots; i++) {
      const elapsed = i * intervalMs;
      const remaining = totalDuration - elapsed;

      if (i > 0) {
        console.log(`\n  ⏳ Waiting ${intervalMs / 1000}s... (${remaining / 1000}s remaining)`);
        await sleep(intervalMs);
      }

      subsection(`Snapshot ${i}/${numSnapshots} (T+${elapsed / 1000}s)`);

      for (const comp of verifyData.components) {
        const connId = comp.connectionId;

        const prog = await HttpClient.fetch(
          `${CONFIG.BASE_URL}/api/connections/progression/${connId}`,
          { label: `Progression @T+${elapsed / 1000}s`, retries: 1 }
        );

        if (prog.success && prog.data && prog.data.success) {
          const snapshot = {
            time: elapsed,
            connectionName: safeGet(comp, "connectionName"),
            connectionId: connId,
            phase: safeGet(prog.data, "progression.phase"),
            progress: safeNumber(prog.data, "progression.progress"),
            cycles: safeNumber(prog.data, "state.cyclesCompleted"),
            indications: safeNumber(prog.data, "metrics.indicationsCount"),
            strategies: safeNumber(prog.data, "metrics.strategiesCount"),
            lastIndicationRun: safeGet(prog.data, "metrics.lastIndicationRun"),
            lastStrategyRun: safeGet(prog.data, "metrics.lastStrategyRun"),
            timestamp: new Date().toISOString(),
          };

          state.realtimeSnapshots.push(snapshot);

          kv(`${safeGet(comp, "connectionName")} Phase`, snapshot.phase);
          kv(`${safeGet(comp, "connectionName")} Progress`, `${snapshot.progress}%`);
          kv(`${safeGet(comp, "connectionName")} Cycles`, formatNumber(snapshot.cycles));
          kv(`${safeGet(comp, "connectionName")} Indications`, formatNumber(snapshot.indications));
          kv(`${safeGet(comp, "connectionName")} Strategies`, formatNumber(snapshot.strategies));
          kv(`${safeGet(comp, "connectionName")} Last Indication`, snapshot.lastIndicationRun ? new Date(snapshot.lastIndicationRun).toLocaleTimeString() : "Never");
          kv(`${safeGet(comp, "connectionName")} Last Strategy`, snapshot.lastStrategyRun ? new Date(snapshot.lastStrategyRun).toLocaleTimeString() : "Never");
        } else {
          warn(`Snapshot ${i} failed for ${safeGet(comp, "connectionName")}`, prog.error || `HTTP ${prog.statusCode}`);
        }
      }

      state.save();
    }

    subsection("Realtime Progress Summary");
    if (state.realtimeSnapshots.length >= 2) {
      const uniqueConnections = [...new Set(state.realtimeSnapshots.map((s) => s.connectionName))];

      for (const connName of uniqueConnections) {
        const connSnapshots = state.realtimeSnapshots.filter((s) => s.connectionName === connName);
        if (connSnapshots.length >= 2) {
          const first = connSnapshots[0];
          const last = connSnapshots[connSnapshots.length - 1];

          subsection(`  ${connName} - 60s Delta`);
          kv("Phase Change", `${first.phase} → ${last.phase}`);
          kv("Progress Change", `${first.progress}% → ${last.progress}%`);
          kv("Cycles Delta", formatNumber(last.cycles - first.cycles));
          kv("Indications Delta", formatNumber(last.indications - first.indications));
          kv("Strategies Delta", formatNumber(last.strategies - first.strategies));
          kv("Cycles/sec", ((last.cycles - first.cycles) / 60).toFixed(2));
          kv("Indications/sec", ((last.indications - first.indications) / 60).toFixed(2));
          kv("Strategies/sec", ((last.strategies - first.strategies) / 60).toFixed(2));

          state.recordTest(
            `Realtime progress (${connName})`,
            last.cycles > first.cycles ? "pass" : "warn",
            `+${last.cycles - first.cycles} cycles in 60s`,
            phase
          );
        }
      }
    } else {
      warn("Insufficient snapshots for delta calculation");
      state.recordTest("Realtime progress delta", "warn", "Not enough snapshots", phase);
    }

    state.markPhaseComplete(phase);
  } catch (err) {
    state.markPhaseComplete(phase, err.message);
    state.recordTest("Realtime progress phase", "fail", err.message, phase);
    throw err;
  }
}

// ============================================================
// Phase 12: API Functionality Tests
// ============================================================

async function testApiFunctionality() {
  const phase = "api_functionality";
  state.markPhaseStart(phase);

  try {
    section("PHASE 12: API Functionality Tests");

    const endpoints = [
      { name: "Settings", path: "/api/settings" },
      { name: "Positions", path: "/api/positions" },
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
    ];

    for (const ep of endpoints) {
      const data = await HttpClient.fetch(`${CONFIG.BASE_URL}${ep.path}`, { label: ep.name, retries: 1 });
      if (data.success) {
        state.recordTest(`API: ${ep.name}`, "pass", `HTTP ${data.statusCode}`, phase);
      } else {
        state.recordTest(`API: ${ep.name}`, "warn", data.error || `HTTP ${data.statusCode}`, phase);
      }
    }

    state.markPhaseComplete(phase);
  } catch (err) {
    state.markPhaseComplete(phase, err.message);
    state.recordTest("API functionality phase", "fail", err.message, phase);
    throw err;
  }
}

// ============================================================
// Phase 13: Settings & Risk Engine
// ============================================================

async function testSettingsAndRisk() {
  const phase = "settings_risk";
  state.markPhaseStart(phase);

  try {
    section("PHASE 13: Settings & Risk Engine Configuration");

    const riskEngines = await HttpClient.fetch(`${CONFIG.BASE_URL}/api/settings/risk-and-engines`, { label: "Risk & Engines" });
    if (riskEngines.success && riskEngines.data) {
      state.recordTest("Risk & engines config", "pass", `HTTP ${riskEngines.statusCode}`, phase);
      subsection("Risk & Engine Settings");
      if (typeof riskEngines.data === "object") {
        for (const [key, val] of Object.entries(riskEngines.data)) {
          if (typeof val !== "object" || val === null) {
            kv(key, String(val));
          }
        }
      }
    } else {
      state.recordTest("Risk & engines config", "warn", riskEngines.error || `HTTP ${riskEngines.statusCode}`, phase);
    }

    const systemSettings = await HttpClient.fetch(`${CONFIG.BASE_URL}/api/settings/system`, { label: "System Settings" });
    if (systemSettings.success && systemSettings.data) {
      state.recordTest("System settings", "pass", `HTTP ${systemSettings.statusCode}`, phase);
      subsection("System Settings");
      if (typeof systemSettings.data === "object") {
        for (const [key, val] of Object.entries(systemSettings.data)) {
          if (typeof val !== "object" || val === null) {
            kv(key, String(val));
          }
        }
      }
    } else {
      state.recordTest("System settings", "warn", systemSettings.error || `HTTP ${systemSettings.statusCode}`, phase);
    }

    const limits = await HttpClient.fetch(`${CONFIG.BASE_URL}/api/settings/set-limits`, { label: "Settings Limits" });
    if (limits.success) {
      state.recordTest("Settings limits", "pass", `HTTP ${limits.statusCode}`, phase);
    } else {
      state.recordTest("Settings limits", "warn", limits.error || `HTTP ${limits.statusCode}`, phase);
    }

    state.markPhaseComplete(phase);
  } catch (err) {
    state.markPhaseComplete(phase, err.message);
    state.recordTest("Settings & risk phase", "fail", err.message, phase);
    throw err;
  }
}

// ============================================================
// Final Summary
// ============================================================

function printFinalSummary() {
  section("FINAL TEST SUMMARY");

  const passRate = state.results.total > 0 ? ((state.results.passed / state.results.total) * 100).toFixed(1) : 0;
  const failRate = state.results.total > 0 ? ((state.results.failed / state.results.total) * 100).toFixed(1) : 0;
  const warnRate = state.results.total > 0 ? ((state.results.warnings / state.results.total) * 100).toFixed(1) : 0;

  console.log(`\n  Total Tests:  ${state.results.total}`);
  console.log(`  Passed:       ${state.results.passed} (${passRate}%)`);
  console.log(`  Failed:       ${state.results.failed} (${failRate}%)`);
  console.log(`  Warnings:     ${state.results.warnings} (${warnRate}%)`);
  console.log(`  Crashes:      ${state.crashCount}`);
  console.log(`  Duration:     ${formatDuration(Date.now() - state.startTime)}`);
  console.log(`  Prehistoric:  ${state.prehistoricComplete ? "Complete" : "Incomplete/Timeout"}`);

  const line = "─".repeat(70);
  console.log(`\n  ${line}`);
  console.log(`  ${pad("Test", 45)} ${pad("Status", 10)} Detail`);
  console.log(`  ${line}`);

  for (const d of state.results.details) {
    const icon = d.status === "pass" ? "✅" : d.status === "fail" ? "❌" : "⚠️ ";
    console.log(`  ${icon} ${pad(d.name, 43)} ${pad(d.status.toUpperCase(), 10)} ${d.detail}`);
  }

  console.log(`\n  ${line}`);

  subsection("Phase Results");
  for (const [phaseName, phaseResult] of Object.entries(state.results.phaseResults)) {
    const phasePassRate = phaseResult.total > 0 ? ((phaseResult.passed / phaseResult.total) * 100).toFixed(1) : 0;
    const phaseStatus = state.phases[phaseName]?.status || "unknown";
    kv(phaseName, `${phaseResult.passed}/${phaseResult.total} passed (${phasePassRate}%) [${phaseStatus}]`);
  }

  if (state.realtimeSnapshots.length > 0) {
    subsection("Realtime Monitoring Summary");
    kv("Total Snapshots", state.realtimeSnapshots.length);
    kv("Monitoring Duration", formatDuration(CONFIG.REALTIME_MONITOR_DURATION_MS));
    kv("Snapshot Interval", `${CONFIG.REALTIME_SNAPSHOT_INTERVAL_MS / 1000}s`);
  }

  console.log(`\n  ${line}`);

  if (state.results.failed === 0) {
    console.log(`\n  🚀 ALL CRITICAL TESTS PASSED`);
  } else {
    console.log(`\n  ⚠️  ${state.results.failed} TEST(S) FAILED - Review details above`);
  }

  console.log(`\n  Test completed at: ${new Date().toISOString()}`);
  console.log(`  Results saved to: ${CONFIG.RESULTS_FILE}`);
  console.log(`  Log saved to: ${CONFIG.LOG_FILE}`);
  console.log("");
}

// ============================================================
// Main Test Runner
// ============================================================

let state;

async function main() {
  state = TestState.load();

  const isRecovery = state.crashCount > 0 || Object.keys(state.phases).length > 0;

  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║     CTS v3.1 - Enhanced Comprehensive Test Suite        ║");
  console.log("║     Testing: Dev Mode, Prehistoric, Engine, Data,       ║");
  console.log("║     Indications, Strategies, Database, Server, Overall   ║");
  console.log("║     Features: Crash Recovery, Retry, State Persistence   ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`\n  Started at: ${new Date().toISOString()}`);
  console.log(`  Target: ${CONFIG.BASE_URL}`);
  if (isRecovery) {
    console.log(`  🔄 Recovery mode - Resuming from crash #${state.crashCount}`);
    console.log(`  Previous phases: ${Object.keys(state.phases).join(", ")}`);
  }

  const overallStart = Date.now();
  state.startTime = state.startTime || overallStart;

  setupCrashHandlers();

  try {
    await testServerHealth();
    await testQuickstartAndInit();
    await testDatabaseLoads();
    await testConnections();

    let verifyData = state.verifyData;
    if (!verifyData) {
      verifyData = await testEngineVerification();
      state.verifyData = verifyData;
    }

    if (verifyData) {
      if (!state.prehistoricComplete) {
        await waitForPrehistoricComplete(verifyData);
      }

      if (state.prehistoricComplete) {
        console.log(`\n  ⏳ Waiting 60 seconds for realtime progress after prehistoric complete...`);
        await sleep(60000);
      }

      await testProgressionTracking(verifyData);
      await testIndicationsWithResults(verifyData);
      await testStrategiesWithResults(verifyData);
      await testDataProcessingCounts(verifyData);
      await testProcessedDataOverall(verifyData);
    }

    await testRealtimeProgress(verifyData);
    await testApiFunctionality();
    await testSettingsAndRisk();

    const overallDuration = Date.now() - overallStart;
    console.log(`\n  Overall test duration: ${formatDuration(overallDuration)}`);

    state.saveResults();
    printFinalSummary();

    process.exit(state.results.failed > 5 ? 1 : 0);
  } catch (err) {
    console.error(`\n  💥 Test suite crashed: ${err.message || String(err)}`);
    if (err.stack) {
      state.log(`FATAL: ${err.message}\n${err.stack}`);
    }

    state.saveResults();
    printFinalSummary();
    process.exit(1);
  }
}

main();
