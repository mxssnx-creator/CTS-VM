import { type NextRequest, NextResponse } from "next/server"
import { RedisService } from "@/lib/redis-service"
import { nanoid } from "nanoid"
import { SystemLogger } from "@/lib/system-logger"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    console.log("[v0] GET /api/presets - Starting...")

    const searchParams = request.nextUrl.searchParams
    const activeOnly = searchParams.get("active") === "true"

    console.log("[v0] Fetching presets, activeOnly:", activeOnly)
    await SystemLogger.logAPI(`Fetching presets (activeOnly: ${activeOnly})`, "info", "GET /api/presets")

    const presets = await RedisService.getAllPresets(activeOnly)

    console.log("[v0] Successfully fetched", presets.length, "presets")

    // Sort by is_predefined DESC, created_at DESC
    presets.sort((a: any, b: any) => {
      const aPredef = a.is_predefined === "1" ? 1 : 0
      const bPredef = b.is_predefined === "1" ? 1 : 0
      if (aPredef !== bPredef) {
        return bPredef - aPredef
      }
      return (b.created_at || "").localeCompare(a.created_at || "")
    })

    const validatedPresets = presets.map((preset: any) => {
      // parse JSON fields safely
      const parseJson = (val: any, fallback: any) => {
        if (!val) return fallback
        try { return JSON.parse(val) } catch { return fallback }
      }
      return {
        ...preset,
        indication_types: parseJson(preset.indication_types, ["direction", "move", "active"]),
        indication_ranges: parseJson(preset.indication_ranges, [3, 5, 8, 12, 15, 20, 25, 30]),
        takeprofit_steps: parseJson(preset.takeprofit_steps, [2, 3, 4, 6, 8, 12]),
        stoploss_ratios: parseJson(preset.stoploss_ratios, [0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.5]),
        trail_starts: parseJson(preset.trail_starts, [0.3, 0.6, 1.0]),
        trail_stops: parseJson(preset.trail_stops, [0.1, 0.2, 0.3]),
        strategy_types: parseJson(preset.strategy_types, ["base", "main", "real"]),
        last_positions_counts: parseJson(preset.last_positions_counts, [3, 4, 5, 6, 8, 12, 25]),
        main_positions_count: parseJson(preset.main_positions_count, [1, 2, 3, 4, 5]),
        block_sizes: parseJson(preset.block_sizes, [2, 4, 6, 8]),
        block_adjustment_ratios: parseJson(preset.block_adjustment_ratios, [0.5, 1.0, 1.5, 2.0]),
        dca_levels: parseJson(preset.dca_levels, [3, 5, 7]),
        volume_factors: parseJson(preset.volume_factors, [1, 2, 3, 4, 5]),
        trailing_enabled: preset.trailing_enabled === "1",
        block_adjustment_enabled: preset.block_adjustment_enabled === "1",
        dca_adjustment_enabled: preset.dca_adjustment_enabled === "1",
        backtest_enabled: preset.backtest_enabled === "1",
        is_active: preset.is_active === "1",
        is_predefined: preset.is_predefined === "1",
      }
    })

    return NextResponse.json(validatedPresets)
  } catch (error) {
    console.error("[v0] Failed to fetch presets:", error)
    await SystemLogger.logError(error, "api", "GET /api/presets")
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    const presetId = nanoid()

    console.log("[v0] Creating preset:", body.name)
    await SystemLogger.logAPI(`Creating preset: ${body.name}`, "info", "POST /api/presets")

    const now = new Date().toISOString()
    const preset = {
      id: presetId,
      name: body.name,
      description: body.description || null,
      indication_types: JSON.stringify(body.indication_types || ["direction", "move", "active"]),
      indication_ranges: JSON.stringify(body.indication_ranges || [3, 5, 8, 12, 15, 20, 25, 30]),
      takeprofit_steps: JSON.stringify(body.takeprofit_steps || [2, 3, 4, 6, 8, 12]),
      stoploss_ratios: JSON.stringify(body.stoploss_ratios || [0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.5]),
      trailing_enabled: body.trailing_enabled !== undefined ? (body.trailing_enabled ? "1" : "0") : "1",
      trail_starts: JSON.stringify(body.trail_starts || [0.3, 0.6, 1.0]),
      trail_stops: JSON.stringify(body.trail_stops || [0.1, 0.2, 0.3]),
      strategy_types: JSON.stringify(body.strategy_types || ["base", "main", "real"]),
      last_positions_counts: JSON.stringify(body.last_positions_counts || [3, 4, 5, 6, 8, 12, 25]),
      main_positions_count: JSON.stringify(body.main_positions_count || [1, 2, 3, 4, 5]),
      block_adjustment_enabled: body.block_adjustment_enabled !== undefined ? (body.block_adjustment_enabled ? "1" : "0") : "1",
      block_sizes: JSON.stringify(body.block_sizes || [2, 4, 6, 8]),
      block_adjustment_ratios: JSON.stringify(body.block_adjustment_ratios || [0.5, 1.0, 1.5, 2.0]),
      dca_adjustment_enabled: body.dca_adjustment_enabled !== undefined ? (body.dca_adjustment_enabled ? "1" : "0") : "0",
      dca_levels: JSON.stringify(body.dca_levels || [3, 5, 7]),
      volume_factors: JSON.stringify(body.volume_factors || [1, 2, 3, 4, 5]),
      min_profit_factor: String(body.min_profit_factor || 0.4),
      min_win_rate: String(body.min_win_rate || 0.0),
      max_drawdown: String(body.max_drawdown || 50.0),
      backtest_period_days: String(body.backtest_period_days || 30),
      backtest_enabled: body.backtest_enabled !== undefined ? (body.backtest_enabled ? "1" : "0") : "1",
      is_active: body.is_active !== undefined ? (body.is_active ? "1" : "0") : "1",
      is_predefined: body.is_predefined ? "1" : "0",
      created_by: body.created_by || null,
      created_at: now,
      updated_at: now,
    }

    await RedisService.createPreset(preset)

    const rawPreset = await RedisService.getPreset(presetId)
    if (!rawPreset) {
      throw new Error("Failed to retrieve created preset")
    }

    // Parse JSON fields and convert booleans
    const parseJson = (val: any, fallback: any) => {
      if (!val) return fallback
      try { return JSON.parse(val) } catch { return fallback }
    }
    const parsedPreset = {
      ...rawPreset,
      indication_types: parseJson(rawPreset.indication_types, ["direction", "move", "active"]),
      indication_ranges: parseJson(rawPreset.indication_ranges, [3, 5, 8, 12, 15, 20, 25, 30]),
      takeprofit_steps: parseJson(rawPreset.takeprofit_steps, [2, 3, 4, 6, 8, 12]),
      stoploss_ratios: parseJson(rawPreset.stoploss_ratios, [0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.5]),
      trail_starts: parseJson(rawPreset.trail_starts, [0.3, 0.6, 1.0]),
      trail_stops: parseJson(rawPreset.trail_stops, [0.1, 0.2, 0.3]),
      strategy_types: parseJson(rawPreset.strategy_types, ["base", "main", "real"]),
      last_positions_counts: parseJson(rawPreset.last_positions_counts, [3, 4, 5, 6, 8, 12, 25]),
      main_positions_count: parseJson(rawPreset.main_positions_count, [1, 2, 3, 4, 5]),
      block_sizes: parseJson(rawPreset.block_sizes, [2, 4, 6, 8]),
      block_adjustment_ratios: parseJson(rawPreset.block_adjustment_ratios, [0.5, 1.0, 1.5, 2.0]),
      dca_levels: parseJson(rawPreset.dca_levels, [3, 5, 7]),
      volume_factors: parseJson(rawPreset.volume_factors, [1, 2, 3, 4, 5]),
      trailing_enabled: rawPreset.trailing_enabled === "1",
      block_adjustment_enabled: rawPreset.block_adjustment_enabled === "1",
      dca_adjustment_enabled: rawPreset.dca_adjustment_enabled === "1",
      backtest_enabled: rawPreset.backtest_enabled === "1",
      is_active: rawPreset.is_active === "1",
      is_predefined: rawPreset.is_predefined === "1",
    }

    console.log("[v0] Preset created successfully:", presetId)
    await SystemLogger.logAPI(`Preset created: ${presetId}`, "info", "POST /api/presets")

    return NextResponse.json(parsedPreset, { status: 201 })
  } catch (error) {
    console.error("[v0] Failed to create preset:", error)
    await SystemLogger.logError(error, "api", "POST /api/presets")

    return NextResponse.json(
      {
        error: "Failed to create preset",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
