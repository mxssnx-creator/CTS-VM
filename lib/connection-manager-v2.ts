/**
 * ConnectionManager v2 - Modern Connection Management with Redis Storage
 * Handles all connection CRUD operations, validation, and lifecycle management via Redis
 */

import { initRedis, getAllConnections, getConnection, updateConnection, createConnection, deleteConnection } from "@/lib/redis-db"
import { SystemLogger } from "@/lib/system-logger"

// Modern Connection Types with v2 Schema (matches Redis storage)
export interface ConnectionV2 {
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
      console.log("[v0] ConnectionManagerV2 initialized")
    } catch (error) {
      console.error("[v0] Failed to initialize ConnectionManagerV2:", error)
      throw error
    }
  }

  /**
   * Get all connections
   */
  async getAllConnections(): Promise<ConnectionV2[]> {
    try {
      await this.initialize()
      return await getAllConnections()
    } catch (error) {
      console.error("[v0] Failed to get all connections:", error)
      return []
    }
  }

  /**
   * Get connection by ID
   */
  async getConnection(id: string): Promise<ConnectionV2 | null> {
    try {
      await this.initialize()
      return await getConnection(id)
    } catch (error) {
      console.error("[v0] Failed to get connection:", error)
      return null
    }
  }

  /**
   * Create new connection
   */
  async createConnection(input: ConnectionCreateInput): Promise<ConnectionV2 | null> {
    try {
      await this.initialize()
      const conn: ConnectionV2 = {
        id: input.id || `${input.exchange}-${Date.now()}`,
        name: input.name,
        exchange: input.exchange,
        api_type: input.api_type || "perpetual_futures",
        connection_method: input.connection_method || "library",
        connection_library: "library",
        authentication_type: "api_key_secret",
        api_key: input.api_key,
        api_secret: input.api_secret,
        api_passphrase: input.api_passphrase,
        margin_type: input.margin_type || "cross",
        position_mode: input.position_mode || "hedge",
        is_testnet: input.is_testnet || false,
        is_enabled: input.is_enabled || false,
        is_enabled_dashboard: "0",
        is_live_trade: "0",
        is_preset_trade: "0",
        is_predefined: false,
        volume_factor: input.volume_factor || 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      await createConnection(conn.id, conn)
      await SystemLogger.logConnection(`Connection created: ${conn.name}`, conn.id, "info")
      return conn
    } catch (error) {
      console.error("[v0] Failed to create connection:", error)
      await SystemLogger.logError(error, "connection-manager-v2", "createConnection")
      return null
    }
  }

  /**
   * Update connection
   */
  async updateConnection(id: string, updates: Partial<ConnectionV2>): Promise<boolean> {
    try {
      await this.initialize()
      const existing = await this.getConnection(id)
      if (!existing) return false

      const updated = { ...existing, ...updates, updated_at: new Date().toISOString() }
      await updateConnection(id, updated)
      await SystemLogger.logConnection(`Connection updated: ${existing.name}`, id, "info")
      return true
    } catch (error) {
      console.error("[v0] Failed to update connection:", error)
      await SystemLogger.logError(error, "connection-manager-v2", "updateConnection")
      return false
    }
  }

  /**
   * Delete connection
   */
  async deleteConnection(id: string): Promise<boolean> {
    try {
      await this.initialize()
      const existing = await this.getConnection(id)
      if (!existing) return false

      await deleteConnection(id)
      await SystemLogger.logConnection(`Connection deleted: ${existing.name}`, id, "info")
      return true
    } catch (error) {
      console.error("[v0] Failed to delete connection:", error)
      await SystemLogger.logError(error, "connection-manager-v2", "deleteConnection")
      return false
    }
  }

  /**
   * Get enabled connections
   */
  async getEnabledConnections(): Promise<ConnectionV2[]> {
    try {
      await this.initialize()
      const all = await this.getAllConnections()
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
      const all = await this.getAllConnections()
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

export const connectionManager = ConnectionManagerV2.getInstance()
export default ConnectionManagerV2