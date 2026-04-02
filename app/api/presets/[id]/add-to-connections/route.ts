import { type NextRequest, NextResponse } from "next/server"
import { getRedisClient } from "@/lib/redis-db"
import { RedisService } from "@/lib/redis-service"
import { nanoid } from "nanoid"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const client = getRedisClient()
  try {
    const { id } = await params
    const presetId = id

    // Fetch preset
    const preset = await RedisService.getPreset(presetId)
    if (!preset) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 })
    }

    // Fetch active configs for preset, sorted by profit_factor DESC, limit 10
    // Active configs are stored as hashes: preset_active_config:${configId}
    // Index set: preset:${presetId}:active_configs (contains IDs where is_active = "1")
    const activeConfigIds = (await client.smembers(`preset:${presetId}:active_configs`)) || []

    if (activeConfigIds.length === 0) {
      return NextResponse.json(
        { error: "No active configurations found for this preset. Run a backtest first." },
        { status: 400 },
      )
    }

    // Fetch all config hashes
    const configPromises = activeConfigIds.map(async (configId: string) => {
      const hash = await client.hgetall(`preset_active_config:${configId}`)
      if (hash && hash.is_active === "1") {
        return {
          id: configId,
          ...hash,
          profit_factor: parseFloat(hash.profit_factor || "0"),
        }
      }
      return null
    })
    const configs = (await Promise.all(configPromises)).filter(c => c !== null) as any[]

    // Sort by profit_factor descending and take top 10
    configs.sort((a, b) => b.profit_factor - a.profit_factor)
    const topConfigs = configs.slice(0, 10)

    if (topConfigs.length === 0) {
      return NextResponse.json(
        { error: "No active configurations found for this preset. Run a backtest first." },
        { status: 400 },
      )
    }

    // Get Bybit exchange ID from Redis
    // Store exchange IDs in hash key "exchange:${name}" with field "id"
    let exchangeId = await client.hget("exchange:Bybit", "id")
    if (!exchangeId) {
      // Default to 1 if not found
      exchangeId = "1"
    }

    let createdCount = 0

    for (const config of topConfigs) {
      try {
        const connectionId = nanoid()
        const connectionName = `${preset.name} - ${config.symbol} (PF: ${config.profit_factor?.toFixed(2) || "N/A"})`

        // Check if connection already exists
        const existing = await client.hgetall(`connection:${connectionId}`)
        if (existing && Object.keys(existing).length > 0) {
          continue
        }

        // Create exchange_connection hash
        const connectionData: Record<string, string> = {
          id: connectionId,
          user_id: "1",
          temp_user_id: "1",
          exchange_id: exchangeId,
          name: connectionName,
          api_type: "spot",
          api_key: "preset_generated",
          api_secret: "preset_generated",
          passphrase: "",
          margin_type: "isolated",
          position_mode: "one-way",
          is_testnet: "1",
          is_active: "0",
          connection_library: "ccxt",
          is_predefined: "0",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        const args: string[] = []
        for (const [k, v] of Object.entries(connectionData)) {
          args.push(k, v)
        }
        await client.hmset(`connection:${connectionId}`, ...args)
        await client.sadd("connections", connectionId)

        // Create volume_configuration
        await client.hmset(`volume_configuration:${connectionId}`,
          "connection_id", connectionId,
          "volume_factor", "1.0",
          "created_at", new Date().toISOString(),
          "updated_at", new Date().toISOString()
        )

        // Create trade_engine_state
        await client.hmset(`trade_engine_state:${connectionId}`,
          "connection_id", connectionId,
          "is_enabled", "0",
          "created_at", new Date().toISOString(),
          "updated_at", new Date().toISOString()
        )

        createdCount++
      } catch (error) {
        console.error(`[v0] Failed to create connection for config ${config.id}:`, error)
      }
    }

    return NextResponse.json({
      success: true,
      count: createdCount,
      message: `Created ${createdCount} connection(s) from preset configurations`,
    }    )
  } catch (error) {
    console.error("[v0] Failed to add preset to connections:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add preset to connections" },
      { status: 500 },
    )
  }
}