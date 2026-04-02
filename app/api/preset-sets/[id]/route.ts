import { type NextRequest, NextResponse } from "next/server"
import { getRedisClient, initRedis } from "@/lib/redis-db"

// GET /api/preset-sets/[id] - Get single configuration set
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initRedis()
    const { id } = await params
    const client = getRedisClient()
    const data = await client.hgetall(`preset_configuration_set:${id}`)

    if (!data || Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Set not found" }, { status: 404 })
    }

    // Parse JSON fields
    const parsed: any = { ...data, id }
    try { parsed.symbols = JSON.parse(data.symbols || "[]") } catch {}
    try { parsed.indication_params = JSON.parse(data.indication_params || "{}") } catch {}
    try { parsed.trail_starts = JSON.parse(data.trail_starts || "[]") } catch {}
    try { parsed.trail_stops = JSON.parse(data.trail_stops || "[]") } catch {}

    return NextResponse.json(parsed)
  } catch (error) {
    console.error("[v0] Failed to fetch preset set:", error)
    return NextResponse.json({ error: "Failed to fetch preset set" }, { status: 500 })
  }
}

// PUT /api/preset-sets/[id] - Update configuration set
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initRedis()
    const { id } = await params
    const client = getRedisClient()
    const body = await request.json()

    // First check existence
    const existing = await client.hgetall(`preset_configuration_set:${id}`)
    if (!existing || Object.keys(existing).length === 0) {
      return NextResponse.json({ error: "Set not found" }, { status: 404 })
    }

    const updateData: Record<string, string> = {
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
      updated_at: new Date().toISOString(),
    }

    await client.hset(`preset_configuration_set:${id}`, updateData)

    // Return with parsed fields
    const response: any = { ...updateData, id }
    try { response.symbols = JSON.parse(updateData.symbols) } catch {}
    try { response.indication_params = JSON.parse(updateData.indication_params) } catch {}
    try { response.trail_starts = JSON.parse(updateData.trail_starts) } catch {}
    try { response.trail_stops = JSON.parse(updateData.trail_stops) } catch {}

    return NextResponse.json(response)
  } catch (error) {
    console.error("[v0] Failed to update preset set:", error)
    return NextResponse.json({ error: "Failed to update preset set" }, { status: 500 })
  }
}

// DELETE /api/preset-sets/[id] - Delete configuration set
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initRedis()
    const { id } = await params
    const client = getRedisClient()
    await client.del(`preset_configuration_set:${id}`)
    await client.srem("preset_configuration_sets", id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Failed to delete preset set:", error)
    return NextResponse.json({ error: "Failed to delete preset set" }, { status: 500 })
  }
}
