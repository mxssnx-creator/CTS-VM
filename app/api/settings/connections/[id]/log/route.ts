import { type NextRequest, NextResponse } from "next/server"
import { getRedisClient } from "@/lib/redis-db"

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

    return NextResponse.json({
      connection: connection || null,
      logs: logs || [],
      summary: {
        total: logs.length,
        errors: logs.filter((l: any) => l.level === "error").length,
        warnings: logs.filter((l: any) => l.level === "warn").length,
        info: logs.filter((l: any) => l.level === "info").length,
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
