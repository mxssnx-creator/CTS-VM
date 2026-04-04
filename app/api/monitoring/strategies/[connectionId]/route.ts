import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getSettings } from "@/lib/redis-db"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  try {
    await initRedis()
    const { connectionId } = await params
    const key = `monitoring:strategies:${connectionId}`
    const settings = await getSettings(key)
    return NextResponse.json({
      success: true,
      strategies: settings || [],
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch monitoring strategies", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
