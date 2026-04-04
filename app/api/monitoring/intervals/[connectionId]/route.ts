import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getSettings } from "@/lib/redis-db"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ connectionId: string }> }) {
  try {
    await initRedis()
    const { connectionId } = await params
    const key = `monitoring:intervals:${connectionId}`
    const settings = await getSettings(key)
    return NextResponse.json({
      success: true,
      intervals: settings || {
        direction: { enabled: true, isRunning: false, isProgressing: false, intervalTime: 60, timeout: 30 },
        move: { enabled: true, isRunning: false, isProgressing: false, intervalTime: 60, timeout: 30 },
        active: { enabled: true, isRunning: false, isProgressing: false, intervalTime: 60, timeout: 30 },
        optimal: { enabled: true, isRunning: false, isProgressing: false, intervalTime: 60, timeout: 30 },
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch monitoring intervals", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
