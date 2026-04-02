import { NextResponse } from "next/server"
import { getRedisClient, initRedis } from "@/lib/redis-db"

export async function POST() {
  try {
    await initRedis()
    const client = getRedisClient()

    // Export settings from Redis keys
    const settingsKeys = await client.keys("settings:*") || []
    const settings = []
    for (const key of settingsKeys) {
      const value = await client.get(key)
      if (value) {
        const settingKey = key.replace("settings:", "")
        try {
          const parsedValue = JSON.parse(value)
          settings.push({
            key: settingKey,
            value: parsedValue,
            category: "general",
            subcategory: "",
            description: ""
          })
        } catch {
          settings.push({
            key: settingKey,
            value: value,
            category: "general",
            subcategory: "",
            description: ""
          })
        }
      }
    }

    // Export connections from Redis
    const connIds = await client.smembers("connections") || []
    const connections = []
    for (const id of connIds) {
      const conn = await client.hgetall(`connection:${id}`)
      if (conn) {
        connections.push({
          id: conn.id,
          name: conn.name,
          exchange: conn.exchange,
          api_type: conn.api_type || "standard",
          connection_method: conn.connection_method || "api",
          margin_mode: conn.margin_mode || "isolated",
          position_type: conn.position_type || "both",
          testnet: conn.is_testnet === "1" || conn.is_testnet === true,
          is_active: conn.is_enabled === "1" || conn.is_enabled === true,
          settings: conn.settings ? JSON.parse(conn.settings as string) : {},
          created_at: conn.created_at,
          updated_at: conn.updated_at
        })
      }
    }

    const exportData = {
      version: "1.0.0",
      exported_at: new Date().toISOString(),
      project: "cts-v3",
      settings: settings,
      connections: connections.map((c) => ({
        name: c.name,
        exchange: c.exchange,
        api_type: c.api_type,
        connection_method: c.connection_method,
        margin_mode: c.margin_mode,
        position_type: c.position_type,
        testnet: c.testnet,
        settings: c.settings,
        // Note: API keys are NOT exported for security
      })),
    }

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="cts-v3-config-${new Date().toISOString().split("T")[0]}.json"`,
      },
    })
  } catch (error) {
    console.error("[v0] Export failed:", error)
    return NextResponse.json({ error: "Export failed" }, { status: 500 })
  }
}
