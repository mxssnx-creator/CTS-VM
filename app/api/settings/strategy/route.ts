import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getSettings, setSettings } from "@/lib/redis-db"

export async function GET() {
  try {
    await initRedis()
    const strategy = await getSettings("strategy")
    return NextResponse.json({
      success: true,
      data: strategy || {
        trailing_enabled: false,
        block_enabled: false,
        dca_enabled: false,
        volume_factor: 1.0,
        profit_factor_min: 1.2,
        max_drawdown_time: 24,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch strategy settings", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    await initRedis()
    const body = await request.json()
    await setSettings("strategy", body)
    return NextResponse.json({ success: true, data: body })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update strategy settings", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await initRedis()
    const existing = await getSettings("strategy") || {}
    const body = await request.json()
    const updated = { ...existing, ...body }
    await setSettings("strategy", updated)
    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to patch strategy settings", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
