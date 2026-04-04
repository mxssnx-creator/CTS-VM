import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getSettings, setSettings } from "@/lib/redis-db"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initRedis()
    const { id } = await params
    const presetType = await getSettings(`preset_type:${id}`)
    if (!presetType) {
      return NextResponse.json({ error: "Preset type not found" }, { status: 404 })
    }
    const config = presetType.config || {
      volume_factor: 1.0,
      profit_factor_min: 1.2,
      max_drawdown_time: 24,
      trailing_enabled: false,
      block_enabled: false,
      dca_enabled: false,
    }
    return NextResponse.json({ success: true, data: config })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch preset type config", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initRedis()
    const { id } = await params
    const body = await request.json()
    const presetType = await getSettings(`preset_type:${id}`) || {}
    presetType.config = { ...(presetType.config || {}), ...body }
    await setSettings(`preset_type:${id}`, presetType)
    return NextResponse.json({ success: true, data: presetType.config })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update preset type config", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
