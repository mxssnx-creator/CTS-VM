/**
 * Trade Engine Auto-Start Service
 * Automatically starts trade engines for enabled connections via their toggles
 */

import { getGlobalTradeEngineCoordinator } from "./trade-engine"
import { getAllConnections, getRedisClient, initRedis } from "./redis-db"
import { loadSettingsAsync } from "./settings-storage"

let autoStartInitialized = false
let autoStartTimer: NodeJS.Timeout | null = null

export function isAutoStartInitialized(): boolean {
  return autoStartInitialized
}

/**
 * Initialize and start trade engines automatically
 */
export async function initializeTradeEngineAutoStart(): Promise<void> {
  if (autoStartInitialized) {
    console.log("[v0] [Auto-Start] Already initialized, skipping")
    return
  }

  try {
    console.log("[v0] [Auto-Start] Starting trade engine auto-initialization...")
    const coordinator = getGlobalTradeEngineCoordinator()
    
    // Check if Global Trade Engine Coordinator is running
    await initRedis()
    const client = getRedisClient()
    const globalState = await client.hgetall("trade_engine:global")
    const globalRunning = globalState?.status === "running"
    
    if (!globalRunning) {
      console.log("[v0] [Auto-Start] Global Trade Engine is not running - skipping auto-start. Engines will resume when global is started.")
      autoStartInitialized = true
      startConnectionMonitoring()
      return
    }
    
    const connections = await getAllConnections()

    console.log("[v0] [Auto-Start] Retrieved", connections?.length || 0, "connections from database")

    // Ensure connections is an array
    if (!Array.isArray(connections)) {
      console.error("[v0] [Auto-Start] ERROR: connections is not an array", typeof connections)
      autoStartInitialized = true
      return
    }

    // Filter for connections that are ACTIVE-INSERTED (in Active panel) with valid credentials
    // is_active_assigned=1 means they're added to the Active panel by user
    // This is the ONLY requirement to start engines (not is_enabled)
    const enabledConnections = connections.filter((c) => {
      const isActiveInserted = c.is_active_assigned === true || c.is_active_assigned === "true" || c.is_active_assigned === "1"
      const hasValidKey = c.api_key && c.api_key.length >= 20 && !c.api_key.includes("PLACEHOLDER")
      return isActiveInserted && hasValidKey
    })

    console.log(`[v0] [Auto-Start] Found ${enabledConnections.length} eligible connections (inserted + enabled + valid keys) out of ${connections.length} total`)

    if (enabledConnections.length === 0) {
      console.log("[v0] [Auto-Start] No enabled connections - monitoring for changes...")
      autoStartInitialized = true
      startConnectionMonitoring()
      return
    }

    const settings = await loadSettingsAsync()
    const indicationInterval = settings.mainEngineIntervalMs ? settings.mainEngineIntervalMs / 1000 : 1
    const strategyInterval = settings.strategyUpdateIntervalMs ? settings.strategyUpdateIntervalMs / 1000 : 1
    const realtimeInterval = settings.realtimeIntervalMs ? settings.realtimeIntervalMs / 1000 : 0.2

    let successCount = 0

    for (const connection of enabledConnections) {
      try {
        await coordinator.startEngine(connection.id, {
          connectionId: connection.id,
          indicationInterval,
          strategyInterval,
          realtimeInterval,
        })
        successCount++
        console.log(`[v0] [Auto-Start] ✓ Started trade engine for ${connection.name}`)
      } catch (error) {
        console.error(`[v0] [Auto-Start] ✗ Failed to start ${connection.name}:`, error)
      }
    }

    console.log(`[v0] [Auto-Start] ✓ Trade engines started: ${successCount}/${enabledConnections.length}`)
    autoStartInitialized = true
    startConnectionMonitoring()
  } catch (error) {
    console.error("[v0] [Auto-Start] Initialization failed:", error)
    autoStartInitialized = true
  }
}

/**
 * Monitor for connection changes and auto-start new engines
 * DISABLED: Continuous monitoring removed - connections only assigned on startup
 */
function startConnectionMonitoring(): void {
  console.log("[v0] [Monitor] Connection monitoring DISABLED - connections only assigned on startup")
  // No longer running continuous monitoring - connections are only processed during startup
  // This prevents intervaled reassignments and ensures connections are only managed on startup
}

/**
 * Stop the connection monitoring timer
 */
export function stopConnectionMonitoring(): void {
  if (autoStartTimer) {
    clearInterval(autoStartTimer)
    autoStartTimer = null
  }
}
