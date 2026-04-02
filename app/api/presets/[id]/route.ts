import { type NextRequest, NextResponse } from "next/server"
import { RedisService } from "@/lib/redis-service"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const preset = await RedisService.getPreset(id)

    if (!preset) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 })
    }

    const parsedPreset = {
      ...preset,
      indication_types: preset.indication_types ? JSON.parse(preset.indication_types) : ["direction", "move", "active"],
      indication_ranges: preset.indication_ranges ? JSON.parse(preset.indication_ranges) : [3, 5, 8, 12, 15, 20, 25, 30],
      takeprofit_steps: preset.takeprofit_steps ? JSON.parse(preset.takeprofit_steps) : [2, 3, 4, 6, 8, 12],
      stoploss_ratios: preset.stoploss_ratios ? JSON.parse(preset.stoploss_ratios) : [0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.5],
      trail_starts: preset.trail_starts ? JSON.parse(preset.trail_starts) : [0.3, 0.6, 1.0],
      trail_stops: preset.trail_stops ? JSON.parse(preset.trail_stops) : [0.1, 0.2, 0.3],
      strategy_types: preset.strategy_types ? JSON.parse(preset.strategy_types) : ["base", "main", "real"],
      last_positions_counts: preset.last_positions_counts ? JSON.parse(preset.last_positions_counts) : [3, 4, 5, 6, 8, 12, 25],
      main_positions_count: preset.main_positions_count ? JSON.parse(preset.main_positions_count) : [1, 2, 3, 4, 5],
      block_sizes: preset.block_sizes ? JSON.parse(preset.block_sizes) : [2, 4, 6, 8],
      block_adjustment_ratios: preset.block_adjustment_ratios ? JSON.parse(preset.block_adjustment_ratios) : [0.5, 1.0, 1.5, 2.0],
      dca_levels: preset.dca_levels ? JSON.parse(preset.dca_levels) : [3, 5, 7],
      volume_factors: preset.volume_factors ? JSON.parse(preset.volume_factors) : [1, 2, 3, 4, 5],
      trailing_enabled: preset.trailing_enabled === "1",
      block_adjustment_enabled: preset.block_adjustment_enabled === "1",
      dca_adjustment_enabled: preset.dca_adjustment_enabled === "1",
      backtest_enabled: preset.backtest_enabled === "1",
      is_active: preset.is_active === "1",
      is_predefined: preset.is_predefined === "1",
    }

    return NextResponse.json(parsedPreset)
  } catch (error) {
    console.error("[v0] Failed to fetch preset:", error)
    return NextResponse.json({ error: "Failed to fetch preset" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()

    const updatesRaw: Record<string, any> = {
      name: body.name,
      description: body.description || null,
      indication_types: JSON.stringify(body.indication_types),
      indication_ranges: JSON.stringify(body.indication_ranges),
      takeprofit_steps: JSON.stringify(body.takeprofit_steps),
      stoploss_ratios: JSON.stringify(body.stoploss_ratios),
      trailing_enabled: body.trailing_enabled !== undefined ? (body.trailing_enabled ? "1" : "0") : undefined,
      trail_starts: JSON.stringify(body.trail_starts),
      trail_stops: JSON.stringify(body.trail_stops),
      strategy_types: JSON.stringify(body.strategy_types),
      last_positions_counts: JSON.stringify(body.last_positions_counts),
      main_positions_count: JSON.stringify(body.main_positions_count),
      block_adjustment_enabled: body.block_adjustment_enabled !== undefined ? (body.block_adjustment_enabled ? "1" : "0") : undefined,
      block_sizes: JSON.stringify(body.block_sizes),
      block_adjustment_ratios: JSON.stringify(body.block_adjustment_ratios),
      dca_adjustment_enabled: body.dca_adjustment_enabled !== undefined ? (body.dca_adjustment_enabled ? "1" : "0") : undefined,
      dca_levels: JSON.stringify(body.dca_levels),
      volume_factors: JSON.stringify(body.volume_factors),
      min_profit_factor: body.min_profit_factor !== undefined ? String(body.min_profit_factor) : undefined,
      min_win_rate: body.min_win_rate !== undefined ? String(body.min_win_rate) : undefined,
      max_drawdown: body.max_drawdown !== undefined ? String(body.max_drawdown) : undefined,
      backtest_period_days: body.backtest_period_days !== undefined ? String(body.backtest_period_days) : undefined,
      backtest_enabled: body.backtest_enabled !== undefined ? (body.backtest_enabled ? "1" : "0") : undefined,
      is_active: body.is_active !== undefined ? (body.is_active ? "1" : "0") : undefined,
      updated_at: new Date().toISOString(),
    }

    // Remove undefined values
    const updates = Object.fromEntries(Object.entries(updatesRaw).filter(([_, v]) => v !== undefined))

    const preset = await RedisService.updatePreset(id, updates)

    if (!preset) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 })
    }

    const parsedPreset = {
      ...preset,
      indication_types: preset.indication_types ? JSON.parse(preset.indication_types) : ["direction", "move", "active"],
      indication_ranges: preset.indication_ranges ? JSON.parse(preset.indication_ranges) : [3, 5, 8, 12, 15, 20, 25, 30],
      takeprofit_steps: preset.takeprofit_steps ? JSON.parse(preset.takeprofit_steps) : [2, 3, 4, 6, 8, 12],
      stoploss_ratios: preset.stoploss_ratios ? JSON.parse(preset.stoploss_ratios) : [0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.5],
      trail_starts: preset.trail_starts ? JSON.parse(preset.trail_starts) : [0.3, 0.6, 1.0],
      trail_stops: preset.trail_stops ? JSON.parse(preset.trail_stops) : [0.1, 0.2, 0.3],
      strategy_types: preset.strategy_types ? JSON.parse(preset.strategy_types) : ["base", "main", "real"],
      last_positions_counts: preset.last_positions_counts ? JSON.parse(preset.last_positions_counts) : [3, 4, 5, 6, 8, 12, 25],
      main_positions_count: preset.main_positions_count ? JSON.parse(preset.main_positions_count) : [1, 2, 3, 4, 5],
      block_sizes: preset.block_sizes ? JSON.parse(preset.block_sizes) : [2, 4, 6, 8],
      block_adjustment_ratios: preset.block_adjustment_ratios ? JSON.parse(preset.block_adjustment_ratios) : [0.5, 1.0, 1.5, 2.0],
      dca_levels: preset.dca_levels ? JSON.parse(preset.dca_levels) : [3, 5, 7],
      volume_factors: preset.volume_factors ? JSON.parse(preset.volume_factors) : [1, 2, 3, 4, 5],
      trailing_enabled: preset.trailing_enabled === "1",
      block_adjustment_enabled: preset.block_adjustment_enabled === "1",
      dca_adjustment_enabled: preset.dca_adjustment_enabled === "1",
      backtest_enabled: preset.backtest_enabled === "1",
      is_active: preset.is_active === "1",
      is_predefined: preset.is_predefined === "1",
    }

    return NextResponse.json(parsedPreset)
  } catch (error) {
    console.error("[v0] Failed to update preset:", error)
    return NextResponse.json({ error: "Failed to update preset" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const preset = await RedisService.deletePreset(id)

    if (!preset) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 })
    }

    return NextResponse.json({ message: "Preset deleted successfully" })
  } catch (error) {
    console.error("[v0] Failed to delete preset:", error)
    return NextResponse.json({ error: "Failed to delete preset" }, { status: 500 })
  }
}
