import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getSettings } from "@/lib/redis-db"

export async function GET() {
  try {
    await initRedis()
    const results = await getSettings("preset_coordination_results")
    return NextResponse.json({ success: true, data: results || [] })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch preset coordination results", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
