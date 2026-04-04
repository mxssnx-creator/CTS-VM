import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getSettings } from "@/lib/redis-db"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await initRedis()
    const { id } = await params
    const key = `preset_type:${id}:results`
    const results = await getSettings(key)
    return NextResponse.json({ success: true, data: results || [] })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch preset type results", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
