import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getRedisClient } from "@/lib/redis-db"

export async function POST(request: NextRequest) {
  try {
    await initRedis()
    const body = await request.json().catch(() => ({}))
    const client = getRedisClient()
    const keys = await client.keys(body.pattern || "*:logs:*")
    let deleted = 0
    for (const key of keys) {
      await client.del(key)
      deleted++
    }
    return NextResponse.json({ success: true, deleted, message: `Cleaned up ${deleted} keys` })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to cleanup database", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
