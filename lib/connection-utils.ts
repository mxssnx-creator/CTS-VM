/**
 * CONNECTION HIERARCHY:
 * 1. PREDEFINED TEMPLATES (11 total): All connections seeded by migrations
 * 2. BASE CONNECTIONS (6): Primary exchanges with is_assigned=1, is_enabled=1
 *    - These are the working base connections that appear in Settings and Main page
 * 3. TEMPLATE-ONLY (5): Secondary exchanges (gateio, kucoin, mexc, bitget, huobi)
 *    - Just informational templates, not active unless user explicitly enables them
 * 4. MAIN CONNECTIONS: Connections with is_main_enabled=1
 *    - INDEPENDENT status from Settings is_enabled
 *    - Trade engine processes ONLY main connections
 *
 * BACKWARD COMPATIBILITY: Field name mappings (old -> new)
 * - is_enabled_dashboard -> is_main_enabled
 * - is_active_inserted -> is_active_assigned
 * - is_inserted -> is_assigned
 * - is_dashboard_inserted -> is_main_assigned
 */

// The 6 primary/base exchanges that are "assigned" and enabled by default
export const BASE_EXCHANGES = ["bybit", "bingx", "binance", "okx", "pionex", "orangex"]

// All known exchanges (base + templates)
export const ALL_EXCHANGES = ["bybit", "bingx", "binance", "okx", "pionex", "orangex", "gateio", "kucoin", "mexc", "bitget", "huobi"]

/**
 * Helper: Read a connection field with backward compatibility for old field names.
 * Checks new field name first, then falls back to old field name.
 */
function readConnectionField(connection: any, newField: string, oldField: string): any {
  if (!connection) return undefined
  // Try new field name first
  if (connection[newField] !== undefined && connection[newField] !== null) {
    return connection[newField]
  }
  // Fall back to old field name
  if (connection[oldField] !== undefined && connection[oldField] !== null) {
    return connection[oldField]
  }
  return undefined
}

/**
 * Check if a connection is a BASE connection (one of the 4 primary exchanges)
 * Uses the `exchange` field for reliable matching regardless of is_assigned state
 */
export function isBaseConnection(connection: any): boolean {
  if (!connection) return false
  const exchange = (connection.exchange || "").toLowerCase().trim()
  return BASE_EXCHANGES.includes(exchange)
}

/**
 * Check if a connection is a template-only connection (NOT a base connection)
 */
export function isTemplateOnlyConnection(connection: any): boolean {
  if (!connection) return true
  return !isBaseConnection(connection)
}

/**
 * Check if a connection is enabled in Settings (base connection level)
 * Fallback: base connections are enabled by default
 */
export function isConnectionEnabled(connection: any): boolean {
  if (!connection) return false
  // Check explicit is_enabled field
  const isEnabled = connection.is_enabled === true || connection.is_enabled === "1" || connection.is_enabled === "true"
  // Fallback: base connections are enabled by default even if field is missing/corrupted
  if (!isEnabled && isBaseConnection(connection)) {
    // If is_enabled was never set or was corrupted, base connections default to enabled
    return connection.is_enabled === undefined || connection.is_enabled === null
  }
  return isEnabled
}

/**
 * Check if a connection is enabled on the Main page
 * Backward compatible: checks is_main_enabled first, then falls back to is_enabled_dashboard
 */
export function isConnectionMainEnabled(connection: any): boolean {
  if (!connection) return false
  const val = readConnectionField(connection, "is_main_enabled", "is_enabled_dashboard")
  return val === true || val === "1" || val === "true"
}

/**
 * Check if a connection is assigned (inserted into trade engine)
 * Backward compatible: checks is_assigned first, then falls back to is_inserted
 */
export function isConnectionAssigned(connection: any): boolean {
  if (!connection) return false
  const val = readConnectionField(connection, "is_assigned", "is_inserted")
  return val === true || val === "1" || val === "true"
}

/**
 * Check if a connection is active-assigned (in Active panel)
 * Backward compatible: checks is_active_assigned first, then falls back to is_active_inserted
 */
export function isConnectionActiveAssigned(connection: any): boolean {
  if (!connection) return false
  const val = readConnectionField(connection, "is_active_assigned", "is_active_inserted")
  return val === true || val === "1" || val === "true"
}

/**
 * Check if a connection is main-assigned (visible on dashboard)
 * Backward compatible: checks is_main_assigned first, then falls back to is_dashboard_inserted
 */
export function isConnectionMainAssigned(connection: any): boolean {
  if (!connection) return false
  const val = readConnectionField(connection, "is_main_assigned", "is_dashboard_inserted")
  return val === true || val === "1" || val === "true"
}

/**
 * Filter connections to only base connections (the 4 primary exchanges)
 */
export function filterBaseConnections(connections: any[]): any[] {
  return connections.filter(isBaseConnection)
}

/**
 * Filter connections to only template-only connections
 */
export function filterTemplateConnections(connections: any[]): any[] {
  return connections.filter(isTemplateOnlyConnection)
}

/**
 * Filter connections to base connections that are enabled (for Main Connections listing)
 */
export function filterEnabledBaseConnections(connections: any[]): any[] {
  return connections.filter(c => isBaseConnection(c) && isConnectionEnabled(c))
}

/**
 * Filter connections to main-enabled connections (for trade engine processing)
 */
export function filterMainEnabledConnections(connections: any[]): any[] {
  return connections.filter(isConnectionMainEnabled)
}
