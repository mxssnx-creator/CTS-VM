import { getRedisClient } from "./redis-db"

interface LogEntry {
  timestamp: string
  level: "info" | "warn" | "error"
  category: string
  message: string
  metadata?: Record<string, any>
}

export class SystemLogger {
  static async logToDatabase(entry: LogEntry): Promise<void> {
    try {
      const client = getRedisClient()
      const logId = `log:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`
      const logKey = logId

      const logEntry = {
        id: logId,
        timestamp: entry.timestamp,
        level: entry.level,
        category: entry.category,
        message: entry.message,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : "",
      }

      // Store log entry using lowercase hset (pass object directly)
      await client.hset(logKey, logEntry)

      // Add to logs index set
      await client.sadd("logs:all", logId)

      // Add to category index
      await client.sadd(`logs:${entry.category}`, logId)

      // If this log is associated with a connection, add to connection-specific list
      if (entry.metadata?.connectionId) {
        const connectionId = entry.metadata.connectionId
        await client.lpush(`logs:connection:${connectionId}`, logId)
        // Trim list to keep only the most recent 1000 logs per connection
        await client.ltrim(`logs:connection:${connectionId}`, 0, 999)
      }

      // Set TTL for logs (7 days = 604800 seconds)
      await client.expire(logKey, 604800)
    } catch (error) {
      console.error("[SystemLogger] Failed to log to database:", error)
    }
  }

  static async logAPI(message: string, level: "info" | "warn" | "error" = "info", endpoint?: string, data?: any): Promise<void> {
    await this.logToDatabase({
      timestamp: new Date().toISOString(),
      level,
      category: "api",
      message,
      metadata: { endpoint, ...data },
    })
  }

  static async logConnection(message: string, connectionId?: string, level: "info" | "warn" | "error" = "info", data?: any): Promise<void> {
    await this.logToDatabase({
      timestamp: new Date().toISOString(),
      level,
      category: "connections",
      message,
      metadata: { connectionId, ...data },
    })
  }

  static async logTradeEngine(message: string, data?: any): Promise<void> {
    await this.logToDatabase({
      timestamp: new Date().toISOString(),
      level: "info",
      category: "trade_engine",
      message,
      metadata: data,
    })
  }

  static async logTrade(message: string, tradeData?: any): Promise<void> {
    await this.logToDatabase({
      timestamp: new Date().toISOString(),
      level: "info",
      category: "trades",
      message,
      metadata: tradeData,
    })
  }

  static async logPosition(message: string, positionData?: any): Promise<void> {
    await this.logToDatabase({
      timestamp: new Date().toISOString(),
      level: "info",
      category: "positions",
      message,
      metadata: positionData,
    })
  }

  static async logError(category: string, error: any, context?: any): Promise<void> {
    await this.logToDatabase({
      timestamp: new Date().toISOString(),
      level: "error",
      category,
      message: error instanceof Error ? error.message : String(error),
      metadata: { ...context, stack: error instanceof Error ? error.stack : undefined },
    })
  }

  static async logWarning(category: string, message: string, data?: any): Promise<void> {
    await this.logToDatabase({
      timestamp: new Date().toISOString(),
      level: "warn",
      category,
      message,
      metadata: data,
    })
  }

  static async getLogs(
    category?: string,
    limit: number = 100,
  ): Promise<LogEntry[]> {
    try {
      const client = getRedisClient()
      const key = category ? `logs:${category}` : "logs:all"
      const logIds = (await client.smembers(key)) || []

      const logs: LogEntry[] = []
      for (const logId of logIds.slice(-limit)) {
        const logData = await client.hgetall(logId)
        if (logData && Object.keys(logData).length > 0) {
          logs.push({
            timestamp: logData.timestamp || "",
            level: (logData.level as any) || "info",
            category: logData.category || "",
            message: logData.message || "",
            metadata: logData.metadata ? JSON.parse(logData.metadata) : undefined,
          })
        }
      }
      return logs
    } catch (error) {
      console.error("[SystemLogger] Failed to retrieve logs:", error)
      return []
    }
  }

  static async clearLogs(category?: string): Promise<void> {
    try {
      const client = getRedisClient()
      const key = category ? `logs:${category}` : "logs:all"
      const logIds = (await client.smembers(key)) || []

      for (const logId of logIds) {
        await client.del(logId)
      }

      await client.del(key)
      console.log(`[SystemLogger] Cleared logs for category: ${category || "all"}`)
    } catch (error) {
      console.error("[SystemLogger] Failed to clear logs:", error)
    }
  }
}
