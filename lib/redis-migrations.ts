/**
 * Redis Migration Runner - Complete System
 * Handles schema initialization and data migrations for all system components
 */

import { getRedisClient, initRedis, setMigrationsRun, haveMigrationsRun } from "./redis-db"

interface Migration {
  name: string
  version: number
  up: (client: any) => Promise<void>
  down: (client: any) => Promise<void>
}

const migrations: Migration[] = [
  {
    name: "001-initial-schema",
    version: 1,
    up: async (client: any) => {
      await client.set("_schema_version", "1")
      // Initialize set keys without empty strings - sets are created empty on first use
      const keys = [
        "connections:all", "connections:bybit", "connections:bingx", "connections:pionex", "connections:orangex",
        "connections:active", "connections:inactive",
        "trades:all", "trades:open", "trades:closed", "trades:pending",
        "positions:all", "positions:open", "positions:closed",
        "users:all", "sessions:all", "presets:all", "preset_types:all",
        "strategies:all", "strategies:active",
        "monitoring:events", "logs:system", "logs:trades", "logs:errors"
      ]
      // Initialize each set as empty (don't add empty strings)
      for (const key of keys) {
        // Just create the key structure by setting a marker
        await client.set(`_index:${key}`, "initialized")
      }
      console.log("[v0] Migration 001: Initial schema created")
    },
    down: async (client: any) => {
      await client.del("_schema_version")
    },
  },
  {
    name: "002-connection-management",
    version: 2,
    up: async (client: any) => {
      await client.set("_schema_version", "2")
      await client.set("_connections_indexed", "true")
      await client.hset("connections:metadata", {
        total_configured: "0",
        total_active: "0",
        total_errors: "0",
        last_sync: new Date().toISOString(),
      })
      for (const exchange of ["bybit", "bingx", "pionex", "orangex"]) {
        await client.hset(`exchange:${exchange}:metadata`, {
          name: exchange,
          api_calls_used: "0",
          api_rate_limit: "0",
          last_updated: new Date().toISOString(),
        })
      }
      console.log("[v0] Migration 002: Connection management structure created")
    },
    down: async (client: any) => {
      await client.del("_connections_indexed")
      await client.set("_schema_version", "1")
    },
  },
  {
    name: "003-trade-positions-schema",
    version: 3,
    up: async (client: any) => {
      await client.set("_schema_version", "3")
      await client.set("_trades_initialized", "true")
      await client.hset("trades:metadata", {
        total_trades: "0", total_open: "0", total_closed: "0",
        total_win: "0", total_loss: "0", total_profit: "0",
        avg_profit: "0", win_rate: "0", last_trade_time: "",
      })
      await client.hset("positions:metadata", {
        total_positions: "0", total_open_positions: "0", total_closed_positions: "0",
        total_contracts: "0", total_collateral: "0", total_pnl: "0", avg_leverage: "0",
      })
      await client.set("trades:counter:open", "0")
      await client.set("trades:counter:closed", "0")
      await client.set("trades:counter:pending", "0")
      await client.set("positions:counter:open", "0")
      await client.set("positions:counter:closed", "0")
      console.log("[v0] Migration 003: Trade and position schemas created")
    },
    down: async (client: any) => {
      await client.del("_trades_initialized")
      await client.set("_schema_version", "2")
    },
  },
  {
    name: "004-preset-strategy-management",
    version: 4,
    up: async (client: any) => {
      await client.set("_schema_version", "4")
      await client.set("_presets_initialized", "true")
      await client.hset("presets:metadata", {
        total_presets: "0", total_active: "0", total_inactive: "0",
        total_runs: "0", avg_success_rate: "0",
      })
      await client.hset("strategies:metadata", {
        total_strategies: "0", total_active_strategies: "0",
        total_backtests: "0", avg_win_rate: "0", avg_profit_factor: "0",
      })
      await client.sadd("preset_types:standard", "")
      await client.sadd("preset_types:advanced", "")
      await client.sadd("preset_types:custom", "")
      await client.set("strategies:counter:active", "0")
      await client.set("strategies:counter:paused", "0")
      await client.set("strategies:counter:stopped", "0")
      console.log("[v0] Migration 004: Preset and strategy management created")
    },
    down: async (client: any) => {
      await client.del("_presets_initialized")
      await client.set("_schema_version", "3")
    },
  },
  {
    name: "005-user-authentication",
    version: 5,
    up: async (client: any) => {
      await client.set("_schema_version", "5")
      await client.set("_auth_initialized", "true")
      await client.hset("users:metadata", {
        total_users: "1", total_active_sessions: "0",
        last_login: new Date().toISOString(),
      })
      await client.hset("sessions:metadata", {
        total_sessions: "0", active_sessions: "0", expired_sessions: "0",
      })
      const adminId = "admin-001"
      await client.hset(`user:${adminId}`, {
        id: adminId, username: "admin", email: "admin@trading-engine.local",
        role: "admin", created_at: new Date().toISOString(),
        last_login: new Date().toISOString(), status: "active", api_keys_count: "0",
      })
      await client.sadd("users:all", adminId)
      await client.sadd("users:admin", adminId)
      console.log("[v0] Migration 005: User authentication system created")
    },
    down: async (client: any) => {
      await client.del("_auth_initialized")
      await client.set("_schema_version", "4")
    },
  },
  {
    name: "006-monitoring-logging",
    version: 6,
    up: async (client: any) => {
      await client.set("_schema_version", "6")
      await client.set("_monitoring_initialized", "true")
      await client.hset("monitoring:metadata", {
        total_events: "0", critical_events: "0", warning_events: "0",
        info_events: "0", last_event_time: new Date().toISOString(),
      })
      await client.hset("system:health", {
        status: "healthy", uptime_seconds: "0", memory_usage: "0",
        cpu_usage: "0", last_check: new Date().toISOString(),
      })
      await client.hset("system:performance", {
        avg_response_time: "0", trades_per_minute: "0",
        api_calls_per_minute: "0", errors_per_hour: "0",
      })
      await client.set("logs:system:counter", "0")
      await client.set("logs:trades:counter", "0")
      await client.set("logs:errors:counter", "0")
      console.log("[v0] Migration 006: Monitoring and logging system created")
    },
    down: async (client: any) => {
      await client.del("_monitoring_initialized")
      await client.set("_schema_version", "5")
    },
  },
  {
    name: "007-cache-optimization",
    version: 7,
    up: async (client: any) => {
      await client.set("_schema_version", "7")
      await client.set("_cache_optimized", "true")
      await client.hset("cache:config", {
        connection_cache_ttl: "3600", trade_cache_ttl: "1800",
        position_cache_ttl: "900", strategy_cache_ttl: "7200", monitoring_cache_ttl: "300",
      })
      await client.hset("cache:stats", {
        total_hits: "0", total_misses: "0", hit_rate: "0", total_evictions: "0",
      })
      await client.sadd("cache:realtime:prices", "")
      await client.sadd("cache:realtime:positions", "")
      await client.sadd("cache:realtime:orders", "")
      await client.sadd("cache:realtime:balances", "")
      console.log("[v0] Migration 007: Cache optimization created")
    },
    down: async (client: any) => {
      await client.del("_cache_optimized")
      await client.set("_schema_version", "6")
    },
  },
  {
    name: "008-performance-optimizations",
    version: 8,
    up: async (client: any) => {
      await client.set("_schema_version", "8")
      await client.set("_ttl_policies_set", "true")
      await client.hset("system:config", {
        database_type: "redis", initialized_at: new Date().toISOString(),
        version: "3.2", environment: "production", log_level: "info",
      })
      await client.hset("system:thresholds", {
        max_concurrent_trades: "1000", max_api_calls_per_minute: "6000",
        max_positions_per_connection: "500", max_connections: "100", memory_limit_mb: "1024",
      })
      await client.hset("ratelimit:config", {
        trades_per_second: "100", api_calls_per_second: "200", batch_operations_per_second: "50",
      })
      console.log("[v0] Migration 008: Performance optimizations configured")
    },
    down: async (client: any) => {
      await client.del("_ttl_policies_set")
      await client.set("_schema_version", "7")
    },
  },
  {
    name: "009-backup-recovery",
    version: 9,
    up: async (client: any) => {
      await client.set("_schema_version", "9")
      await client.set("_backup_initialized", "true")
      await client.hset("backup:metadata", {
        last_backup_time: "", last_backup_size: "0", total_backups: "0",
        backup_retention_days: "30", auto_backup_enabled: "true",
      })
      await client.hset("recovery:points", {
        total_recovery_points: "0", last_recovery_time: "", last_recovery_success: "false",
      })
      await client.sadd("snapshots:trades", "")
      await client.sadd("snapshots:positions", "")
      await client.sadd("snapshots:connections", "")
      await client.sadd("snapshots:strategies", "")
      console.log("[v0] Migration 009: Backup and recovery system created")
    },
    down: async (client: any) => {
      await client.del("_backup_initialized")
      await client.set("_schema_version", "8")
    },
  },
  {
    name: "010-settings-and-metadata",
    version: 10,
    up: async (client: any) => {
      await client.set("_schema_version", "10")
      await client.hset("settings:system", {
        trade_engine_enabled: "true", auto_migration: "true",
        fallback_mode: "memory", theme: "dark", timezone: "UTC", language: "en",
      })
      await client.hset("settings:trading", {
        default_leverage: "1", max_leverage: "20",
        default_take_profit_percent: "2", default_stop_loss_percent: "1",
        max_position_size: "100000",
      })
      await client.hset("settings:api", {
        api_version: "v1", rate_limit_enabled: "true",
        cors_enabled: "true", request_timeout_seconds: "30",
      })
      await client.set("_migration_last_run", new Date().toISOString())
      await client.set("_migration_total_runs", "0")
      await client.hset("features:enabled", {
        live_trading: "false", paper_trading: "true", backtesting: "true",
        strategy_optimization: "true", ai_recommendations: "false",
      })
      console.log("[v0] Migration 010: Settings and metadata finalized")
    },
    down: async (client: any) => {
      await client.del("_migration_last_run")
      await client.set("_schema_version", "9")
    },
  },
  {
    name: "011-seed-predefined-connections",
    version: 11,
    up: async (client: any) => {
      await client.set("_schema_version", "11")
      const connections = [
        { id: "bybit-x03", name: "Bybit X03", exchange: "bybit", api_type: "unified" },
        { id: "bingx-x01", name: "BingX X01", exchange: "bingx", api_type: "perpetual_futures" },
        { id: "binance-x01", name: "Binance X01", exchange: "binance", api_type: "perpetual_futures" },
        { id: "okx-x01", name: "OKX X01", exchange: "okx", api_type: "unified" },
        { id: "gateio-x01", name: "Gate.io X01", exchange: "gateio", api_type: "perpetual_futures" },
        { id: "kucoin-x01", name: "KuCoin X01", exchange: "kucoin", api_type: "perpetual_futures" },
        { id: "mexc-x01", name: "MEXC X01", exchange: "mexc", api_type: "perpetual_futures" },
        { id: "bitget-x01", name: "Bitget X01", exchange: "bitget", api_type: "perpetual_futures" },
        { id: "pionex-x01", name: "Pionex X01", exchange: "pionex", api_type: "perpetual_futures" },
        { id: "orangex-x01", name: "OrangeX X01", exchange: "orangex", api_type: "perpetual_futures" },
        { id: "huobi-x01", name: "Huobi X01", exchange: "huobi", api_type: "perpetual_futures" },
      ]

      let seededCount = 0
      for (const conn of connections) {
        try {
          const key = `connection:${conn.id}`
          const existing = await client.hgetall(key)
          if (!existing || Object.keys(existing).length === 0) {
            const storageData = {
              id: conn.id,
              name: conn.name,
              exchange: conn.exchange,
              api_key: "", // Empty - user must add real credentials
              api_secret: "", // Empty - user must add real credentials
              api_type: conn.api_type,
              connection_method: "library",
              connection_library: "native",
              margin_type: "cross",
              position_mode: "hedge",
              is_testnet: "0",
              is_enabled: "0",
              is_main_enabled: "0",
              is_active: "0",
              is_predefined: "1",
              is_assigned: "0",
              is_active_assigned: "0",
              is_live_trade: "0",
              is_preset_trade: "0",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
            await client.hset(key, storageData)
            await client.sadd("connections", conn.id)
            seededCount++
          }
        } catch (error) {
          console.warn(`[v0] Failed to seed ${conn.name}:`, error instanceof Error ? error.message : "unknown")
        }
      }
      console.log(`[v0] Migration 011: Seeded ${seededCount}/${connections.length} predefined template connections`)
    },
    down: async (client: any) => {
      await client.set("_schema_version", "10")
    },
  },
  {
    name: "012-finalize-dashboard-connections",
    version: 12,
    up: async (client: any) => {
      await client.set("_schema_version", "15")
      
      // Base connections: 4 primary exchange templates (bybit-x03, bingx-x01, pionex-x01, orangex-x01)
      // These are PREDEFINED TEMPLATES, not user-created connections
      // They should remain disabled by default - users must create their own credentials
      const baseTemplateIds = ["bybit-x03", "bingx-x01", "pionex-x01", "orangex-x01"]
      
      const connections = await client.smembers("connections") || []
      let updatedBase = 0
      let updatedOther = 0
      
      console.log(`[v0] Migration 015: Initializing connections (base templates set to predefined=1, disabled)`)
      
      for (const connId of connections) {
        const connData = await client.hgetall(`connection:${connId}`)
        if (!connData || Object.keys(connData).length === 0) continue
        
        if (baseTemplateIds.includes(connId)) {
          // Base templates: marked as PREDEFINED, disabled, not inserted (templates only)
          await client.hset(`connection:${connId}`, {
            is_assigned: "0",        // NOT inserted - templates only
            is_enabled: "0",         // NOT enabled by default
            is_predefined: "1",      // These are predefined templates
            is_active_assigned: "0", // NOT in active panel
            is_main_enabled: "0",
            updated_at: new Date().toISOString(),
          })
          updatedBase++
          console.log(`[v0] Migration 015: ✓ ${connId} -> predefined=1, inserted=0, enabled=0 (template)`)
        } else {
          // Other predefined connections: all templates
          await client.hset(`connection:${connId}`, {
            is_assigned: "0",
            is_enabled: "0",
            is_predefined: "1",
            is_active_assigned: "0",
            is_main_enabled: "0",
            updated_at: new Date().toISOString(),
          })
          updatedOther++
        }
      }
      
      console.log(`[v0] Migration 015: COMPLETE - ${updatedBase} base templates, ${updatedOther} other templates (all disabled)`)
    },
    down: async (client: any) => {
      await client.set("_schema_version", "11")
    },
  },
  {
    name: "013-risk-management-and-engines",
    version: 13,
    up: async (client: any) => {
      await client.set("_schema_version", "13")
      
      // Risk Management Settings with defaults
      await client.hset("settings:risk-management", {
        enabled: "false", // Disabled for now
        max_open_positions: "maximal",
        daily_loss_limit_percent: "65",
        max_drawdown_percent: "55",
        position_size_limit: "100000",
        stop_loss_enabled: "true",
        take_profit_enabled: "true",
      })
      
      // Trade Engine Controls
      await client.hset("settings:engines", {
        preset_trade_engine: "true", // Enabled
        main_trade_engine: "true", // Enabled
        realtime_positions_engine: "true", // Enabled
        risk_management_engine: "false", // Disabled for now
      })
      
      console.log("[v0] Migration 013: Risk management settings and engine controls added")
    },
    down: async (client: any) => {
      await client.del("settings:risk-management")
      await client.del("settings:engines")
      await client.set("_schema_version", "12")
    },
  },
  {
    name: "014-update-bingx-credentials",
    version: 14,
    up: async (client: any) => {
      await client.set("_schema_version", "14")
      
      // Only clear test/placeholder credentials (00998877 pattern, "test" prefix, too short)
      // Keep real credentials like BingX which have long valid API keys
      const exchanges = ["bybit-x03", "binance-x01", "okx-x01", "pionex-x01", "orangex-x01", "gateio-x01", "kucoin-x01", "mexc-x01", "bitget-x01", "huobi-x01"]
      
      for (const connectionId of exchanges) {
        try {
          const data = await client.hgetall(`connection:${connectionId}`)
          if (data && Object.keys(data).length > 0) {
            // Clear credentials if they're test/placeholder values (00998877 pattern)
            const apiKey = data.api_key as string
            if (apiKey && apiKey.includes("00998877")) {
              console.log(`[v0] Migration 014: Clearing test credentials from ${connectionId}`)
              await client.hset(`connection:${connectionId}`, {
                ...data,
                api_key: "",
                api_secret: "",
                updated_at: new Date().toISOString(),
              })
            }
          }
        } catch (error) {
          console.warn(`[v0] Migration 014: Could not update ${connectionId}:`, error)
        }
      }
      
      console.log(`[v0] Migration 014: Cleared test credentials, real credentials preserved`)
    },
    down: async (client: any) => {
      await client.set("_schema_version", "13")
    },
  },
  {
    name: "015-fix-connection-inserted-enabled-states",
    version: 15,
    up: async (client: any) => {
      await client.set("_schema_version", "15")
      
      // The 4 base exchanges that should be marked as INSERTED and ENABLED
      // Using bybit, bingx, pionex, orangex as specified
      const baseExchangeIds = ["bybit-x03", "bingx-x01", "pionex-x01", "orangex-x01"]
      
      const connections = await client.smembers("connections")
      let updatedBase = 0
      let updatedOther = 0
      
      for (const connId of connections) {
        const connData = await client.hgetall(`connection:${connId}`)
        if (!connData || Object.keys(connData).length === 0) continue
        
        if (baseExchangeIds.includes(connId)) {
          // Mark as INSERTED, ENABLED, and ACTIVE_INSERTED by default (base connection)
          // Base connections are automatically enabled and added to Active panel
          await client.hset(`connection:${connId}`, {
            is_assigned: "1",
            is_enabled: "1",              // ENABLED by default
            is_active_assigned: "1",      // Added to Active panel
            is_main_enabled: "1",    // Dashboard toggle enabled
            is_active: "1",
            is_predefined: "1",
            connection_method: "library", // Use native SDK by default
            updated_at: new Date().toISOString(),
          })
          updatedBase++
          console.log(`[v0] Migration 015: ${connId} -> inserted=1, enabled=1, active_inserted=1, dashboard_enabled=1 (base connection)`)
        } else {
          // Non-base predefined connections: just informational templates
          // NOT inserted, NOT enabled - they are templates only
          await client.hset(`connection:${connId}`, {
            is_assigned: "0",
            is_enabled: "0",
            is_predefined: "1",
            is_main_enabled: "0",
            updated_at: new Date().toISOString(),
          })
          updatedOther++
          console.log(`[v0] Migration 015: ${connId} -> inserted=0, enabled=0 (template only)`)
        }
      }
      
      console.log(`[v0] Migration 015: Fixed ${updatedBase} base connections, ${updatedOther} template connections`)
    },
    down: async (client: any) => {
      await client.set("_schema_version", "14")
    },
  },
  {
    name: "016-active-connections-independent-state",
    version: 16,
    up: async (client: any) => {
      await client.set("_schema_version", "16")
      
      // Migration 016: Ensure all 4 base connections are properly set up with env credentials
      // Base connections: bybit, bingx, pionex, orangex - should be INSERTED and ENABLED
      const baseTemplateIds = ["bybit-x03", "bingx-x01", "pionex-x01", "orangex-x01"]
      
      // Check for real BingX credentials from environment
      const bingxApiKey = process.env.BINGX_API_KEY || ""
      const bingxApiSecret = process.env.BINGX_API_SECRET || ""
      const hasBingxCredentials = bingxApiKey.length > 10 && bingxApiSecret.length > 10
      console.log(`[v0] Migration 016: BingX credentials available: ${hasBingxCredentials}`)
      
      const connections = await client.smembers("connections") || []
      let updatedTemplates = 0
      let updatedUserConnections = 0
      
      console.log(`[v0] Migration 016: Ensuring predefined templates state for ${connections.length} connections`)
      
      for (const connId of connections) {
        const connData = await client.hgetall(`connection:${connId}`)
        if (!connData || Object.keys(connData).length === 0) continue
        
        const isPredefined = connData.is_predefined === "1" || connData.is_predefined === true
        const isBaseTemplate = baseTemplateIds.includes(connId)
        
        if (isBaseTemplate) {
          // Base connections: inserted and enabled by default
          // Update with env credentials if available (for BingX)
          const updateData: Record<string, string> = {
            is_assigned: "1",        // INSERTED
            is_enabled: "1",         // ENABLED
            is_active_assigned: "1", // In active panel
            is_main_enabled: "1",
            is_active: "1",
            connection_method: "library", // Use native SDK by default
            updated_at: new Date().toISOString(),
          }
          
          // Add real BingX credentials if available
          if (connId === "bingx-x01" && hasBingxCredentials) {
            updateData.api_key = bingxApiKey
            updateData.api_secret = bingxApiSecret
            console.log(`[v0] Migration 016: Adding real BingX credentials to ${connId}`)
          }
          
          await client.hset(`connection:${connId}`, updateData)
          updatedTemplates++
          console.log(`[v0] Migration 016: ✓ ${connId} -> inserted=1, enabled=1, active=1 (base connection)`)
        } else if (!isPredefined) {
          // User-created connections: reset main state if not properly set
          if (!connData.is_active_assigned || !connData.is_main_enabled) {
            await client.hset(`connection:${connId}`, {
              is_active_assigned: "0",      // Default: NOT in active panel
              is_main_enabled: "0",    // Default: NOT enabled
              is_enabled: connData.is_enabled || "0",  // Preserve existing enabled state
              updated_at: new Date().toISOString(),
            })
            updatedUserConnections++
            console.log(`[v0] Migration 016: ✓ ${connId} reset main state to defaults`)
          }
        }
      }
      
      console.log(`[v0] Migration 016: COMPLETE - ${updatedTemplates} templates verified, ${updatedUserConnections} user connections updated`)
    },
    down: async (client: any) => {
      await client.set("_schema_version", "15")
    },
  },
  {
    name: "017-rename-old-connection-fields",
    version: 17,
    up: async (client: any) => {
      await client.set("_schema_version", "17")

      // Field name mappings: old -> new
      const fieldMappings: Record<string, string> = {
        is_enabled_dashboard: "is_main_enabled",
        is_active_inserted: "is_active_assigned",
        is_inserted: "is_assigned",
        is_dashboard_inserted: "is_main_assigned",
      }

      const connections = await client.smembers("connections") || []
      let renamed = 0

      for (const connId of connections) {
        const connData = await client.hgetall(`connection:${connId}`)
        if (!connData || Object.keys(connData).length === 0) continue

        const updates: Record<string, string> = {}
        const fieldsToDelete: string[] = []

        for (const [oldField, newField] of Object.entries(fieldMappings)) {
          if (connData[oldField] !== undefined && connData[oldField] !== null) {
            // Only copy if new field doesn't already have a value
            if (!connData[newField]) {
              updates[newField] = connData[oldField]
            }
            fieldsToDelete.push(oldField)
            renamed++
          }
        }

        if (Object.keys(updates).length > 0) {
          await client.hset(`connection:${connId}`, updates)
        }

        // Delete old fields
        for (const field of fieldsToDelete) {
          await client.hdel(`connection:${connId}`, field)
        }
      }

      console.log(`[v0] Migration 017: Renamed ${renamed} old fields to new names across ${connections.length} connections`)
    },
    down: async (client: any) => {
      await client.set("_schema_version", "16")
    },
  },
]

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<{ success: boolean; message: string; version: number }> {
  try {
    // Check if migrations have already run in this process
  if (haveMigrationsRun()) {
  const finalVer = Math.max(...migrations.map((m) => m.version))
  console.log("[v0] [Migrations] ✓ Already executed in this process, skipping")
  return { success: true, message: "Already run in this process", version: finalVer }
  }

    await initRedis()
    const client = getRedisClient()
    const versionStr = await client.get("_schema_version")
    const currentVersion = versionStr ? parseInt(versionStr as string) : 0
    const finalVersion = Math.max(...migrations.map((m) => m.version))

    console.log(`[v0] [Migrations] Current: v${currentVersion}, Target: v${finalVersion}`)

    // Get migrations that need to run (version > currentVersion)
    const pendingMigrations = migrations.filter((m) => m.version > currentVersion)
    
    if (pendingMigrations.length === 0) {
      console.log(`[v0] [Migrations] Already at latest version ${finalVersion}`)
      
      // AUTO-FIX: Still ensure base connections are configured (handles env var addition after initial migration)
      const baseConnections = ["bybit-x03", "bingx-x01", "pionex-x01", "orangex-x01"]
      const envMappings: Record<string, { key: string; secret: string }> = {
        "bingx-x01": { key: "BINGX_API_KEY", secret: "BINGX_API_SECRET" },
        "bybit-x03": { key: "BYBIT_API_KEY", secret: "BYBIT_API_SECRET" },
        "pionex-x01": { key: "PIONEX_API_KEY", secret: "PIONEX_API_SECRET" },
        "orangex-x01": { key: "ORANGEX_API_KEY", secret: "ORANGEX_API_SECRET" },
      }
      
      let credentialsInjected = 0
      for (const connId of baseConnections) {
        const mapping = envMappings[connId]
        if (mapping) {
          const apiKey = process.env[mapping.key] || ""
          const apiSecret = process.env[mapping.secret] || ""
          if (apiKey.length > 10 && apiSecret.length > 10) {
            // Check if credentials already exist
            const existing = await client.hget(`connection:${connId}`, "api_key")
            if (!existing || existing.length < 10 || existing !== apiKey) {
              await client.hset(`connection:${connId}`, {
                api_key: apiKey,
                api_secret: apiSecret,
                is_active_assigned: "1",
                is_enabled: "1",
                is_main_enabled: "1",
                connection_method: "library",
                updated_at: new Date().toISOString(),
              })
              console.log(`[v0] [Migrations] Auto-injected ${connId} credentials from environment`)
              credentialsInjected++
            }
          }
        }
      }
      if (credentialsInjected > 0) {
        console.log(`[v0] [Migrations] ✓ Injected credentials for ${credentialsInjected} connections`)
      }
      
      setMigrationsRun(true)
      return { success: true, message: `Already at latest version ${finalVersion}`, version: finalVersion }
    }

    console.log(`[v0] [Migrations] Running ${pendingMigrations.length} pending migrations...`)
    for (const migration of pendingMigrations) {
      try {
        console.log(`[v0] [Migrations] Running: ${migration.name} (v${migration.version})`)
        await migration.up(client)
        console.log(`[v0] [Migrations] ✓ Completed: ${migration.name}`)
      } catch (error) {
        console.error(`[v0] [Migrations] ✗ Failed during ${migration.name}:`, error)
        throw error
      }
    }

    // Update schema version to final version
    await client.set("_schema_version", finalVersion.toString())
    
    // Track migration runs
    const runCount = await client.get("_migration_total_runs")
    const newRunCount = (parseInt((runCount as string) || "0") + 1).toString()
    await client.set("_migration_total_runs", newRunCount)
    await client.set("_migration_last_run", new Date().toISOString())

    console.log(`[v0] [Migrations] ✓ Successfully migrated v${currentVersion} -> v${finalVersion}`)
    console.log(`[v0] [Migrations] ${pendingMigrations.length} migrations executed`)
    
    // Verify final state
    const finalVersionCheck = await client.get("_schema_version")
    console.log(`[v0] [Migrations] ✓ Verification: Schema version is now ${finalVersionCheck}`)
    
    // AUTO-FIX: Ensure base connections are properly configured with credentials from env
    const baseConnections = ["bybit-x03", "bingx-x01", "pionex-x01", "orangex-x01"]
    const envMappings: Record<string, { key: string; secret: string }> = {
      "bingx-x01": { key: "BINGX_API_KEY", secret: "BINGX_API_SECRET" },
      "bybit-x03": { key: "BYBIT_API_KEY", secret: "BYBIT_API_SECRET" },
      "pionex-x01": { key: "PIONEX_API_KEY", secret: "PIONEX_API_SECRET" },
      "orangex-x01": { key: "ORANGEX_API_KEY", secret: "ORANGEX_API_SECRET" },
    }
    
    for (const connId of baseConnections) {
      const updateData: Record<string, string> = {
        is_active_assigned: "1",
        is_enabled: "1",
        is_main_enabled: "1",
        is_active: "1",
        connection_method: "library",
        updated_at: new Date().toISOString(),
      }
      
      // Check for env credentials
      const mapping = envMappings[connId]
      if (mapping) {
        const apiKey = process.env[mapping.key] || ""
        const apiSecret = process.env[mapping.secret] || ""
        if (apiKey.length > 10 && apiSecret.length > 10) {
          updateData.api_key = apiKey
          updateData.api_secret = apiSecret
          console.log(`[v0] [Migrations] Injecting ${connId} credentials from environment`)
        }
      }
      
      await client.hset(`connection:${connId}`, updateData)
    }
    console.log(`[v0] [Migrations] ✓ Auto-fixed ${baseConnections.length} base connections`)
    
    // Mark migrations as run in this process
    setMigrationsRun(true)
    
    return { success: true, message: `Migrated from v${currentVersion} to v${finalVersion}`, version: finalVersion }
  } catch (error) {
    console.error("[v0] [Migrations] ✗ Migration failed:", error)
    throw error
  }
}

/**
 * Rollback to previous migration
 */
export async function rollbackMigration(): Promise<void> {
  try {
    await initRedis()
    const client = getRedisClient()
    const versionStr = await client.get("_schema_version")
    const currentVersion = versionStr ? parseInt(versionStr as string) : 0
    if (currentVersion === 0) {
      console.log("[v0] No migrations to rollback")
      return
    }
    const migrationToRollback = migrations.find((m) => m.version === currentVersion)
    if (migrationToRollback) {
      console.log(`[v0] Rolling back: ${migrationToRollback.name}`)
      await migrationToRollback.down(client)
    }
    console.log(`[v0] Rolled back to version ${currentVersion - 1}`)
  } catch (error) {
    console.error("[v0] Rollback failed:", error)
    throw error
  }
}

/**
 * Get migration status
 */
export async function getMigrationStatus(): Promise<any> {
  try {
    await initRedis()
    const client = getRedisClient()
    const versionStr = await client.get("_schema_version")
    const currentVersion = versionStr ? parseInt(versionStr as string) : 0
    const latestVersion = Math.max(...migrations.map((m) => m.version))
    return {
      currentVersion,
      latestVersion,
      isMigrated: currentVersion === latestVersion,
      pendingMigrations: migrations.filter((m) => m.version > currentVersion),
      message: currentVersion === latestVersion
        ? `Already at latest version ${currentVersion}`
        : `${latestVersion - currentVersion} pending migrations`,
    }
  } catch (error) {
    console.error("[v0] Could not get migration status:", error)
    return {
      currentVersion: 0,
      latestVersion: Math.max(...migrations.map((m) => m.version)),
      isMigrated: false,
      message: "Failed to check status",
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
