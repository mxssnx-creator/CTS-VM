import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getAllConnections } from "@/lib/redis-db"

export async function GET() {
  try {
    await initRedis()
    const connections = await getAllConnections()
    return NextResponse.json({ success: true, connections })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch connections", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
