import { NextResponse } from "next/server"
import { initRedis, getSettings, setSettings } from "@/lib/redis-db"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { presetId } = body

    if (!presetId) {
      return NextResponse.json({ error: "Preset ID is required" }, { status: 400 })
    }

    await initRedis()

    const preset = await getSettings(`preset:${presetId}`)
    if (!preset) {
      return NextResponse.json({ error: `Preset ${presetId} not found` }, { status: 404 })
    }

    const activePreset = {
      id: presetId,
      name: preset.name || "Unknown Preset",
      config: preset.config || {},
      activatedAt: new Date().toISOString(),
    }

    await setSettings("active_preset", activePreset)

    return NextResponse.json({
      success: true,
      message: `Preset ${presetId} activated successfully`,
      name: preset.name || "Preset",
      presetId,
      config: preset.config || {},
    })
  } catch (error) {
    console.error("[v0] [API] [Presets] Error activating preset:", error)
    return NextResponse.json(
      { error: "Failed to activate preset", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
