import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getSettings, setSettings } from "@/lib/redis-db"

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initRedis()
    const { id } = await params
    const body = await request.json()
    const sets = await getSettings("preset_config_sets") || []
    const index = sets.findIndex((s: { id: string }) => s.id === id)
    if (index === -1) {
      return NextResponse.json({ error: "Config set not found" }, { status: 404 })
    }
    sets[index] = { ...sets[index], ...body, updated_at: new Date().toISOString() }
    await setSettings("preset_config_sets", sets)
    return NextResponse.json({ success: true, data: sets[index] })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update preset config set", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initRedis()
    const { id } = await params
    const sets = await getSettings("preset_config_sets") || []
    const filtered = sets.filter((s: { id: string }) => s.id !== id)
    if (filtered.length === sets.length) {
      return NextResponse.json({ error: "Config set not found" }, { status: 404 })
    }
    await setSettings("preset_config_sets", filtered)
    return NextResponse.json({ success: true, message: "Config set deleted" })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete preset config set", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
