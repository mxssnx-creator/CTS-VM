import { type NextRequest, NextResponse } from "next/server"
import { getRedisClient, initRedis } from "@/lib/redis-db"

export async function POST(request: NextRequest) {
  try {
    await initRedis()
    const client = getRedisClient()

    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const content = await file.text()
    const importData = JSON.parse(content)

    if (!importData.version || !importData.settings) {
      return NextResponse.json({ error: "Invalid configuration file" }, { status: 400 })
    }

    let settingsCount = 0
    for (const setting of importData.settings) {
      const key = `settings:${setting.key}`
      const value = typeof setting.value === "string" ? setting.value : JSON.stringify(setting.value)
      await client.set(key, value)
      settingsCount++
    }

    let connectionsCount = 0
    if (importData.connections) {
      for (const conn of importData.connections) {
        // Check if connection exists by exchange+name - need to check all connections
        const connIds = await client.smembers("connections") || []
        let exists = false
        for (const id of connIds) {
          const existing = await client.hgetall(`connection:${id}`)
          if (existing && existing.exchange === conn.exchange && existing.name === conn.name) {
            exists = true
            break
          }
        }

        if (!exists) {
          const connId = `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
          const connData: Record<string, string> = {
            id: connId,
            name: conn.name,
            exchange: conn.exchange,
            api_type: conn.api_type || "standard",
            connection_method: conn.connection_method || "api",
            margin_mode: conn.margin_mode || "isolated",
            position_type: conn.position_type || "both",
            is_enabled: "0", // disabled by default
            is_active: "0",
            is_testnet: conn.testnet ? "1" : "0",
            settings: JSON.stringify(conn.settings || {}),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
          await client.hset(`connection:${connId}`, connData)
          await client.sadd("connections", connId)
          connectionsCount++
        }
      }
    }

    return NextResponse.json({
      success: true,
      settings_count: settingsCount,
      connections_count: connectionsCount,
      message: "Configuration imported successfully",
    })
  } catch (error) {
    console.error("[v0] Import failed:", error)
    return NextResponse.json({ error: "Import failed" }, { status: 500 })
  }
}
