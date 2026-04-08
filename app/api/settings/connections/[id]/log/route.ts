import { type NextRequest, NextResponse } from "next/server"
import { getRedisClient } from "@/lib/redis-db"
import { getProgressionLogs } from "@/lib/engine-progression-logs"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const client = getRedisClient()

    // Get connection info from hash
    const connection = await client.hgetall(`connection:${id}`)

    // Get logs from list (most recent first)
    // Using LPUSH to add newest to head, LRANGE to get latest
    const logKeys = await client.lrange(`logs:connection:${id}`, 0, 99) // Get up to 100 most recent

     // Fetch all log entries
     const logs = []
     for (const logKey of logKeys) {
       const logData = await client.hgetall(logKey)
       if (logData && Object.keys(logData).length > 0) {
         // Parse metadata safely
         let metadata: any = undefined
         if (logData.metadata) {
           try {
             metadata = JSON.parse(logData.metadata)
           } catch {
             metadata = {}
           }
         }
         // Extract connection_id from metadata if present
         const connectionId = metadata?.connectionId || id
         logs.push({
           id: logData.id || logKey,
           timestamp: logData.timestamp || "",
           level: logData.level || "info",
           category: logData.category || "",
           message: logData.message || "",
           metadata,
           connection_id: connectionId,
         })
       }
     }

    // Also fetch progression logs (including quickstart logs)
    const progressionLogs = await getProgressionLogs(id)
    const progressionLogEntries = progressionLogs.map(log => ({
      id: `prog-${log.timestamp}-${Math.random()}`,
      timestamp: log.timestamp,
      level: log.level,
      category: log.phase || "progression",
      message: log.message,
      metadata: {
        phase: log.phase,
        details: log.details,
      },
      connection_id: id,
    }))

    // Combine and sort logs by timestamp (newest first)
    const allLogs = [...logs, ...progressionLogEntries].sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    return NextResponse.json({
      connection: connection || null,
      logs: allLogs || [],
      summary: {
        total: allLogs.length,
        errors: allLogs.filter((l: any) => l.level === "error").length,
        warnings: allLogs.filter((l: any) => l.level === "warn" || l.level === "warning").length,
        info: allLogs.filter((l: any) => l.level === "info").length,
        debug: allLogs.filter((l: any) => l.level === "debug").length,
      },
    })
  } catch (error) {
    console.error("[v0] Error fetching connection logs:", error)
    return NextResponse.json(
      { error: "Failed to fetch connection logs", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
