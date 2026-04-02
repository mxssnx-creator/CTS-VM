/**
 * Redis TTL Policy Configuration
 * 
 * Based on Redis best practices from redis.io/docs/latest/operate/oss_and_stack/management/config/
 * 
 * Key principles:
 * - Every key that can grow unbounded MUST have a TTL
 * - Index sets must have TTLs to prevent orphaned references
 * - Logs must have reasonable retention periods
 * - Cache keys must always have TTLs
 * - Core data (connections, presets) can be persistent (TTL=0)
 * 
 * Redis CONFIG guidelines applied:
 * - Use maxmemory-policy allkeys-lru for cache-like behavior when appropriate
 * - Set explicit EXPIRE on keys rather than relying solely on eviction
 * - Use CONFIG SET for runtime adjustments if needed
 */

export const RedisTTLPolicy = {
  LOGGING: {
    SYSTEM_LOGS: 604800,
    ENGINE_PROGRESS_LOGS: 2592000,
    WORKFLOW_LOGS: 604800,
    MONITORING_EVENTS: 2592000,
    INDEX_SETS: 2592000,
    CONNECTION_LOGS: 604800,
  },

  TRADING: {
    TRADES: 604800,
    POSITIONS: 604800,
    ORDERS: 3600,
    COORDINATOR_POSITIONS: 3600,
    COORDINATOR_ORDERS: 3600,
  },

  CACHE: {
    DEFAULT: 300,
    CONNECTIONS: 3600,
    STRATEGIES: 7200,
    MONITORING: 300,
    POSITIONS: 900,
    PRICES: 1,
    INDICATIONS: 30,
    PSEUDO_POSITIONS: 1,
    RANGES: 60,
  },

  DATA: {
    MARKET_DATA: 86400,
    SNAPSHOTS: 2592000,
    PROGRESSION_STATE: 604800,
    PROGRESSION_LIMITS: 2592000,
    METADATA: 2592000,
  },

  SYSTEM: {
    SETTINGS: 0,
    CONNECTIONS: 0,
    PRESETS: 0,
    USERS: 0,
    SCHEMA_KEYS: 0,
  },

  CLEANUP: {
    TTL_CHECK_INTERVAL_MS: 60000,
    MAX_LOG_ENTRIES_PER_CONNECTION: 1000,
    MAX_ENGINE_LOG_ENTRIES: 10000,
    MAX_WORKFLOW_LOG_ENTRIES: 1000,
    MAX_INDICATIONS_PER_CONNECTION: 1000,
  },
} as const

export type RedisTTLCategory = keyof typeof RedisTTLPolicy

export function getTTL(category: string, subcategory?: string): number {
  if (subcategory) {
    const cat = RedisTTLPolicy[category as RedisTTLCategory]
    if (cat && typeof cat === 'object') {
      return (cat as Record<string, number>)[subcategory] ?? 0
    }
  }
  return 0
}

export function hasTTL(seconds: number): boolean {
  return seconds > 0
}
