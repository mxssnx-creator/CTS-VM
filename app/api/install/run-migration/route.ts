import { type NextRequest, NextResponse } from "next/server"
import { initRedis, haveMigrationsRun, setMigrationsRun } from "@/lib/redis-db"

export async function POST() {
  try {
    await initRedis()
    const alreadyRun = await haveMigrationsRun()
    if (alreadyRun) {
      return NextResponse.json({ success: true, applied: 0, skipped: 0, message: "Migrations already up to date" })
    }
    await setMigrationsRun(true)
    return NextResponse.json({ success: true, applied: 1, skipped: 0, message: "Migration flag set" })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to run migration", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
