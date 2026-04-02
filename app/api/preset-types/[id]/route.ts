import { type NextRequest, NextResponse } from "next/server"
import { RedisService } from "@/lib/redis-service"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const presetType = await RedisService.getPresetType(id)

    if (!presetType) {
      return NextResponse.json({ error: "Preset type not found" }, { status: 404 })
    }

    return NextResponse.json({
      ...presetType,
      block_enabled: presetType.block_enabled === "1",
      block_only: presetType.block_only === "1",
      dca_enabled: presetType.dca_enabled === "1",
      dca_only: presetType.dca_only === "1",
      auto_evaluate: presetType.auto_evaluate !== "0",
      is_active: presetType.is_active === "1",
      max_positions_per_indication: Number(presetType.max_positions_per_indication || 1),
      max_positions_per_direction: Number(presetType.max_positions_per_direction || 1),
      max_positions_per_range: Number(presetType.max_positions_per_range || 1),
      timeout_per_indication: Number(presetType.timeout_per_indication || 5),
      timeout_after_position: Number(presetType.timeout_after_position || 10),
      evaluation_interval_hours: Number(presetType.evaluation_interval_hours || 3),
    })
  } catch (error) {
    console.error("[v0] Failed to fetch preset type:", error)
    return NextResponse.json({ error: "Failed to fetch preset type" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()

    const updatesRaw: Record<string, any> = {
      name: body.name,
      description: body.description || null,
      preset_trade_type: body.preset_trade_type || "automatic",
      max_positions_per_indication: body.max_positions_per_indication !== undefined ? String(body.max_positions_per_indication) : undefined,
      max_positions_per_direction: body.max_positions_per_direction !== undefined ? String(body.max_positions_per_direction) : undefined,
      max_positions_per_range: body.max_positions_per_range !== undefined ? String(body.max_positions_per_range) : undefined,
      timeout_per_indication: body.timeout_per_indication !== undefined ? String(body.timeout_per_indication) : undefined,
      timeout_after_position: body.timeout_after_position !== undefined ? String(body.timeout_after_position) : undefined,
      block_enabled: body.block_enabled !== undefined ? (body.block_enabled ? "1" : "0") : undefined,
      block_only: body.block_only !== undefined ? (body.block_only ? "1" : "0") : undefined,
      dca_enabled: body.dca_enabled !== undefined ? (body.dca_enabled ? "1" : "0") : undefined,
      dca_only: body.dca_only !== undefined ? (body.dca_only ? "1" : "0") : undefined,
      auto_evaluate: body.auto_evaluate !== false ? "1" : "0",
      evaluation_interval_hours: body.evaluation_interval_hours !== undefined ? String(body.evaluation_interval_hours) : undefined,
      is_active: body.is_active !== false ? "1" : "0",
      updated_at: new Date().toISOString(),
    }

    // Remove undefined values
    const updates = Object.fromEntries(Object.entries(updatesRaw).filter(([_, v]) => v !== undefined))

    const presetType = await RedisService.updatePresetType(id, updates)

    if (!presetType) {
      return NextResponse.json({ error: "Preset type not found" }, { status: 404 })
    }

    return NextResponse.json({
      ...presetType,
      block_enabled: presetType.block_enabled === "1",
      block_only: presetType.block_only === "1",
      dca_enabled: presetType.dca_enabled === "1",
      dca_only: presetType.dca_only === "1",
      auto_evaluate: presetType.auto_evaluate !== "0",
      is_active: presetType.is_active === "1",
      max_positions_per_indication: Number(presetType.max_positions_per_indication || 1),
      max_positions_per_direction: Number(presetType.max_positions_per_direction || 1),
      max_positions_per_range: Number(presetType.max_positions_per_range || 1),
      timeout_per_indication: Number(presetType.timeout_per_indication || 5),
      timeout_after_position: Number(presetType.timeout_after_position || 10),
      evaluation_interval_hours: Number(presetType.evaluation_interval_hours || 3),
    })
  } catch (error) {
    console.error("[v0] Failed to update preset type:", error)
    return NextResponse.json({ error: "Failed to update preset type" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const presetType = await RedisService.deletePresetType(id)

    if (!presetType) {
      return NextResponse.json({ error: "Preset type not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Failed to delete preset type:", error)
    return NextResponse.json({ error: "Failed to delete preset type" }, { status: 500 })
  }
}
