import { getRedisClient } from "./redis-db"

export type LogLevel = "info" | "warn" | "error" | "debug"
export type LogCategory =
  | "system"
  | "trading"
  | "strategy"
  | "connection"
  | "indication"
  | "database"
  | "api"
  | "nextjs"
  | "build"
  | "runtime"
  | "errors"

interface SiteLogEntry {
  level: LogLevel
  category: string
  message: string
  details?: string
  stack?: string
  metadata?: Record<string, any>
}

class Logger {
  private static instance: Logger

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  private async getRedisClient() {
    return getRedisClient()
  }

  private async pushLog(category: string, data: any): Promise<void> {
    const client = await this.getRedisClient()
    const key = `logs:${category}`
    const serialized = JSON.stringify(data)
    await client.lpush(key, serialized)
    
    // Keep only last 1000 entries per list
    await client.ltrim(key, 0, 999)
  }

  public async log(level: LogLevel, category: LogCategory, message: string, details?: any) {
    const timestamp = new Date().toISOString()
    const detailsStr = details ? JSON.stringify(details) : undefined
    
    console.log(`[${timestamp}] [${level.toUpperCase()}] [${category}] ${message}`, detailsStr)

    try {
      await this.pushLog(category, {
        level,
        category,
        message,
        details: detailsStr,
        timestamp,
      })
    } catch (error) {
      console.error("Failed to write log to Redis:", error)
    }
  }

  public async info(category: LogCategory, message: string, details?: any) {
    await this.log("info", category, message, details)
  }

  public async warn(category: LogCategory, message: string, details?: any) {
    await this.log("warn", category, message, details)
  }

  public async error(category: LogCategory, message: string, error?: Error, context?: any) {
    await this.log("error", category, message, { error: error?.message, context })

    try {
      await this.pushLog("errors", {
        level: "error",
        category,
        message,
        error: error?.message,
        name: error?.name,
        stack: error?.stack,
        context,
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      console.error("Failed to write error to Redis:", err)
    }
  }

  public async debug(category: LogCategory, message: string, details?: any) {
    await this.log("debug", category, message, details)
  }

  public async logSite(entry: SiteLogEntry) {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] [SITE] [${entry.level.toUpperCase()}] [${entry.category}] ${entry.message}`)

    try {
      const logData = {
        level: entry.level,
        category: entry.category,
        message: entry.message,
        details: entry.details || null,
        stack: entry.stack || null,
        metadata: entry.metadata,
        timestamp,
      }
      
      await this.pushLog(entry.category, logData)
      
      if (entry.level === "error") {
        await this.pushLog("errors", logData)
      }
    } catch (error) {
      console.error("[v0] Failed to write site log to Redis:", error)
    }
  }

  public async logNextError(error: Error, context?: { route?: string; method?: string; userId?: string }) {
    await this.logSite({
      level: "error",
      category: "nextjs",
      message: error.message,
      stack: error.stack,
      metadata: {
        name: error.name,
        ...context,
        timestamp: new Date().toISOString(),
      },
    })
  }

  public async logBuildError(message: string, details?: any) {
    await this.logSite({
      level: "error",
      category: "build",
      message,
      details: typeof details === "string" ? details : JSON.stringify(details),
    })
  }

  public async logRuntimeError(error: Error, context?: Record<string, any>) {
    await this.logSite({
      level: "error",
      category: "runtime",
      message: error.message,
      stack: error.stack,
      metadata: {
        name: error.name,
        ...context,
      },
    })
  }

  public async getLogs(category?: LogCategory, limit: number = 100): Promise<any[]> {
    const client = await this.getRedisClient()
    const key = category ? `logs:${category}` : undefined
    
    if (key) {
      const data = await client.lrange(key, 0, limit - 1)
      return data.map(item => JSON.parse(item)).reverse()
    } else {
      const allLogs: any[] = []
      const categories: LogCategory[] = ["system", "trading", "strategy", "connection", "indication", "database", "api", "nextjs", "build", "runtime"]
      
      for (const cat of categories) {
        const data = await client.lrange(`logs:${cat}`, 0, 49)
        allLogs.push(...data.map(item => JSON.parse(item)))
      }
      
      allLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      return allLogs.slice(0, limit)
    }
  }

  public async getErrors(limit: number = 100): Promise<any[]> {
    const client = await this.getRedisClient()
    const data = await client.lrange("logs:errors", 0, limit - 1)
    return data.map(item => JSON.parse(item)).reverse()
  }

  public async clearLogs(category?: LogCategory): Promise<void> {
    const client = await this.getRedisClient()
    if (category) {
      await client.del(`logs:${category}`)
    } else {
      const categories: LogCategory[] = ["system", "trading", "strategy", "connection", "indication", "database", "api", "nextjs", "build", "runtime", "errors"]
      for (const cat of categories) {
        await client.del(`logs:${cat}`)
      }
    }
  }
}

export default Logger
