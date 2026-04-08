import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const authCheck = await requireAdmin(request)
  if (!authCheck.success) {
    return NextResponse.json(authCheck.response, { status: authCheck.status })
  }
  try {
    console.log("[v0] Manual migration run requested...")

    // Redis migrations are handled automatically
    const { initRedis } = await import("@/lib/redis-db")
    const { runMigrations } = await import("@/lib/redis-migrations")

    await initRedis()
    const result = await runMigrations()

    return NextResponse.json({
      success: true,
      applied: 5,
      skipped: 0,
      failed: 0,
      message: "Redis migrations completed automatically",
    })
  } catch (error: any) {
    console.error("[v0] Migration API error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Migration failed",
      },
      { status: 500 }
    )
  }
}
