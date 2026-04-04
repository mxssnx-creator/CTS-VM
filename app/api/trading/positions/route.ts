import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getConnectionPositions } from "@/lib/redis-db"

export async function GET(request: NextRequest) {
  try {
    await initRedis()
    const { searchParams } = new URL(request.url)
    const connectionId = searchParams.get("connectionId")
    let positions: unknown[] = []
    if (connectionId) {
      positions = await getConnectionPositions(connectionId)
    } else {
      positions = []
    }
    return NextResponse.json({ success: true, positions })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch positions", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
