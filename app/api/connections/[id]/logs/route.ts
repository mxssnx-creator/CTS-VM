import { type NextRequest, NextResponse } from "next/server"
import { initRedis } from "@/lib/redis-db"
import { SystemLogger } from "@/lib/system-logger"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initRedis()
    const { id } = await params
    const logger = new SystemLogger()
    const logs = await SystemLogger.getLogs(`connection:${id}`, 100)
    return NextResponse.json({ success: true, logs })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch connection logs", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
