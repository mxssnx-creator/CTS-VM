/**
 * Engine Progression Logs - Stores detailed logs of all engine operations
 * Uses simple Redis lists (not sorted sets) for compatibility
 * 
 * Redis TTL Policy: 24 hours (86400 seconds)
 * Max entries per connection: 500
 * Uses in-memory buffering with controlled flush interval
 */

import { getRedisClient } from "@/lib/redis-db"

export interface ProgressionLogEntry {
  timestamp: string
  level: "info" | "warning" | "error" | "debug"
  phase: string
  message: string
  details?: Record<string, any>
  connectionId: string
}

const LOG_TTL_SECONDS = 86400 // 24 hours
const MAX_LOGS_PER_CONNECTION = 500
const BUFFER_FLUSH_SIZE = 10
const BUFFER_FLUSH_INTERVAL = 3000

const logBuffer: Map<string, string[]> = new Map()
let flushTimer: ReturnType<typeof setInterval> | null = null
let isFlushing = false

const IMMEDIATE_FLUSH_PHASES = [
  "initializing", "prehistoric_data", "indications", "strategies", 
  "realtime", "live_trading", "error", "engine_started", "engine_stopped",
  "engine_starting", "engine_error", "quickstart"
]

function ensureFlushTimer() {
  if (flushTimer) return
  flushTimer = setInterval(() => {
    if (!isFlushing) {
      flushAllLogBuffers()
    }
  }, BUFFER_FLUSH_INTERVAL)
  if (typeof flushTimer.unref === 'function') {
    (flushTimer as any).unref()
  }
}

export async function logProgressionEvent(
  connectionId: string,
  phase: string,
  level: "info" | "warning" | "error" | "debug",
  message: string,
  details?: Record<string, any>
): Promise<void> {
  try {
    const timestamp = new Date().toISOString()
    const logKey = `engine_logs:${connectionId}`
    
    const logEntry = `${timestamp}|${level}|${phase}|${message}|${JSON.stringify(details || {})}`
    
    if (!logBuffer.has(logKey)) {
      logBuffer.set(logKey, [])
    }
    const buffer = logBuffer.get(logKey)!
    buffer.push(logEntry)
    
    ensureFlushTimer()
    
    const isImportant = IMMEDIATE_FLUSH_PHASES.some(p => phase.includes(p)) || level === "error" || level === "warning"
    if (isImportant || buffer.length >= BUFFER_FLUSH_SIZE) {
      await flushLogBuffer(logKey)
    }

    if (level === "error" || level === "warning" || isImportant) {
      console.log(`[v0] [${level.toUpperCase()}] [${phase}] ${message}`, details ? JSON.stringify(details).slice(0, 200) : "")
    }
  } catch (error) {
    console.error("[v0] [LogError] Failed to log:", error)
  }
}

async function flushLogBuffer(logKey: string): Promise<void> {
  const buffer = logBuffer.get(logKey)
  if (!buffer || buffer.length === 0) return
  
  const toFlush = [...buffer]
  logBuffer.set(logKey, [])
  
  try {
    isFlushing = true
    const client = getRedisClient()
    
    await client.lpush(logKey, ...toFlush.reverse())
    await client.ltrim(logKey, 0, MAX_LOGS_PER_CONNECTION - 1)
    await client.expire(logKey, LOG_TTL_SECONDS)
  } catch (error) {
    const currentBuffer = logBuffer.get(logKey) || []
    logBuffer.set(logKey, [...toFlush, ...currentBuffer])
  } finally {
    isFlushing = false
  }
}

export async function flushAllLogBuffers(): Promise<void> {
  const keys = Array.from(logBuffer.keys())
  await Promise.all(keys.map(key => flushLogBuffer(key).catch(() => {})))
}

export async function forceFlushLogs(connectionId: string): Promise<void> {
  const logKey = `engine_logs:${connectionId}`
  await flushLogBuffer(logKey)
}

export async function getProgressionLogs(connectionId: string): Promise<ProgressionLogEntry[]> {
  try {
    const client = getRedisClient()
    const logKey = `engine_logs:${connectionId}`

    const logs = await client.lrange(logKey, 0, MAX_LOGS_PER_CONNECTION - 1)
    if (!logs || logs.length === 0) return []

    return logs
      .map((entry) => {
        try {
          const parts = entry.split("|")
          if (parts.length < 4) return null
          
          const [timestamp, level, phase, message, ...detailsParts] = parts
          const detailsJson = detailsParts.join("|")
          let details: Record<string, any> = {}
          try {
            details = JSON.parse(detailsJson || "{}")
          } catch {
            details = {}
          }
          
          return {
            timestamp,
            level: (level as any) || "info",
            phase,
            message,
            details,
            connectionId,
          } as ProgressionLogEntry
        } catch {
          return null
        }
      })
      .filter((entry): entry is ProgressionLogEntry => entry !== null)
  } catch (error) {
    console.error("[v0] [EngineLog] Failed to retrieve logs:", error instanceof Error ? error.message : String(error))
    return []
  }
}

export async function clearProgressionLogs(connectionId: string): Promise<void> {
  try {
    const client = getRedisClient()
    const logKey = `engine_logs:${connectionId}`
    await client.del(logKey)
  } catch (error) {
    console.error("[v0] [EngineLog] Failed to clear logs:", error instanceof Error ? error.message : String(error))
  }
}

export function formatLogsForDisplay(logs: ProgressionLogEntry[]): string {
  if (logs.length === 0) {
    return "No logs yet. Enable the connection to start logging."
  }

  return logs
    .map((log) => {
      const time = new Date(log.timestamp).toLocaleTimeString()
      const level = log.level.toUpperCase().padEnd(7)
      const details = log.details && Object.keys(log.details).length > 0 ? ` | ${JSON.stringify(log.details)}` : ""
      return `[${time}] ${level} | ${log.phase.padEnd(20)} | ${log.message}${details}`
    })
    .join("\n")
}
