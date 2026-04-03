/**
 * Comprehensive Dev Mode Test Script
 * Tests complete engine progression: quickstart, prehistoric data, engine processing,
 * indications, strategies, positions, database, logging, and real-time processing.
 *
 * Usage: npx tsx scripts/test-comprehensive-dev-mode-full.ts
 */

import { initRedis, getRedisClient, getAllConnections, getAssignedAndEnabledConnections, getSettings, setSettings } from "@/lib/redis-db";
import { TradeEngineManager } from "@/lib/trade-engine/engine-manager";
import { IndicationProcessor } from "@/lib/trade-engine/indication-processor";
import { StrategyProcessor } from "@/lib/trade-engine/strategy-processor";
import { PseudoPositionManager } from "@/lib/trade-engine/pseudo-position-manager";
import { RealtimeProcessor } from "@/lib/trade-engine/realtime-processor";
import { IndicationSetsProcessor } from "@/lib/indication-sets-processor";
import { StrategyCoordinator } from "@/lib/strategy-coordinator";
import { PositionThresholdManager } from "@/lib/position-threshold-manager";
import { ProgressionStateManager } from "@/lib/progression-state-manager";
import { logProgressionEvent, getProgressionLogs } from "@/lib/engine-progression-logs";
import { loadMarketDataForEngine, generateSyntheticCandles } from "@/lib/market-data-loader";
import { trackIndicationStats, trackStrategyStats, getIndicationStats, getStrategyStats } from "@/lib/statistics-tracker";
import { initializeGlobalCoordinator, getGlobalTradeEngineCoordinator } from "@/lib/trade-engine";

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  details: Record<string, any>;
  error?: string;
}

const results: TestResult[] = [];
const errors: Array<{ test: string; error: string; stack?: string }> = [];

async function runTest(name: string, fn: () => Promise<Record<string, any>>): Promise<void> {
  const start = Date.now();
  try {
    const details = await fn();
    results.push({ name, passed: true, duration: Date.now() - start, details });
    console.log(`  ✓ ${name} (${Date.now() - start}ms)`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    errors.push({ test: name, error: msg, stack });
    results.push({ name, passed: false, duration: Date.now() - start, details: {}, error: msg });
    console.error(`  ✗ ${name} (${Date.now() - start}ms): ${msg}`);
  }
}

function nanoid(len = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < len; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

async function countRedisKeys(pattern: string): Promise<number> {
  const client = getRedisClient();
  let count = 0;
  const allKeys = [...client.data.strings.keys(), ...client.data.hashes.keys(), ...client.data.sets.keys(), ...client.data.lists.keys()];
  for (const key of allKeys) {
    if (key.includes(pattern)) count++;
  }
  return count;
}

async function getAllRedisDataSize(): Promise<{ strings: number; hashes: number; sets: number; lists: number; total: number }> {
  const client = getRedisClient();
  const strings = client.data.strings.size;
  const hashes = client.data.hashes.size;
  const sets = client.data.sets.size;
  const lists = client.data.lists.size;
  return { strings, hashes, sets, lists, total: strings + hashes + sets + lists };
}

function calcPercentage(part: number, total: number): string {
  if (total === 0) return "0.0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

function calcPerHour(count: number, elapsedMs: number): number {
  if (elapsedMs === 0) return 0;
  return Math.round((count / elapsedMs) * 3600000);
}

async function main() {
  const testConnectionId = `test-conn-${nanoid()}`;
  const testSymbol = "BTCUSDT";
  const testStartTime = new Date();

  console.log("=".repeat(80));
  console.log("CTS v3.1 - Comprehensive Dev Mode Test Suite");
  console.log(`Test Connection: ${testConnectionId}`);
  console.log(`Test Symbol: ${testSymbol}`);
  console.log(`Start Time: ${testStartTime.toISOString()}`);
  console.log("=".repeat(80));

  console.log("\n[PHASE 1] Database & Redis Initialization");

  await runTest("Redis initialization", async () => {
    await initRedis();
    const client = getRedisClient();
    const ping = await client.ping();
    const dataSize = await getAllRedisDataSize();
    return { ping, dataSize, timestamp: new Date().toISOString() };
  });

  await runTest("Database connections load", async () => {
    const allConns = await getAllConnections();
    const enabledConns = await getAssignedAndEnabledConnections();
    return {
      totalConnections: allConns.length,
      assignedEnabledConnections: enabledConns.length,
      connections: allConns.map((c: any) => ({ id: c.id, name: c.name, exchange: c.exchange, enabled: c.is_enabled })),
    };
  });

  await runTest("Database settings load", async () => {
    const allSettings = await getSettings("all_settings") || {};
    return {
      settingsCount: Object.keys(allSettings).length,
      mainEngineIntervalMs: allSettings.mainEngineIntervalMs,
      strategyUpdateIntervalMs: allSettings.strategyUpdateIntervalMs,
      realtimeIntervalMs: allSettings.realtimeIntervalMs,
      prehistoricDataDays: allSettings.prehistoricDataDays,
      marketTimeframe: allSettings.marketTimeframe,
    };
  });

  console.log("\n[PHASE 2] Market Data Loading");

  await runTest("Load market data for engine", async () => {
    const symbols = [testSymbol, "ETHUSDT", "SOLUSDT"];
    const loaded = await loadMarketDataForEngine(symbols);
    const dataSize = await getAllRedisDataSize();
    const marketDataKeys = await countRedisKeys("market_data");
    return {
      symbolsLoaded: loaded,
      symbolsRequested: symbols.length,
      totalRedisKeys: dataSize.total,
      marketDataKeys,
    };
  });

  await runTest("Verify market data in Redis", async () => {
    const client = getRedisClient();
    const candleData = await client.get(`market_data:${testSymbol}:candles`);
    const marketData1m = await client.get(`market_data:${testSymbol}:1m`);
    const hashData = await client.hgetall(`market_data:${testSymbol}`);

    let candleCount = 0;
    if (candleData) {
      const parsed = JSON.parse(candleData);
      candleCount = Array.isArray(parsed) ? parsed.length : 0;
    }

    return {
      symbol: testSymbol,
      candlesArrayExists: !!candleData,
      candlesCount: candleCount,
      marketData1mExists: !!marketData1m,
      hashDataExists: Object.keys(hashData).length > 0,
      hashFields: Object.keys(hashData).length,
    };
  });

  console.log("\n[PHASE 3] Prehistoric Data Processing");

  await runTest("Initialize indication processor", async () => {
    const proc = new IndicationProcessor(testConnectionId);
    return { connectionId: testConnectionId, initialized: true };
  });

  await runTest("Process historical indications", async () => {
    const proc = new IndicationProcessor(testConnectionId);
    const startDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const endDate = new Date();
    await proc.processHistoricalIndications(testSymbol, startDate, endDate);

    const setsProcessor = new IndicationSetsProcessor(testConnectionId);
    const directionStats = await setsProcessor.getSetStats(testSymbol, "direction");
    const moveStats = await setsProcessor.getSetStats(testSymbol, "move");
    const activeStats = await setsProcessor.getSetStats(testSymbol, "active");
    const optimalStats = await setsProcessor.getSetStats(testSymbol, "optimal");

    return {
      symbol: testSymbol,
      period: `${startDate.toISOString()} to ${endDate.toISOString()}`,
      directionStats: directionStats || { currentEntries: 0 },
      moveStats: moveStats || { currentEntries: 0 },
      activeStats: activeStats || { currentEntries: 0 },
      optimalStats: optimalStats || { currentEntries: 0 },
    };
  });

  await runTest("Process prehistoric strategies", async () => {
    const strategyProc = new StrategyProcessor(testConnectionId);
    const startDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const endDate = new Date();
    await strategyProc.processHistoricalStrategies(testSymbol, startDate, endDate);

    const progressionState = await ProgressionStateManager.getProgressionState(testConnectionId);
    return {
      prehistoricCyclesCompleted: progressionState.prehistoricCyclesCompleted,
      prehistoricSymbolsProcessed: progressionState.prehistoricSymbolsProcessed,
      prehistoricPhaseActive: progressionState.prehistoricPhaseActive,
    };
  });

  console.log("\n[PHASE 4] Indication Processing");

  await runTest("Process real-time indications", async () => {
    const proc = new IndicationProcessor(testConnectionId);
    const indications = await proc.processIndication(testSymbol);

    const indicationKeys = await countRedisKeys("indications");
    const statsKeys = await countRedisKeys("statistics:indications");

    return {
      symbol: testSymbol,
      indicationsGenerated: indications.length,
      indicationTypes: indications.map((i: any) => i.type),
      indicationKeys,
      statsKeys,
    };
  });

  await runTest("Track indication statistics", async () => {
    await trackIndicationStats(testConnectionId, testSymbol, "direction", 1, 0.75);
    await trackIndicationStats(testConnectionId, testSymbol, "move", 1, 0.65);
    await trackIndicationStats(testConnectionId, testSymbol, "active", 1, 0.85);
    await trackIndicationStats(testConnectionId, testSymbol, "optimal", 0, 0.45);

    const stats = await getIndicationStats(testConnectionId, 1);
    return {
      trackedCount: 4,
      statsGroups: stats.length,
      stats: stats.map((s: any) => ({ type: s.type, count: s.count, avgConfidence: s.avg_confidence?.toFixed(3) })),
    };
  });

  await runTest("Process all indication sets", async () => {
    const setsProc = new IndicationSetsProcessor(testConnectionId);
    const client = getRedisClient();
    const candleData = await client.get(`market_data:${testSymbol}:candles`);
    const candles = candleData ? JSON.parse(candleData) : [];

    if (candles.length > 0) {
      const latestCandle = candles[candles.length - 1];
      const marketData = {
        prices: candles.map((c: any) => c.close).slice(-100),
        ...latestCandle,
      };
      await setsProc.processAllIndicationSets(testSymbol, marketData);
    }

    const directionLimit = setsProc.getLimit("direction");
    const moveLimit = setsProc.getLimit("move");
    const activeLimit = setsProc.getLimit("active");
    const optimalLimit = setsProc.getLimit("optimal");
    const positionLimits = setsProc.getPositionLimits();

    return {
      directionLimit,
      moveLimit,
      activeLimit,
      optimalLimit,
      positionLimits,
      indicationTimeoutMs: setsProc.isTimeoutPassed("test") ? "ready" : "timeout",
    };
  });

  console.log("\n[PHASE 5] Strategy Processing (BASE → MAIN → REAL → LIVE)");

  await runTest("Execute strategy flow", async () => {
    const coordinator = new StrategyCoordinator(testConnectionId);

    const indications = [
      { type: "direction", confidence: 0.7, value: 1, metadata: { direction: "long" } },
      { type: "move", confidence: 0.6, value: 1, metadata: { movement: 0.02 } },
      { type: "active", confidence: 0.8, value: 1, metadata: { volume: 5000 } },
      { type: "optimal", confidence: 0.5, value: 0, metadata: { consecutiveSteps: 2 } },
    ];

    const flowResults = await coordinator.executeStrategyFlow(testSymbol, indications, false);

    const stageSummary: Record<string, any> = {};
    let totalCreated = 0;
    let totalPassed = 0;

    for (const result of flowResults) {
      stageSummary[result.type] = {
        created: result.totalCreated,
        passed: result.passedEvaluation,
        failed: result.failedEvaluation,
        passPercentage: calcPercentage(result.passedEvaluation, result.totalCreated),
        avgProfitFactor: result.avgProfitFactor.toFixed(3),
        avgDrawdownTime: `${Math.round(result.avgDrawdownTime)}min`,
      };
      totalCreated += result.totalCreated;
      totalPassed += result.passedEvaluation;
    }

    return {
      stages: flowResults.length,
      stageSummary,
      totalCreated,
      totalPassed,
      totalFailed: totalCreated - totalPassed,
      overallPassRate: calcPercentage(totalPassed, totalCreated),
    };
  });

  await runTest("Track strategy statistics", async () => {
    await trackStrategyStats(testConnectionId, testSymbol, "base", 4, 4, 1.25, 0);
    await trackStrategyStats(testConnectionId, testSymbol, "main", 112, 45, 1.45, 120);
    await trackStrategyStats(testConnectionId, testSymbol, "real", 45, 12, 1.65, 60);
    await trackStrategyStats(testConnectionId, testSymbol, "live", 12, 3, 2.15, 30);

    const stats = await getStrategyStats(testConnectionId, 1);
    return {
      trackedCount: 4,
      statsGroups: stats.length,
      stats: stats.map((s: any) => ({
        type: s.type,
        count: s.count,
        totalPassed: s.total_passed,
        passPercentage: calcPercentage(s.total_passed, s.count),
        avgProfitFactor: s.avg_profit_factor?.toFixed(3),
        avgDrawdownTime: `${Math.round(s.avg_drawdown_time)}min`,
      })),
    };
  });

  await runTest("Verify strategy sets in Redis", async () => {
    const client = getRedisClient();
    const baseData = await getSettings(`strategies:${testConnectionId}:${testSymbol}:base`);
    const mainData = await getSettings(`strategies:${testConnectionId}:${testSymbol}:main`);
    const realData = await getSettings(`strategies:${testConnectionId}:${testSymbol}:real`);
    const liveData = await getSettings(`strategies:${testConnectionId}:${testSymbol}:live`);

    const baseCount = baseData?.count || 0;
    const mainCount = mainData?.count || 0;
    const realCount = realData?.count || 0;
    const liveCount = liveData?.count || 0;
    const totalSets = baseCount + mainCount + realCount + liveCount;

    return {
      baseCount,
      mainCount,
      realCount,
      liveCount,
      totalSets,
      basePercentage: calcPercentage(baseCount, totalSets),
      mainPercentage: calcPercentage(mainCount, totalSets),
      realPercentage: calcPercentage(realCount, totalSets),
      livePercentage: calcPercentage(liveCount, totalSets),
      liveExecutable: liveData?.executable || false,
    };
  });

  console.log("\n[PHASE 6] Position Management");

  await runTest("Create pseudo positions", async () => {
    const posMgr = new PseudoPositionManager(testConnectionId);

    const positions: string[] = [];
    const configs = [
      { side: "long" as const, tp: 1.5, sl: 0.5, trailing: false },
      { side: "short" as const, tp: 1.5, sl: 0.5, trailing: false },
      { side: "long" as const, tp: 2.0, sl: 0.8, trailing: true },
      { side: "short" as const, tp: 2.0, sl: 0.8, trailing: true },
    ];

    for (const cfg of configs) {
      const id = await posMgr.createPosition({
        symbol: testSymbol,
        indicationType: "direction",
        side: cfg.side,
        entryPrice: 45000,
        takeprofitFactor: cfg.tp,
        stoplossRatio: cfg.sl,
        profitFactor: 1.25,
        trailingEnabled: cfg.trailing,
      });
      if (id) positions.push(id);
    }

    const activePositions = await posMgr.getActivePositions();
    const positionStats = await posMgr.getPositionStats();
    const positionCount = await posMgr.getPositionCount();

    return {
      positionsCreated: positions.length,
      activePositions: activePositions.length,
      positionCount,
      positionStats,
      positionIds: positions,
    };
  });

  await runTest("Position threshold enforcement", async () => {
    const thresholdMgr = new PositionThresholdManager(testConnectionId);
    const baseResult = await thresholdMgr.enforceThresholds(testSymbol, "base");
    const mainResult = await thresholdMgr.enforceThresholds(testSymbol, "main");
    const realResult = await thresholdMgr.enforceThresholds(testSymbol, "real");
    const liveResult = await thresholdMgr.enforceThresholds(testSymbol, "live");

    const positionCounts = await thresholdMgr.getPositionCounts(testSymbol);

    return {
      base: baseResult,
      main: mainResult,
      real: realResult,
      live: liveResult,
      positionCounts,
    };
  });

  await runTest("Update and close positions", async () => {
    const posMgr = new PseudoPositionManager(testConnectionId);
    const activePositions = await posMgr.getActivePositions();

    let updated = 0;
    let closed = 0;

    for (const pos of activePositions.slice(0, 2)) {
      await posMgr.updatePosition(pos.id, 46000);
      updated++;
    }

    if (activePositions.length > 0) {
      await posMgr.closePosition(activePositions[0].id, "take_profit");
      closed++;
    }

    const finalStats = await posMgr.getPositionStats();
    return { updated, closed, finalStats };
  });

  console.log("\n[PHASE 7] Engine Manager Full Cycle");

  await runTest("Initialize and start trade engine", async () => {
    const engine = new TradeEngineManager({
      connectionId: testConnectionId,
      indicationInterval: 1,
      strategyInterval: 2,
      realtimeInterval: 3,
    });

    await engine.start({
      connectionId: testConnectionId,
      indicationInterval: 1,
      strategyInterval: 2,
      realtimeInterval: 3,
    });

    const status = await engine.getStatus();
    return {
      status: status?.status,
      health: status?.health?.overall,
      startedAt: status?.started_at,
    };
  });

  await runTest("Engine progression state", async () => {
    const progressionData = await getSettings(`engine_progression:${testConnectionId}`);
    const engineState = await getSettings(`trade_engine_state:${testConnectionId}`);
    const engineRunning = await getSettings(`engine_is_running:${testConnectionId}`);

    return {
      progression: progressionData,
      engineState: {
        status: engineState?.status,
        prehistoricLoaded: engineState?.prehistoric_data_loaded,
        allPhasesStarted: engineState?.all_phases_started,
      },
      running: engineRunning,
    };
  });

  console.log("\n[PHASE 8] Logging Verification");

  await runTest("Engine progression logs", async () => {
    await logProgressionEvent(testConnectionId, "test_phase", "info", "Test progression event", {
      testKey: "testValue",
      symbol: testSymbol,
    });

    await logProgressionEvent(testConnectionId, "test_error", "error", "Test error event", {
      error: "Test error message",
    });

    const logs = await getProgressionLogs(testConnectionId);
    const logKeys = await countRedisKeys("engine_logs");

    return {
      logsCount: logs.length,
      logKeys,
      sampleLogs: logs.slice(-3).map((l: any) => ({
        phase: l.phase,
        level: l.level,
        message: l.message,
      })),
    };
  });

  console.log("\n[PHASE 9] Real-time Processing (60 seconds)");

  const realtimeStart = Date.now();
  const realtimeDuration = 60000;
  let realtimeCycles = 0;
  let realtimeIndications = 0;
  let realtimeStrategies = 0;
  let realtimeErrors = 0;

  await runTest("Real-time processing loop (60s)", async () => {
    const engine = new TradeEngineManager({
      connectionId: testConnectionId,
      indicationInterval: 1,
      strategyInterval: 2,
      realtimeInterval: 3,
    });

    await engine.start({
      connectionId: testConnectionId,
      indicationInterval: 1,
      strategyInterval: 2,
      realtimeInterval: 3,
    });

    const cycleInterval = setInterval(async () => {
      const elapsed = Date.now() - realtimeStart;
      if (elapsed >= realtimeDuration) {
        clearInterval(cycleInterval);
        return;
      }

      realtimeCycles++;

      try {
        const proc = new IndicationProcessor(testConnectionId);
        const indications = await proc.processIndication(testSymbol);
        realtimeIndications += indications.length;

        if (realtimeCycles % 2 === 0) {
          const strategyProc = new StrategyProcessor(testConnectionId);
          const result = await strategyProc.processStrategy(testSymbol, indications);
          realtimeStrategies += result.strategiesEvaluated;
        }

        if (realtimeCycles % 3 === 0) {
          const realtimeProc = new RealtimeProcessor(testConnectionId);
          await realtimeProc.processRealtimeUpdates();
        }
      } catch (error) {
        realtimeErrors++;
        console.error(`  [Realtime] Cycle ${realtimeCycles} error:`, error instanceof Error ? error.message : String(error));
      }
    }, 1000);

    await new Promise((resolve) => setTimeout(resolve, realtimeDuration + 1000));

    const finalStatus = await engine.getStatus();
    const progressionState = await ProgressionStateManager.getProgressionState(testConnectionId);
    const indicationStats = await getIndicationStats(testConnectionId, 1);
    const strategyStats = await getStrategyStats(testConnectionId, 1);

    await engine.stop();

    const elapsed = Date.now() - realtimeStart;
    const indicationsPerHour = calcPerHour(realtimeIndications, elapsed);
    const strategiesPerHour = calcPerHour(realtimeStrategies, elapsed);

    return {
      duration: `${(elapsed / 1000).toFixed(1)}s`,
      cycles: realtimeCycles,
      indicationsProcessed: realtimeIndications,
      strategiesEvaluated: realtimeStrategies,
      errors: realtimeErrors,
      indicationsPerHour,
      strategiesPerHour,
      engineStatus: finalStatus?.status,
      progressionCycles: progressionState.cyclesCompleted,
      indicationStatsGroups: indicationStats.length,
      strategyStatsGroups: strategyStats.length,
    };
  });

  console.log("\n[PHASE 10] Final Database State & Statistics");

  await runTest("Final database state", async () => {
    const dataSize = await getAllRedisDataSize();
    const marketDataKeys = await countRedisKeys("market_data");
    const strategyKeys = await countRedisKeys("strategies");
    const positionKeys = await countRedisKeys("pseudo_position");
    const indicationKeys = await countRedisKeys("indication_set");
    const logKeys = await countRedisKeys("engine_logs");
    const progressionKeys = await countRedisKeys("progression");
    const statisticsKeys = await countRedisKeys("statistics");

    return {
      totalKeys: dataSize.total,
      breakdown: {
        strings: dataSize.strings,
        hashes: dataSize.hashes,
        sets: dataSize.sets,
        lists: dataSize.lists,
      },
      keyCategories: {
        marketData: marketDataKeys,
        strategies: strategyKeys,
        positions: positionKeys,
        indications: indicationKeys,
        logs: logKeys,
        progression: progressionKeys,
        statistics: statisticsKeys,
      },
    };
  });

  await runTest("Final statistics summary", async () => {
    const indicationStats = await getIndicationStats(testConnectionId, 1);
    const strategyStats = await getStrategyStats(testConnectionId, 1);
    const progressionState = await ProgressionStateManager.getProgressionState(testConnectionId);

    return {
      indications: indicationStats.map((s: any) => ({
        type: s.type,
        count: s.count,
        avgConfidence: s.avg_confidence?.toFixed(3),
      })),
      strategies: strategyStats.map((s: any) => ({
        type: s.type,
        count: s.count,
        totalPassed: s.total_passed,
        avgProfitFactor: s.avg_profit_factor?.toFixed(3),
      })),
      progression: {
        cyclesCompleted: progressionState.cyclesCompleted,
        successfulCycles: progressionState.successfulCycles,
        failedCycles: progressionState.failedCycles,
        cycleSuccessRate: `${progressionState.cycleSuccessRate.toFixed(1)}%`,
        prehistoricCycles: progressionState.prehistoricCyclesCompleted,
        prehistoricSymbols: progressionState.prehistoricSymbolsProcessed,
      },
    };
  });

  const testEndTime = new Date();
  const totalDuration = testEndTime.getTime() - testStartTime.getTime();
  const passedTests = results.filter((r) => r.passed).length;
  const failedTests = results.filter((r) => !r.passed).length;

  console.log("\n" + "=".repeat(80));
  console.log("TEST SUMMARY");
  console.log("=".repeat(80));
  console.log(`Total Tests: ${results.length}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  console.log(`Duration: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`Start: ${testStartTime.toISOString()}`);
  console.log(`End: ${testEndTime.toISOString()}`);
  console.log("=".repeat(80));

  console.log("\nDetailed Results:");
  console.log("-".repeat(80));

  for (const result of results) {
    const status = result.passed ? "✓ PASS" : "✗ FAIL";
    console.log(`\n${status} | ${result.name} | ${result.duration}ms`);
    if (!result.passed && result.error) {
      console.log(`  Error: ${result.error}`);
    }
    if (Object.keys(result.details).length > 0) {
      console.log(`  Details: ${JSON.stringify(result.details, null, 2).slice(0, 300)}`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("PROCESSING METRICS");
  console.log("=".repeat(80));

  const realtimeResult = results.find((r) => r.name === "Real-time processing loop (60s)");
  if (realtimeResult && realtimeResult.passed) {
    const d = realtimeResult.details;
    console.log(`Real-time Duration: ${d.duration}`);
    console.log(`Cycles Completed: ${d.cycles}`);
    console.log(`Indications Processed: ${d.indicationsProcessed}`);
    console.log(`Strategies Evaluated: ${d.strategiesEvaluated}`);
    console.log(`Errors: ${d.errors}`);
    console.log(`Indications/Hour: ${d.indicationsPerHour}`);
    console.log(`Strategies/Hour: ${d.strategiesPerHour}`);
  }

  const strategyResult = results.find((r) => r.name === "Execute strategy flow");
  if (strategyResult && strategyResult.passed) {
    const d = strategyResult.details;
    console.log(`\nStrategy Flow Results:`);
    console.log(`  Stages Executed: ${d.stages}`);
    console.log(`  Total Created: ${d.totalCreated}`);
    console.log(`  Total Passed: ${d.totalPassed}`);
    console.log(`  Total Failed: ${d.totalFailed}`);
    console.log(`  Overall Pass Rate: ${d.overallPassRate}`);
    console.log(`  Stage Summary:`);
    for (const [stage, info] of Object.entries(d.stageSummary || {})) {
      const s = info as any;
      console.log(`    ${stage.toUpperCase()}: ${s.created} created, ${s.passed} passed (${s.passPercentage}), PF=${s.avgProfitFactor}, DDT=${s.avgDrawdownTime}`);
    }
  }

  const strategySetsResult = results.find((r) => r.name === "Verify strategy sets in Redis");
  if (strategySetsResult && strategySetsResult.passed) {
    const d = strategySetsResult.details;
    console.log(`\nStrategy Sets in Redis:`);
    console.log(`  BASE: ${d.baseCount} (${d.basePercentage})`);
    console.log(`  MAIN: ${d.mainCount} (${d.mainPercentage})`);
    console.log(`  REAL: ${d.realCount} (${d.realPercentage})`);
    console.log(`  LIVE: ${d.liveCount} (${d.livePercentage})`);
    console.log(`  Total: ${d.totalSets}`);
    console.log(`  Live Executable: ${d.liveExecutable}`);
  }

  const positionResult = results.find((r) => r.name === "Create pseudo positions");
  if (positionResult && positionResult.passed) {
    const d = positionResult.details;
    console.log(`\nPosition Results:`);
    console.log(`  Positions Created: ${d.positionsCreated}`);
    console.log(`  Active Positions: ${d.activePositions}`);
    console.log(`  Position Stats: ${JSON.stringify(d.positionStats, null, 2)}`);
  }

  const dbResult = results.find((r) => r.name === "Final database state");
  if (dbResult && dbResult.passed) {
    const d = dbResult.details;
    console.log(`\nDatabase State:`);
    console.log(`  Total Keys: ${d.totalKeys}`);
    console.log(`  Breakdown: ${JSON.stringify(d.breakdown)}`);
    console.log(`  Key Categories: ${JSON.stringify(d.keyCategories, null, 2)}`);
  }

  if (errors.length > 0) {
    console.log("\n" + "=".repeat(80));
    console.log("ERRORS");
    console.log("=".repeat(80));
    for (const err of errors) {
      console.log(`\nTest: ${err.test}`);
      console.log(`  Error: ${err.error}`);
      if (err.stack) {
        console.log(`  Stack: ${err.stack.split("\n").slice(0, 5).join("\n  ")}`);
      }
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("TEST COMPLETE");
  console.log("=".repeat(80));

  process.exit(failedTests > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Test suite fatal error:", error);
  process.exit(1);
});