import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getIndications } from "@/lib/redis-db"

export async function GET(request: NextRequest) {
  try {
    await initRedis()
    const { searchParams } = new URL(request.url)
    const connectionId = searchParams.get("connectionId")
    const symbol = searchParams.get("symbol")
    const type = searchParams.get("type")
    const indications = await getIndications(connectionId || "global")
    return NextResponse.json({ success: true, indications })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch indications", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
