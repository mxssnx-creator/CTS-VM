import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getSettings, setSettings } from "@/lib/redis-db"
import { nanoid } from "nanoid"

export async function GET() {
  try {
    await initRedis()
    const sets = await getSettings("preset_config_sets")
    return NextResponse.json({ success: true, data: sets || [] })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch preset config sets", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    await initRedis()
    const body = await request.json()
    const sets = await getSettings("preset_config_sets") || []
    const newSet = {
      id: nanoid(),
      name: body.name || "New Config Set",
      description: body.description || "",
      symbol_mode: body.symbol_mode || "USDT",
      indication_type: body.indication_type || "direction",
      indication_params: body.indication_params || {},
      takeprofit_min: body.takeprofit_min || 0.01,
      takeprofit_max: body.takeprofit_max || 0.05,
      takeprofit_step: body.takeprofit_step || 0.005,
      stoploss_min: body.stoploss_min || 0.01,
      stoploss_max: body.stoploss_max || 0.03,
      stoploss_step: body.stoploss_step || 0.005,
      trailing_enabled: body.trailing_enabled ?? false,
      block_enabled: body.block_enabled ?? false,
      dca_enabled: body.dca_enabled ?? false,
      range_days: body.range_days || 30,
      trades_per_48h_min: body.trades_per_48h_min || 5,
      profit_factor_min: body.profit_factor_min || 1.2,
      drawdown_time_max: body.drawdown_time_max || 24,
      evaluation_positions_count1: body.evaluation_positions_count1 || 10,
      evaluation_positions_count2: body.evaluation_positions_count2 || 20,
      database_positions_per_set: body.database_positions_per_set || 50,
      database_threshold_percent: body.database_threshold_percent || 5,
      is_active: body.is_active ?? true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    sets.push(newSet)
    await setSettings("preset_config_sets", sets)
    return NextResponse.json({ success: true, data: newSet })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create preset config set", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
