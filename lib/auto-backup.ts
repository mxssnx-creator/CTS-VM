import * as fs from "fs"
import * as path from "path"
import { getClient, initRedis } from "./redis-db"

/**
 * AutoBackupManager
 * Handles automatic Redis backups on a schedule
 */
export class AutoBackupManager {
  private backupInterval?: NodeJS.Timeout
  private isRunning = false
  private backupPath: string

  constructor() {
    this.backupPath = process.env.BACKUP_PATH || "/tmp/backups"
    this.ensureBackupDirectory()
  }

  private ensureBackupDirectory() {
    try {
      if (!fs.existsSync(this.backupPath)) {
        fs.mkdirSync(this.backupPath, { recursive: true })
        console.log(`[v0] Backup directory created: ${this.backupPath}`)
      }
    } catch (error) {
      console.error("[v0] Failed to create backup directory:", error)
    }
  }

  /**
   * Start automatic backups
   * @param intervalHours - Hours between backups (default: 6)
   */
  start(intervalHours: number = 6) {
    if (this.isRunning) {
      console.log("[v0] Auto-backup already running")
      return
    }

    console.log(`[v0] Starting auto-backup system (every ${intervalHours} hours)`)
    
    // Run initial backup
    this.performBackup()

    // Schedule recurring backups
    const intervalMs = intervalHours * 60 * 60 * 1000
    this.backupInterval = setInterval(() => {
      this.performBackup()
    }, intervalMs)

    this.isRunning = true
  }

  /**
   * Stop automatic backups
   */
  stop() {
    if (this.backupInterval) {
      clearInterval(this.backupInterval)
      this.backupInterval = undefined
    }
    this.isRunning = false
    console.log("[v0] Auto-backup system stopped")
  }

  /**
   * Perform a database backup from Redis
   */
  async performBackup(): Promise<{ success: boolean; filename?: string; size?: number; error?: string }> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const filename = `backup-${timestamp}.json`
    const filepath = path.join(this.backupPath, filename)

    console.log(`[v0] Performing database backup: ${filename}`)

    try {
      // Initialize Redis connection
      await initRedis()
      const client = getClient()

      // Backup critical tables
      const backupData: Record<string, any[]> = {}

      // Define backup mappings: table name -> { setKey, hashPrefix, type }
      const backupMappings: Record<string, { setKey?: string; hashPrefix?: string; type: 'set' | 'key' | 'complex' }> = {
        // exchange_connections -> connections set + connection:${id} hashes
        exchange_connections: { setKey: "connections", hashPrefix: "connection:", type: "set" },
        
        // system_settings -> settings:* keys (fetch all settings keys)
        system_settings: { type: "key" },
        
        // trade_engine_state -> single key "trade_engine_state"
        trade_engine_state: { type: "key" },
        
        // preset_types -> preset_types:all set + preset_type:${id} hashes
        preset_types: { setKey: "preset_types:all", hashPrefix: "preset_type:", type: "set" },
        
        // preset_configurations (preset_configuration_sets) -> settings:preset_config_set:* keys
        preset_configurations: { type: "key" },
        
        // preset_strategies -> strategies:all set + strategies:${id} hashes
        preset_strategies: { setKey: "strategies:all", hashPrefix: "strategies:", type: "set" },
        
        // indications -> indications set + indications:${id} hashes (legacy)
        indications: { setKey: "indications", hashPrefix: "indications:", type: "set" },
        
        // indications_direction -> indications_direction set + indications_direction:${id} hashes
        indications_direction: { setKey: "indications_direction", hashPrefix: "indications_direction:", type: "set" },
        
        // indications_move -> indications_move set + indications_move:${id} hashes
        indications_move: { setKey: "indications_move", hashPrefix: "indications_move:", type: "set" },
        
        // indications_active -> indications_active set + indications_active:${id} hashes
        indications_active: { setKey: "indications_active", hashPrefix: "indications_active:", type: "set" },
        
        // strategies_trailing -> strategies_trailing set + strategies_trailing:${id} hashes
        strategies_trailing: { setKey: "strategies_trailing", hashPrefix: "strategies_trailing:", type: "set" },
        
        // orders -> need to fetch from all orders:${connectionId} sets
        orders: { type: "complex" },
        
        // trades -> trades set + trade:${id} hashes
        trades: { setKey: "trades", hashPrefix: "trade:", type: "set" }
      }

      for (const [table, config] of Object.entries(backupMappings)) {
        try {
          let data: any[] = []

          switch (config.type) {
            case "set": {
              if (!config.setKey || !config.hashPrefix) {
                console.warn(`[v0] Invalid set config for table ${table}`)
                break
              }
              const ids = await client.smembers(config.setKey)
              if (ids && ids.length > 0) {
                const fetchPromises = ids.map(async (id: string) => {
                  const hash = await client.hgetall(`${config.hashPrefix}${id}`)
                  if (hash && Object.keys(hash).length > 0) {
                    return { ...hash, id }
                  }
                  return null
                })
                const results = await Promise.all(fetchPromises)
                data = results.filter(r => r !== null)
              }
              break
            }

            case "key": {
              // For settings-type data stored as individual keys
              let keys: string[] = []
              if (table === "system_settings") {
                keys = await client.keys("settings:*")
              } else if (table === "preset_configurations") {
                keys = await client.keys("settings:preset_config_set:*")
              } else if (table === "trade_engine_state") {
                // Check both global and per-connection keys
                const global = await client.keys("trade_engine_state")
                const perConn = await client.keys("trade_engine_state:*")
                keys = [...global, ...perConn]
              }
              
              if (keys && keys.length > 0) {
                const fetchPromises = keys.map(async (key: string) => {
                  const value = await client.get(key)
                  if (value !== null) {
                    // Try to parse JSON, otherwise store as string
                    try {
                      const parsed = JSON.parse(value)
                      return { key, value: parsed }
                    } catch {
                      return { key, value }
                    }
                  }
                  return null
                })
                const results = await Promise.all(fetchPromises)
                data = results.filter(r => r !== null)
              }
              break
            }

            case "complex": {
              if (table === "orders") {
                // Orders are stored in per-connection sets: orders:${connectionId}
                // First get all connections
                const connIds = await client.smembers("connections")
                const orderItems: Array<{ oid: string; connId: string }> = []
                
                if (connIds && connIds.length > 0) {
                  // For each connection, get its orders set
                  for (const connId of connIds) {
                    const orderIds = await client.smembers(`orders:${connId}`)
                    if (orderIds && orderIds.length > 0) {
                      for (const oid of orderIds) {
                        orderItems.push({ oid, connId })
                      }
                    }
                  }
                }

                if (orderItems.length > 0) {
                  const fetchPromises = orderItems.map(async ({ oid, connId }) => {
                    const hash = await client.hgetall(`order:${connId}:${oid}`)
                    if (hash && Object.keys(hash).length > 0) {
                      return { ...hash, id: oid, connection_id: connId }
                    }
                    return null
                  })
                  const results = await Promise.all(fetchPromises)
                  data = results.filter(r => r !== null)
                }
              }
              break
            }
          }

          backupData[table] = data
          console.log(`[v0] Backed up ${table}: ${data.length} records`)
        } catch (error) {
          console.warn(`[v0] Failed to backup ${table}:`, error)
          // Continue with other tables
        }
      }

      // Write backup file
      const backupJson = JSON.stringify({
        timestamp: new Date().toISOString(),
        version: "3.1",
        tables: backupData,
        metadata: {
          recordCount: Object.values(backupData).reduce((sum, arr) => sum + arr.length, 0),
          tableCount: Object.keys(backupData).length
        }
      }, null, 2)

      fs.writeFileSync(filepath, backupJson)
      const stats = fs.statSync(filepath)

      console.log(`[v0] ✅ Backup completed: ${filename} (${(stats.size / 1024).toFixed(2)} KB)`)

      // Clean old backups (keep last 10)
      this.cleanOldBackups(10)

      return {
        success: true,
        filename,
        size: stats.size
      }

    } catch (error) {
      console.error("[v0] ❌ Backup failed:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      }
    }
  }

  /**
   * Clean old backup files
   */
  private cleanOldBackups(keepCount: number) {
    try {
      const files = fs.readdirSync(this.backupPath)
        .filter(f => f.startsWith("backup-") && f.endsWith(".json"))
        .map(f => ({
          name: f,
          path: path.join(this.backupPath, f),
          time: fs.statSync(path.join(this.backupPath, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time)

      // Delete old backups
      files.slice(keepCount).forEach(file => {
        fs.unlinkSync(file.path)
        console.log(`[v0] Deleted old backup: ${file.name}`)
      })
    } catch (error) {
      console.error("[v0] Failed to clean old backups:", error)
    }
  }

  /**
   * List available backups
   */
  listBackups(): Array<{ filename: string; size: number; created: Date }> {
    try {
      const files = fs.readdirSync(this.backupPath)
        .filter(f => f.startsWith("backup-") && f.endsWith(".json"))
        .map(f => {
          const filepath = path.join(this.backupPath, f)
          const stats = fs.statSync(filepath)
          return {
            filename: f,
            size: stats.size,
            created: stats.mtime
          }
        })
        .sort((a, b) => b.created.getTime() - a.created.getTime())

      return files
    } catch (error) {
      console.error("[v0] Failed to list backups:", error)
      return []
    }
  }

  /**
   * Get status of auto-backup system
   */
  getStatus() {
    return {
      running: this.isRunning,
      backupPath: this.backupPath,
      backupCount: this.listBackups().length
    }
  }
}

// Global instance
let autoBackupManager: AutoBackupManager | null = null

export function getAutoBackupManager(): AutoBackupManager {
  if (!autoBackupManager) {
    autoBackupManager = new AutoBackupManager()
  }
  return autoBackupManager
}