/**
 * ConnectionManager v2 - Modern Connection Management with Redis Storage
 * Handles all connection CRUD operations, validation, and lifecycle management via Redis
 */

import { initRedis, getAllConnections, getConnection, updateConnection, createConnection, deleteConnection, type Connection } from "@/lib/redis-db"
import { SystemLogger } from "@/lib/system-logger"

// Modern Connection Types with v2 Schema (matches Redis storage)
export interface ConnectionV2 extends Connection {
  id: string
  name: string
  exchange: string
  api_type: "spot" | "perpetual_futures" | "inverse_futures"
  connection_method: "rest" | "websocket" | "hybrid"
  connection_library: "rest" | "ws" | "library"
  authentication_type: "api_key_secret" | "oauth2" | "webhook"
  api_key: string
  api_secret: string
  api_passphrase?: string
  margin_type: "isolated" | "cross"
  position_mode: "one_way" | "hedge"
  is_testnet: boolean
  is_enabled: boolean
  is_enabled_dashboard: string
  is_live_trade: string
  is_preset_trade: string
  is_predefined: boolean
  volume_factor: number
  last_test_status?: "success" | "failed" | "warning"
  last_test_balance?: number
  last_test_log?: string[]
  last_test_at?: string
  api_capabilities?: string
  created_at: string
  updated_at: string
}

export interface ConnectionCreateInput {
  name: string
  exchange: string
  api_type: "spot" | "perpetual_futures" | "inverse_futures"
  connection_method: "rest" | "websocket" | "hybrid"
  api_key: string
  api_secret: string
  api_passphrase?: string
  margin_type: "isolated" | "cross"
  position_mode: "one_way" | "hedge"
  is_testnet: boolean
  volume_factor?: number
}

export interface ConnectionUpdateInput {
  name?: string
  api_key?: string
  api_secret?: string
  api_passphrase?: string
  margin_type?: "isolated" | "cross"
  position_mode?: "one_way" | "hedge"
  is_testnet?: boolean
  is_enabled?: boolean
  is_live_trade?: boolean
  is_preset_trade?: boolean
  volume_factor?: number
}

/**
 * ConnectionManagerV2 - Singleton for managing exchange connections with Redis
 */
export class ConnectionManagerV2 {
  private static instance: ConnectionManagerV2
  private initialized = false

  private constructor() {}

  static getInstance(): ConnectionManagerV2 {
    if (!ConnectionManagerV2.instance) {
      ConnectionManagerV2.instance = new ConnectionManagerV2()
    }
    return ConnectionManagerV2.instance
  }

  /**
   * Initialize the manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return
    try {
      await initRedis()
      this.initialized = true
      console.log("[v0] ConnectionManagerV2 initialized with Redis storage")
    } catch (error) {
      console.error("[v0] Failed to initialize ConnectionManagerV2:", error)
      await SystemLogger.logError(error, "connection-manager-v2", "initialize")
    }
  }

  /**
   * Get all connections
   */
  async getAllConnections(): Promise<ConnectionV2[]> {
    try {
      await this.initialize()
      return (await getAllConnections()) as ConnectionV2[]
    } catch (error) {
      console.error("[v0] Failed to get all connections:", error)
      await SystemLogger.logError(error, "connection-manager-v2", "getAllConnections")
      return []
    }
  }

  /**
   * Get a specific connection
   */
  async getConnection(id: string): Promise<ConnectionV2 | null> {
    try {
      await this.initialize()
      const conn = await getConnection(id)
      return conn as ConnectionV2 | null
    } catch (error) {
      console.error("[v0] Failed to get connection:", error)
      await SystemLogger.logError(error, "connection-manager-v2", `getConnection(${id})`)
      return null
    }
  }

  /**
   * Create a new connection
   */
  async createConnection(input: ConnectionCreateInput): Promise<ConnectionV2 | null> {
    try {
      await this.initialize()

      const now = new Date().toISOString()
      const conn: ConnectionV2 = {
        id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: input.name,
        exchange: input.exchange,
        api_type: input.api_type,
        connection_method: input.connection_method,
        connection_library: "rest",
        authentication_type: "api_key_secret",
        api_key: input.api_key,
        api_secret: input.api_secret,
        api_passphrase: input.api_passphrase,
        margin_type: input.margin_type,
        position_mode: input.position_mode,
        is_testnet: input.is_testnet,
        is_enabled: "0",
        is_enabled_dashboard: "0",
        is_live_trade: "0",
        is_preset_trade: "0",
        is_predefined: false,
        volume_factor: input.volume_factor || 1,
        created_at: now,
        updated_at: now,
      } as ConnectionV2

      await createConnection(conn.id, conn)
      console.log("[v0] Connection created:", conn.id)
      return conn
    } catch (error) {
      console.error("[v0] Failed to create connection:", error)
      await SystemLogger.logError(error, "connection-manager-v2", "createConnection")
      return null
    }
  }

  /**
   * Update a connection
   */
  async updateConnection(id: string, input: ConnectionUpdateInput): Promise<ConnectionV2 | null> {
    try {
      await this.initialize()
      const conn = await getConnection(id)

      if (!conn) {
        throw new Error(`Connection not found: ${id}`)
      }

      const updated = {
        ...conn,
        ...input,
        updated_at: new Date().toISOString(),
      }

      await updateConnection(id, updated)
      console.log("[v0] Connection updated:", id)
      return updated as ConnectionV2
    } catch (error) {
      console.error("[v0] Failed to update connection:", error)
      await SystemLogger.logError(error, "connection-manager-v2", `updateConnection(${id})`)
      return null
    }
  }

  /**
   * Delete a connection
   */
  async deleteConnection(id: string): Promise<boolean> {
    try {
      await this.initialize()
      await deleteConnection(id)
      console.log("[v0] Connection deleted:", id)
      return true
    } catch (error) {
      console.error("[v0] Failed to delete connection:", error)
      await SystemLogger.logError(error, "connection-manager-v2", `deleteConnection(${id})`)
      return false
    }
  }

  /**
   * Get connections by exchange
   */
  async getConnectionsByExchange(exchange: string): Promise<ConnectionV2[]> {
    try {
      await this.initialize()
      const all = await getAllConnections()
      return all.filter(c => c.exchange === exchange) as ConnectionV2[]
    } catch (error) {
      console.error("[v0] Failed to get connections by exchange:", error)
      return []
    }
  }

  /**
   * Get enabled connections only
   */
  async getEnabledConnections(): Promise<ConnectionV2[]> {
    try {
      await this.initialize()
      const all = await getAllConnections()
      return all.filter(c => c.is_enabled === "1" || c.is_enabled === true) as ConnectionV2[]
    } catch (error) {
      console.error("[v0] Failed to get enabled connections:", error)
      return []
    }
  }

  /**
   * Get active dashboard connections
   */
  async getActiveConnections(): Promise<ConnectionV2[]> {
    try {
      await this.initialize()
      const all = await getAllConnections()
      return all.filter(c => c.is_enabled_dashboard === "1" || c.is_enabled_dashboard === true) as ConnectionV2[]
    } catch (error) {
      console.error("[v0] Failed to get active connections:", error)
      return []
    }
  }
}

export interface ConnectionValidationResult {
  isValid: boolean
  errors: string[]
  warnings?: string[]
}

/**
 * ConnectionManager v2 - Singleton pattern for connection management
 */
class ConnectionManagerV2 {
  private static instance: ConnectionManagerV2

  private constructor() {}

  static getInstance(): ConnectionManagerV2 {
    if (!ConnectionManagerV2.instance) {
      ConnectionManagerV2.instance = new ConnectionManagerV2()
    }
    return ConnectionManagerV2.instance
  }

  /**
   * Get all connections
   */
  getAllConnections(): ConnectionV2[] {
    try {
      const connections = loadConnections() as any
      return Array.isArray(connections)
        ? connections.map((c: any) => ({
            ...c,
            authentication_type: c.authentication_type || "api_key_secret",
          } as ConnectionV2))
        : []
    } catch (error) {
      console.error("[v0] [ConnectionManager] Failed to load connections:", error)
      return []
    }
  }

  /**
   * Get connection by ID
   */
  getConnectionById(id: string): ConnectionV2 | null {
    const connections = this.getAllConnections()
    return connections.find((c) => c.id === id) || null
  }

  /**
   * Get active connections
   */
  getActiveConnections(): ConnectionV2[] {
    const connections = this.getAllConnections()
    return connections.filter((c) => c.is_active && c.is_enabled)
  }

  /**
   * Get enabled connections
   */
  getEnabledConnections(): ConnectionV2[] {
    const connections = this.getAllConnections()
    return connections.filter((c) => c.is_enabled)
  }

  /**
   * Create new connection
   */
  async createConnection(input: ConnectionCreateInput): Promise<ConnectionV2> {
    // Validate input
    const validation = this.validateConnection(input)
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(", ")}`)
    }

    const connections = this.getAllConnections()
    const newConnection: ConnectionV2 = {
      id: `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...input,
      is_enabled: true,
      is_active: true,
      is_live_trade: false,
      is_predefined: false,
      connection_library: input.connection_method === "rest" ? "rest" : "library",
      authentication_type: "api_key_secret",
      volume_factor: input.volume_factor || 1.0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    connections.push(newConnection)
    saveConnections(connections as any)

    await SystemLogger.logConnection(`Connection created: ${newConnection.name}`, newConnection.id, "info", {
      exchange: newConnection.exchange,
    })

    return newConnection
  }

  /**
   * Update connection
   */
  async updateConnection(id: string, input: ConnectionUpdateInput): Promise<ConnectionV2> {
    const connections = this.getAllConnections()
    const index = connections.findIndex((c) => c.id === id)

    if (index === -1) {
      throw new Error(`Connection not found: ${id}`)
    }

    const current = connections[index]

    // Validate update input
    const validation = this.validateConnection({ ...current, ...input })
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(", ")}`)
    }

    const updated: ConnectionV2 = {
      ...current,
      ...input,
      id: current.id,
      created_at: current.created_at,
      updated_at: new Date().toISOString(),
    }

    connections[index] = updated
    saveConnections(connections as any)

    await SystemLogger.logConnection(`Connection updated: ${updated.name}`, id, "info")

    return updated
  }

  /**
   * Delete connection (mark as inactive)
   */
  async deleteConnection(id: string): Promise<void> {
    const connections = this.getAllConnections()
    const index = connections.findIndex((c) => c.id === id)

    if (index === -1) {
      throw new Error(`Connection not found: ${id}`)
    }

    connections[index].is_active = false
    connections[index].updated_at = new Date().toISOString()

    saveConnections(connections as any)

    await SystemLogger.logConnection(`Connection deleted: ${connections[index].name}`, id, "info")
  }

  /**
   * Toggle connection enabled status
   */
  async toggleConnection(id: string): Promise<ConnectionV2> {
    const connection = this.getConnectionById(id)

    if (!connection) {
      throw new Error(`Connection not found: ${id}`)
    }

    return this.updateConnection(id, {
      is_enabled: !connection.is_enabled,
    })
  }

  /**
   * Activate connection for live trading
   */
  async activateConnection(id: string): Promise<ConnectionV2> {
    const connection = this.getConnectionById(id)

    if (!connection) {
      throw new Error(`Connection not found: ${id}`)
    }

    if (!connection.is_enabled) {
      throw new Error(`Cannot activate disabled connection: ${id}`)
    }

    return this.updateConnection(id, {
      is_active: true,
    })
  }

  /**
   * Deactivate connection
   */
  async deactivateConnection(id: string): Promise<ConnectionV2> {
    const connection = this.getConnectionById(id)

    if (!connection) {
      throw new Error(`Connection not found: ${id}`)
    }

    return this.updateConnection(id, {
      is_active: false,
    })
  }

  /**
   * Update connection test status
   */
  async updateTestStatus(
    id: string,
    status: "success" | "failed" | "warning",
    log: string[],
    balance?: number
  ): Promise<ConnectionV2> {
    const connections = this.getAllConnections()
    const index = connections.findIndex((c) => c.id === id)

    if (index === -1) {
      throw new Error(`Connection not found: ${id}`)
    }

    connections[index].last_test_status = status
    connections[index].last_test_log = log
    connections[index].last_test_at = new Date().toISOString()
    if (balance !== undefined) {
      connections[index].last_test_balance = balance
    }
    connections[index].updated_at = new Date().toISOString()

    saveConnections(connections as any)

    return connections[index]
  }

  /**
   * Validate connection data
   */
  private validateConnection(data: any): ConnectionValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // Required fields
    if (!data.name?.trim()) errors.push("Name is required")
    if (!data.exchange?.trim()) errors.push("Exchange is required")
    if (!data.api_key?.trim()) errors.push("API Key is required")
    if (!data.api_secret?.trim()) errors.push("API Secret is required")

    // Field validation
    if (data.name && data.name.length < 2) errors.push("Name must be at least 2 characters")
    if (data.name && data.name.length > 100) errors.push("Name must be less than 100 characters")

    if (!["spot", "perpetual_futures", "inverse_futures"].includes(data.api_type)) {
      errors.push("Invalid API type")
    }

    if (!["rest", "websocket", "hybrid"].includes(data.connection_method)) {
      errors.push("Invalid connection method")
    }

    if (!["isolated", "cross"].includes(data.margin_type)) {
      errors.push("Invalid margin type")
    }

    if (!["one_way", "hedge"].includes(data.position_mode)) {
      errors.push("Invalid position mode")
    }

    if (typeof data.volume_factor !== "number" || data.volume_factor <= 0) {
      errors.push("Volume factor must be a positive number")
    }

    // Placeholder warnings
    if (data.api_key?.includes("PLACEHOLDER")) {
      warnings.push("API key appears to be a placeholder")
    }

    if (data.api_secret?.includes("PLACEHOLDER")) {
      warnings.push("API secret appears to be a placeholder")
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    }
  }

  /**
   * Get connection statistics
   */
  getStatistics() {
    const connections = this.getAllConnections()
    return {
      total: connections.length,
      enabled: connections.filter((c) => c.is_enabled).length,
      active: connections.filter((c) => c.is_active).length,
      testnet: connections.filter((c) => c.is_testnet).length,
      byExchange: this.groupByExchange(connections),
    }
  }

  /**
   * Group connections by exchange
   */
  private groupByExchange(connections: ConnectionV2[]) {
    const grouped: Record<string, number> = {}
    connections.forEach((c) => {
      grouped[c.exchange] = (grouped[c.exchange] || 0) + 1
    })
    return grouped
  }
}

export const connectionManager = ConnectionManagerV2.getInstance()
export default ConnectionManagerV2
