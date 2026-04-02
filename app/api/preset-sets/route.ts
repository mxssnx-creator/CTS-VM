import { type NextRequest, NextResponse } from "next/server"
import { getRedisClient, initRedis } from "@/lib/redis-db"
import { nanoid } from "nanoid"

// GET /api/preset-sets - Get all configuration sets
export async function GET(request: NextRequest) {
  try {
    await initRedis()
    const client = getRedisClient()
    const setIds = await client.smembers("preset_configuration_sets") || []
    const sets = []

    for (const id of setIds) {
      const data = await client.hgetall(`preset_configuration_set:${id}`)
      if (data && Object.keys(data).length > 0) {
        // Parse JSON fields
        const parsed = { ...data, id }
        try { parsed.symbols = JSON.parse(data.symbols || "[]") } catch {}
        try { parsed.indication_params = JSON.parse(data.indication_params || "{}") } catch {}
        try { parsed.trail_starts = JSON.parse(data.trail_starts || "[]") } catch {}
        try { parsed.trail_stops = JSON.parse(data.trail_stops || "[]") } catch {}
        sets.push(parsed)
      }
    }

    // Sort by created_at DESC
    sets.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())

    return NextResponse.json(sets)
  } catch (error) {
    console.error("[v0] Failed to fetch preset sets:", error)
    return NextResponse.json({ error: "Failed to fetch preset sets" }, { status: 500 })
  }
}

// POST /api/preset-sets - Create new configuration set
export async function POST(request: NextRequest) {
  try {
    await initRedis()
    const client = getRedisClient()
    const body = await request.json()

    const id = nanoid()
    const now = new Date().toISOString()

    const setData: Record<string, string> = {
      id,
      name: body.name,
      description: body.description || "",
      symbol_mode: body.symbol_mode || "main",
      symbols: JSON.stringify(body.symbols || []),
      exchange_order_by: body.exchange_order_by || "",
      exchange_limit: String(body.exchange_limit || 10),
      indication_type: body.indication_type || "",
      indication_params: JSON.stringify(body.indication_params || {}),
      takeprofit_min: String(body.takeprofit_min || 2.0),
      takeprofit_max: String(body.takeprofit_max || 30.0),
      takeprofit_step: String(body.takeprofit_step || 2.0),
      stoploss_min: String(body.stoploss_min || 0.3),
      stoploss_max: String(body.stoploss_max || 3.0),
      stoploss_step: String(body.stoploss_step || 0.3),
      trailing_enabled: body.trailing_enabled !== false ? "1" : "0",
      trail_starts: JSON.stringify(body.trail_starts || [0.5, 1.0, 1.5]),
      trail_stops: JSON.stringify(body.trail_stops || [0.2, 0.4, 0.6]),
      range_days: String(body.range_days || 7),
      trades_per_48h_min: String(body.trades_per_48h_min || 5),
      profit_factor_min: String(body.profit_factor_min || 0.5),
      drawdown_time_max: String(body.drawdown_time_max || 12),
      evaluation_positions_count1: String(body.evaluation_positions_count1 || 25),
      evaluation_positions_count2: String(body.evaluation_positions_count2 || 50),
      database_positions_per_set: String(body.database_positions_per_set || 250),
      database_threshold_percent: String(body.database_threshold_percent || 20),
      is_active: body.is_active !== false ? "1" : "0",
      created_at: now,
      updated_at: now,
    }

    await client.hset(`preset_configuration_set:${id}`, setData)
    await client.sadd("preset_configuration_sets", id)

    // Return with parsed fields
    const response = { ...setData, id }
    response.symbols = JSON.parse(setData.symbols)
    response.indication_params = JSON.parse(setData.indication_params)
    response.trail_starts = JSON.parse(setData.trail_starts)
    response.trail_stops = JSON.parse(setData.trail_stops)

    return NextResponse.json(response)
  } catch (error) {
    console.error("[v0] Failed to create preset set:", error)
    return NextResponse.json({ error: "Failed to create preset set" }, { status: 500 })
  }
}
