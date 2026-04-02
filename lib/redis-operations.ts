import { getRedisClient } from "./redis-db"

const TTL = {
  CONNECTION: 0,
  TRADE: 604800,
  POSITION: 604800,
  CACHE_DEFAULT: 300,
  MONITORING_EVENT: 2592000,
  SNAPSHOT: 2592000,
  PRESET: 0,
  PRESET_TYPE: 0,
  INDEX_SET: 2592000,
} as const

export const RedisConnections = {
  async createConnection(conn: any) {
    const client = getRedisClient()
    const key = `connection:${conn.id}`
    const data: Record<string, string> = {
      id: conn.id,
      name: conn.name,
      exchange: conn.exchange,
      api_key: conn.api_key || "",
      api_secret: conn.api_secret || "",
      is_enabled: conn.is_enabled ? "1" : "0",
      is_active: conn.is_active ? "1" : "0",
      created_at: new Date().toISOString(),
    }
    const args: string[] = []
    for (const [k, v] of Object.entries(data)) {
      args.push(k, v)
    }
    await client.hmset(key, ...args)
    await client.sadd("connections:all", conn.id)
    if (TTL.INDEX_SET > 0) await client.expire("connections:all", TTL.INDEX_SET)
    return conn
  },

  async getConnection(id: string) {
    const client = getRedisClient()
    const data = await client.hgetall(`connection:${id}`)
    return data && Object.keys(data).length > 0 ? data : null
  },

  async getAllConnections() {
    const client = getRedisClient()
    const ids = (await client.smembers("connections:all")) || []
    const connections = []
    for (const id of ids) {
      const conn = await this.getConnection(id)
      if (conn) connections.push(conn)
    }
    return connections
  },

  async updateConnection(id: string, updates: any) {
    const client = getRedisClient()
    const key = `connection:${id}`
    const existing = await this.getConnection(id)
    if (!existing) return null

    const updatedData = { ...existing, ...updates }
    await client.hset(key, updatedData)
    return updatedData
  },

  async deleteConnection(id: string) {
    const client = getRedisClient()
    const connection = await this.getConnection(id)
    if (!connection) return null

    await client.del(`connection:${id}`)
    await client.srem("connections:all", id)
    return connection
  },
}

export const RedisTrades = {
  async createTrade(connId: string, trade: any) {
    const client = getRedisClient()
    const key = `trade:${trade.id}`
    await client.hset(key, trade)
    await client.expire(key, TTL.TRADE)
    await client.sadd(`trades:${connId}`, trade.id)
    await client.expire(`trades:${connId}`, TTL.INDEX_SET)
    await client.sadd("trades:all", trade.id)
    await client.expire("trades:all", TTL.INDEX_SET)
    return trade
  },

  async getTrade(tradeId: string) {
    const client = getRedisClient()
    return await client.hgetall(`trade:${tradeId}`)
  },

  async getTradesByConnection(connId: string) {
    const client = getRedisClient()
    const tradeIds = (await client.smembers(`trades:${connId}`)) || []
    const trades = []
    for (const id of tradeIds) {
      const trade = await this.getTrade(id)
      if (trade) trades.push(trade)
    }
    return trades
  },
}

export const RedisPositions = {
  async createPosition(connId: string, pos: any) {
    const client = getRedisClient()
    const key = `position:${pos.id}`
    await client.hset(key, pos)
    await client.expire(key, TTL.POSITION)
    await client.sadd(`positions:${connId}`, pos.id)
    await client.expire(`positions:${connId}`, TTL.INDEX_SET)
    await client.sadd("positions:all", pos.id)
    await client.expire("positions:all", TTL.INDEX_SET)
    return pos
  },

  async getPosition(posId: string) {
    const client = getRedisClient()
    return await client.hgetall(`position:${posId}`)
  },

  async getPositionsByConnection(connId: string) {
    const client = getRedisClient()
    const posIds = (await client.smembers(`positions:${connId}`)) || []
    const positions = []
    for (const id of posIds) {
      const pos = await this.getPosition(id)
      if (pos) positions.push(pos)
    }
    return positions
  },

  async updatePosition(id: string, updates: any) {
    const client = getRedisClient()
    const key = `position:${id}`
    const existing = await this.getPosition(id)
    if (!existing) return null

    const updatedData = { ...existing, ...updates }
    await client.hset(key, updatedData)
    await client.expire(key, TTL.POSITION)
    return updatedData
  },

  async deletePosition(id: string) {
    const client = getRedisClient()
    const position = await this.getPosition(id)
    if (!position) return null

    await client.del(`position:${id}`)
    await client.srem("positions:all", id)
    return position
  },
}

export const RedisCache = {
  async set(key: string, value: any, ttl?: number) {
    const client = getRedisClient()
    const cacheKey = `cache:${key}`
    const effectiveTtl = ttl || TTL.CACHE_DEFAULT
    await client.set(cacheKey, JSON.stringify(value), { EX: effectiveTtl })
  },

  async get(key: string) {
    const client = getRedisClient()
    const data = await client.get(`cache:${key}`)
    return data ? JSON.parse(data) : null
  },
}

export const RedisSettings = {
  async set(key: string, value: any) {
    const client = getRedisClient()
    await client.set(`settings:${key}`, JSON.stringify(value))
  },

  async get(key: string) {
    const client = getRedisClient()
    const data = await client.get(`settings:${key}`)
    return data ? JSON.parse(data) : null
  },

  async getAll() {
    const client = getRedisClient()
    const keys = await client.keys(`settings:*`)
    const settings: Record<string, any> = {}
    for (const key of keys) {
      const data = await client.get(key)
      if (data) {
        const settingKey = key.replace(/^settings:/, "")
        settings[settingKey] = JSON.parse(data)
      }
    }
    return settings
  },
}

export const RedisMonitoring = {
  async recordEvent(eventType: string, eventData?: any) {
    const client = getRedisClient()
    const eventId = `event:${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
    const data: Record<string, string> = {
      type: eventType,
      timestamp: new Date().toISOString(),
    }
    if (eventData && typeof eventData === "object") {
      for (const [k, v] of Object.entries(eventData)) {
        data[k] = String(v ?? "")
      }
    }
    const args: string[] = []
    for (const [k, v] of Object.entries(data)) {
      args.push(k, v)
    }
    await client.hmset(eventId, ...args)
    await client.sadd("monitoring:events", eventId)
    await client.expire("monitoring:events", TTL.INDEX_SET)
    await client.expire(eventId, TTL.MONITORING_EVENT)
  },

  async getStatistics() {
    const client = getRedisClient()
    const [connectionsCount, tradesCount, positionsCount] = await Promise.all([
      client.scard("connections:all").catch(() => 0),
      client.scard("trades:all").catch(() => 0),
      client.scard("positions:all").catch(() => 0),
    ])
    return {
      connections: connectionsCount,
      trades: tradesCount,
      positions: positionsCount,
      timestamp: Date.now(),
    }
  },
}

export const RedisBackup = {
  async createSnapshot(name: string) {
    const client = getRedisClient()
    const snapshotId = `snapshot:${Date.now()}`
    await client.hset(snapshotId, {
      id: snapshotId,
      name,
      created_at: new Date().toISOString(),
      status: "completed",
    })
    await client.expire(snapshotId, TTL.SNAPSHOT)
    await client.sadd("snapshots:all", snapshotId)
    await client.expire("snapshots:all", TTL.INDEX_SET)
    return snapshotId
  },

  async listSnapshots() {
    const client = getRedisClient()
    const snapshotIds = (await client.smembers("snapshots:all")) || []
    const snapshots = []
    for (const id of snapshotIds) {
      const snapshot = await client.hgetall(id)
      if (snapshot && Object.keys(snapshot).length > 0) snapshots.push(snapshot)
    }
    return snapshots
  },
}

export const RedisPresets = {
  async createPreset(preset: any) {
    const client = getRedisClient()
    const key = `preset:${preset.id}`
    await client.hset(key, preset)
    await client.sadd("presets:all", preset.id)
    await client.expire("presets:all", TTL.INDEX_SET)
    if (preset.is_active) {
      await client.sadd("presets:active", preset.id)
      await client.expire("presets:active", TTL.INDEX_SET)
    }
    if (preset.is_predefined) {
      await client.sadd("presets:predefined", preset.id)
      await client.expire("presets:predefined", TTL.INDEX_SET)
    }
    return preset
  },

  async getPreset(id: string) {
    const client = getRedisClient()
    const data = await client.hgetall(`preset:${id}`)
    return data && Object.keys(data).length > 0 ? data : null
  },

  async getAllPresets(activeOnly: boolean = false) {
    const client = getRedisClient()
    let ids: string[]
    if (activeOnly) {
      ids = (await client.smembers("presets:active")) || []
    } else {
      ids = (await client.smembers("presets:all")) || []
    }
    const presets = []
    for (const id of ids) {
      const preset = await this.getPreset(id)
      if (preset) presets.push(preset)
    }
    return presets
  },

  async updatePreset(id: string, updates: any) {
    const client = getRedisClient()
    const key = `preset:${id}`
    const existing = await this.getPreset(id)
    if (!existing) return null

    const updatedData = { ...existing, ...updates }
    await client.hset(key, updatedData)

    if (existing.is_active !== updatedData.is_active) {
      if (updatedData.is_active) {
        await client.sadd("presets:active", id)
        await client.expire("presets:active", TTL.INDEX_SET)
      } else {
        await client.srem("presets:active", id)
      }
    }

    if (existing.is_predefined !== updatedData.is_predefined) {
      if (updatedData.is_predefined) {
        await client.sadd("presets:predefined", id)
        await client.expire("presets:predefined", TTL.INDEX_SET)
      } else {
        await client.srem("presets:predefined", id)
      }
    }

    return updatedData
  },

  async deletePreset(id: string) {
    const client = getRedisClient()
    const preset = await this.getPreset(id)
    if (!preset) return null

    await client.del(`preset:${id}`)
    await client.srem("presets:all", id)
    await client.srem("presets:active", id)
    await client.srem("presets:predefined", id)

    return preset
  },
}

export const RedisPresetTypes = {
  async createPresetType(presetType: any) {
    const client = getRedisClient()
    const key = `preset_type:${presetType.id}`
    await client.hset(key, presetType)
    await client.sadd("preset_types:all", presetType.id)
    await client.expire("preset_types:all", TTL.INDEX_SET)
    if (presetType.is_active) {
      await client.sadd("preset_types:active", presetType.id)
      await client.expire("preset_types:active", TTL.INDEX_SET)
    }
    return presetType
  },

  async getPresetType(id: string) {
    const client = getRedisClient()
    const data = await client.hgetall(`preset_type:${id}`)
    return data && Object.keys(data).length > 0 ? data : null
  },

  async getAllPresetTypes(activeOnly: boolean = false) {
    const client = getRedisClient()
    let ids: string[]
    if (activeOnly) {
      ids = (await client.smembers("preset_types:active")) || []
    } else {
      ids = (await client.smembers("preset_types:all")) || []
    }
    const presetTypes = []
    for (const id of ids) {
      const presetType = await this.getPresetType(id)
      if (presetType) presetTypes.push(presetType)
    }
    return presetTypes
  },

  async updatePresetType(id: string, updates: any) {
    const client = getRedisClient()
    const key = `preset_type:${id}`
    const existing = await this.getPresetType(id)
    if (!existing) return null

    const updatedData = { ...existing, ...updates }
    await client.hset(key, updatedData)

    if (existing.is_active !== updatedData.is_active) {
      if (updatedData.is_active) {
        await client.sadd("preset_types:active", id)
        await client.expire("preset_types:active", TTL.INDEX_SET)
      } else {
        await client.srem("preset_types:active", id)
      }
    }

    return updatedData
  },

  async deletePresetType(id: string) {
    const client = getRedisClient()
    const presetType = await this.getPresetType(id)
    if (!presetType) return null

    await client.del(`preset_type:${id}`)
    await client.srem("preset_types:all", id)
    await client.srem("preset_types:active", id)

    return presetType
  },
}
