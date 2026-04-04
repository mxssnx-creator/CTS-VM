import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getSettings, setSettings } from "@/lib/redis-db"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initRedis()
    const { id } = await params
    const key = `portfolio:${id}:risk_limits`
    const data = await getSettings(key)
    return NextResponse.json({ success: true, data: data || {} })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch risk limits", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initRedis()
    const { id } = await params
    const body = await request.json()
    const key = `portfolio:${id}:risk_limits`
    await setSettings(key, body)
    return NextResponse.json({ success: true, data: body })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update risk limits", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
