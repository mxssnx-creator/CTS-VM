/**
 * Active Connections Manager
 * Handles connections actively in use for trading (INDEPENDENT from Settings)
 * Uses Redis as single source of truth (via is_main_enabled field)
 *
 * TERMINOLOGY:
 * - These are called "Main Connections" or "Actively Using" connections
 * - NOT called "Dashboard Connections" to avoid confusion
 *
 * INDEPENDENCE GUARANTEE:
 * - Toggling a Main connection does NOT affect Settings connections
 * - Settings connections status (is_enabled) is COMPLETELY INDEPENDENT
 * - Each has its own toggle/state system managed separately
 */

import { initRedis, getAllConnections, getConnection, updateConnection } from "@/lib/redis-db"
import { BASE_EXCHANGES } from "@/lib/connection-utils"

export interface ActiveConnection {
  id: string
  connectionId: string
  exchangeName: string
  isActive: boolean       // Maps to is_main_enabled (Main page toggle, INDEPENDENT)
  isBaseEnabled: boolean  // Maps to is_enabled (Settings base enabled, read-only here)
  addedAt: string
}

/**
 * Load connections for the Main Connections list on the Main page.
 * Shows:
 * - ALL assigned base connections (is_assigned=1) -- always visible as cards
 * - ANY connection with is_main_enabled=1 -- user-activated connections
 * isActive = is_main_enabled (the active toggle, independent from Settings)
 */
export async function loadActiveConnections(): Promise<ActiveConnection[]> {
  try {
    await initRedis()
    const allConnections = await getAllConnections()

    const activeConnections: ActiveConnection[] = []
    const seenIds = new Set<string>()

    for (const conn of allConnections) {
      const exchange = (conn.exchange || "").toLowerCase().trim()
      const isAssigned = conn.is_assigned === true || conn.is_assigned === "1" || conn.is_assigned === "true"
      const isMainEnabled = conn.is_main_enabled === true || conn.is_main_enabled === "1" || conn.is_main_enabled === "true"
      const isSettingsEnabled = conn.is_enabled === true || conn.is_enabled === "1" || conn.is_enabled === "true"
      const isBase = BASE_EXCHANGES.includes(exchange)

      // Show if: it's a base exchange, OR it's assigned, OR it's main-enabled
      if (isBase || isAssigned || isMainEnabled) {
        if (seenIds.has(conn.id)) continue
        seenIds.add(conn.id)

        activeConnections.push({
          id: `active-${conn.id}`,
          connectionId: conn.id,
          exchangeName: conn.exchange.charAt(0).toUpperCase() + conn.exchange.slice(1),
          isActive: isMainEnabled,
          isBaseEnabled: isSettingsEnabled,
          addedAt: conn.created_at || new Date().toISOString(),
        })
      }
    }

    console.log(`[v0] [MainConnections] Loaded ${activeConnections.length} connections (${activeConnections.filter(c => c.isActive).length} active)`)
    return activeConnections
  } catch (error) {
    console.error("[v0] Error loading main connections from Redis:", error)
    return getDefaultActiveConnections()
  }
}

export async function saveActiveConnections(connections: ActiveConnection[]): Promise<void> {
  try {
    await initRedis()

    for (const ac of connections) {
      try {
        const connection = await getConnection(ac.connectionId)
        if (connection) {
          // Save is_main_enabled (Main page active state) - NOT is_enabled
          connection.is_main_enabled = ac.isActive ? "1" : "0"
          await updateConnection(ac.connectionId, connection)
        }
      } catch (e) {
        console.warn(`[v0] [MainConnections] Could not update ${ac.connectionId}:`, e)
      }
    }
  } catch (error) {
    console.error("[v0] Error saving main connections to Redis:", error)
  }
}

export async function addActiveConnection(connectionId: string, exchangeName: string): Promise<ActiveConnection> {
  try {
    await initRedis()

    console.log(`[v0] [MainConnections] Adding connection ${connectionId} (${exchangeName}) to main list`)

    // Use getAllConnections (which is proven reliable) instead of getConnection
    let connection = null
    
    // First try getConnection directly
    connection = await getConnection(connectionId)
    
    // Fallback: search through getAllConnections if direct lookup fails
    if (!connection) {
      console.log(`[v0] [MainConnections] Direct lookup failed for ${connectionId}, falling back to getAllConnections`)
      const allConnections = await getAllConnections()
      console.log(`[v0] [MainConnections] getAllConnections returned ${allConnections.length} connections`)
      connection = allConnections.find((c: any) => c.id === connectionId)
      
      if (connection) {
        console.log(`[v0] [MainConnections] Found ${connectionId} via getAllConnections fallback`)
      }
    }
    
    if (!connection) {
      console.error(`[v0] [MainConnections] Connection ${connectionId} not found in Redis at all`)
      throw new Error(`Connection ${connectionId} not found in database`)
    }

    console.log(`[v0] [MainConnections] Setting is_main_enabled=1 for ${connectionId}`)
    connection.is_main_enabled = "1"
    await updateConnection(connectionId, connection)
    console.log(`[v0] [MainConnections] Successfully added ${connectionId} to main list`)

    return {
      id: `active-${connectionId}`,
      connectionId,
      exchangeName,
      isActive: true, // We just set is_main_enabled = "1"
      isBaseEnabled: connection.is_enabled === true || connection.is_enabled === "1" || connection.is_enabled === "true",
      addedAt: connection.created_at || new Date().toISOString(),
    }
  } catch (error) {
    console.error("[v0] Error adding main connection:", error)
    throw error
  }
}

export async function removeActiveConnection(connectionId: string): Promise<void> {
  try {
    await initRedis()

    let connection = await getConnection(connectionId)
    if (!connection) {
      const all = await getAllConnections()
      connection = all.find((c: any) => c.id === connectionId)
    }
    if (connection) {
      connection.is_main_enabled = "0"
      await updateConnection(connectionId, connection)
    }
  } catch (error) {
    console.error("[v0] Error removing main connection:", error)
    throw error
  }
}

/**
 * Toggle is_main_enabled (Main page toggle) - INDEPENDENT from Settings is_enabled
 */
export async function toggleActiveConnection(connectionId: string, isActive: boolean): Promise<void> {
  try {
    await initRedis()

    let connection = await getConnection(connectionId)
    if (!connection) {
      const all = await getAllConnections()
      connection = all.find((c: any) => c.id === connectionId)
    }
    if (connection) {
      // Toggle is_main_enabled (Main page active state) - NOT is_enabled (Settings state)
      connection.is_main_enabled = isActive ? "1" : "0"
      await updateConnection(connectionId, connection)
      console.log(`[v0] [MainConnections] Toggled ${connectionId} active: ${isActive}`)
    }
  } catch (error) {
    console.error("[v0] Error toggling main connection:", error)
    throw error
  }
}

function getDefaultActiveConnections(): ActiveConnection[] {
  const now = new Date().toISOString()
  return [
    { id: "active-bybit-x03", connectionId: "bybit-x03", exchangeName: "Bybit", isActive: true, isBaseEnabled: true, addedAt: now },
    { id: "active-bingx-x01", connectionId: "bingx-x01", exchangeName: "BingX", isActive: true, isBaseEnabled: true, addedAt: now },
    { id: "active-binance-x01", connectionId: "binance-x01", exchangeName: "Binance", isActive: false, isBaseEnabled: true, addedAt: now },
    { id: "active-okx-x01", connectionId: "okx-x01", exchangeName: "OKX", isActive: false, isBaseEnabled: true, addedAt: now },
  ]
}
