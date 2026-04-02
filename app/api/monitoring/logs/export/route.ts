import { NextResponse } from "next/server"
import { getRedisClient, initRedis } from "@/lib/redis-db"

export async function GET(request: Request) {
  try {
    await initRedis()
    const client = getRedisClient()

    const { searchParams } = new URL(request.url)
    const format = searchParams.get("format") || "json"
    const level = searchParams.get("level")
    const category = searchParams.get("category")
    const limit = Number.parseInt(searchParams.get("limit") || "1000")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    // Fetch logs from Redis lists
    const logKeys = ["logs:system", "logs:trading", "logs:errors"]
    const allLogs: any[] = []

    for (const key of logKeys) {
      const entries = await client.lrange(key, 0, -1) || []
      for (const entryStr of entries) {
        try {
          const log = JSON.parse(entryStr)
          log.id = log.id || `log-${allLogs.length + 1}`
          allLogs.push(log)
        } catch {
          // Skip malformed entries
        }
      }
    }

    // Apply filters
    let filteredLogs = allLogs

    if (level) {
      filteredLogs = filteredLogs.filter(log => log.level === level)
    }

    if (category) {
      filteredLogs = filteredLogs.filter(log => log.category === category)
    }

    if (startDate) {
      const start = new Date(startDate).getTime()
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp).getTime() >= start)
    }

    if (endDate) {
      const end = new Date(endDate).getTime()
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp).getTime() <= end)
    }

    // Sort by timestamp descending
    filteredLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // Apply limit
    const logs = filteredLogs.slice(0, limit)

    if (format === "csv") {
      const csv = [
        "ID,Timestamp,Level,Category,Message,Details,Stack",
        ...logs.map((log: any) =>
          [
            log.id,
            log.timestamp,
            log.level,
            log.category || "",
            `"${(log.message || "").replace(/"/g, '""')}"`,
            `"${(log.details || "").replace(/"/g, '""')}"`,
            `"${(log.stack || "").replace(/"/g, '""')}"`,
          ].join(","),
        ),
      ].join("\n")

      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="logs-${new Date().toISOString()}.csv"`,
        },
      })
    }

    return NextResponse.json({
      logs,
      meta: {
        count: logs.length,
        filters: { level, category, startDate, endDate },
        exportedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error("[v0] Error exporting logs:", error)
    return NextResponse.json({ error: "Failed to export logs" }, { status: 500 })
  }
}
