import { type NextRequest, NextResponse } from "next/server"
import { getRedisClient } from "@/lib/redis-db"
import { SystemLogger } from "@/lib/system-logger"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const client = getRedisClient()

    if (body.volume_factor === undefined || body.volume_factor === null) {
      return NextResponse.json({ error: "Volume factor is required" }, { status: 400 })
    }

    const volumeFactor = Number.parseFloat(body.volume_factor)
    if (Number.isNaN(volumeFactor) || volumeFactor < 0.1 || volumeFactor > 10) {
      return NextResponse.json(
        { error: "Invalid volume factor", details: "Volume factor must be between 0.1 and 10" },
        { status: 400 },
      )
    }

    // Check if connection exists
    const connection = await client.hgetall(`connection:${id}`)
    if (!connection || Object.keys(connection).length === 0) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    // Check if connection is active
    const isActive = connection.is_active === "1"
    if (!isActive) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    console.log("[v0] Updating volume factor for connection:", id, "to", volumeFactor)
    await SystemLogger.logConnection(`Updating volume factor to ${volumeFactor}`, id, "info")

    // Store volume_factor in connection hash
    await client.hset(`connection:${id}`, { volume_factor: String(volumeFactor) })

    await SystemLogger.logConnection(`Volume factor updated successfully`, id, "info")

    return NextResponse.json({ success: true, volume_factor: volumeFactor })
  } catch (error) {
    console.error("[v0] Failed to update volume factor:", error)
    await SystemLogger.logError("api", error, `PATCH /api/settings/connections/${(await params).id}/volume`)
    return NextResponse.json(
      { error: "Failed to update volume factor", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
