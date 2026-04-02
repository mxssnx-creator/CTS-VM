import { getRedisClient } from "@/lib/redis-db";

const MAX_ENTRIES = 10000; // keep last 10k entries per connection

function getIndicationsKey(connectionId: string): string {
  return `statistics:indications:${connectionId}`;
}

function getStrategiesKey(connectionId: string): string {
  return `statistics:strategies:${connectionId}`;
}

/**
 * Track indication statistics - called after each indication processing cycle
 * Records indication type, value, and confidence to Redis for statistics
 */
export async function trackIndicationStats(
  connectionId: string,
  symbol: string,
  indicationType: string,
  value: number,
  confidence: number
): Promise<void> {
  const client = getRedisClient();
  const entry = {
    id: `ind_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    connection_id: connectionId,
    symbol,
    type: indicationType,
    value,
    confidence,
    calculated_at: new Date().toISOString(),
  };
  const key = getIndicationsKey(connectionId);
  await client.lpush(key, JSON.stringify(entry));
  await client.ltrim(key, 0, MAX_ENTRIES - 1);
}

/**
 * Track strategy statistics - called after strategy evaluation
 * Records strategy type, counts, and metrics to Redis for statistics
 */
export async function trackStrategyStats(
  connectionId: string,
  symbol: string,
  strategyType: string,
  totalCreated: number,
  passedCount: number,
  profitFactor: number,
  drawdownTimeMinutes: number
): Promise<void> {
  const client = getRedisClient();
  const entry = {
    id: `str_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    connection_id: connectionId,
    symbol,
    type: strategyType,
    count: totalCreated,
    passed_count: passedCount,
    avg_profit_factor: profitFactor,
    avg_drawdown_time: Math.round(drawdownTimeMinutes),
    evaluated_at: new Date().toISOString(),
  };
  const key = getStrategiesKey(connectionId);
  await client.lpush(key, JSON.stringify(entry));
  await client.ltrim(key, 0, MAX_ENTRIES - 1);
}

/**
 * Get recent indication statistics for dashboard
 */
export async function getIndicationStats(connectionId: string, hoursBack: number = 24): Promise<any[]> {
  const client = getRedisClient();
  const key = getIndicationsKey(connectionId);
  const allEntries = await client.lrange(key, 0, -1);
  if (!allEntries || allEntries.length === 0) return [];

  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
  const filtered: any[] = [];
  for (const entryStr of allEntries) {
    try {
      const entry = JSON.parse(entryStr);
      if (entry.calculated_at >= cutoff) {
        filtered.push(entry);
      }
    } catch (e) {
      // ignore malformed entries
    }
  }

  // Group by type and aggregate
  const groups: Record<string, any[]> = {};
  for (const entry of filtered) {
    const type = entry.type;
    if (!groups[type]) groups[type] = [];
    groups[type].push(entry);
  }

  return Object.entries(groups).map(([type, entries]) => {
    const count = entries.length;
    const avg_value = entries.reduce((sum, e) => sum + e.value, 0) / count;
    const avg_confidence = entries.reduce((sum, e) => sum + e.confidence, 0) / count;
    return {
      type,
      count,
      avg_value,
      avg_confidence,
    };
  });
}

/**
 * Get recent strategy statistics for dashboard
 */
export async function getStrategyStats(connectionId: string, hoursBack: number = 24): Promise<any[]> {
  const client = getRedisClient();
  const key = getStrategiesKey(connectionId);
  const allEntries = await client.lrange(key, 0, -1);
  if (!allEntries || allEntries.length === 0) return [];

  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
  const filtered: any[] = [];
  for (const entryStr of allEntries) {
    try {
      const entry = JSON.parse(entryStr);
      if (entry.evaluated_at >= cutoff) {
        filtered.push(entry);
      }
    } catch (e) {
      // ignore malformed entries
    }
  }

  // Group by type and aggregate
  const groups: Record<string, any[]> = {};
  for (const entry of filtered) {
    const type = entry.type;
    if (!groups[type]) groups[type] = [];
    groups[type].push(entry);
  }

  return Object.entries(groups).map(([type, entries]) => {
    const count = entries.length;
    const total_passed = entries.reduce((sum, e) => sum + e.passed_count, 0);
    const avg_profit_factor = entries.reduce((sum, e) => sum + e.avg_profit_factor, 0) / count;
    const avg_drawdown_time = entries.reduce((sum, e) => sum + e.avg_drawdown_time, 0) / count;
    return {
      type,
      count,
      total_passed,
      avg_profit_factor,
      avg_drawdown_time,
    };
  });
}
