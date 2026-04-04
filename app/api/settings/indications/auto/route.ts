import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getSettings, setSettings } from "@/lib/redis-db"

export async function GET() {
  try {
    await initRedis()
    const settings = await getSettings("auto_indications")
    return NextResponse.json({
      success: true,
      data: settings || {
        enabled: false,
        analysisWindow8h: true,
        blockEnabled: false,
        dcaEnabled: false,
        minProfitFactor: 1.2,
        maxDrawdownHours: 24,
        autoAdjust: false,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch auto indication settings", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    await initRedis()
    const body = await request.json()
    await setSettings("auto_indications", body)
    return NextResponse.json({ success: true, data: body })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update auto indication settings", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await initRedis()
    const existing = await getSettings("auto_indications") || {}
    const body = await request.json()
    const updated = { ...existing, ...body }
    await setSettings("auto_indications", updated)
    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to patch auto indication settings", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
