import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const authCheck = await requireAdmin(request)
  if (!authCheck.success) {
    return NextResponse.json(authCheck.response, { status: authCheck.status })
  }
  try {
    console.log("[v0] Initializing Redis database with migrations...")

    const { initRedis } = await import("@/lib/redis-db")
    const { runMigrations } = await import("@/lib/redis-migrations")

    const startTime = Date.now()

    // Initialize Redis
    await initRedis()

    // Run migrations
    await runMigrations()

    const duration = Date.now() - startTime

    console.log(`[v0] Redis initialized successfully in ${duration}ms`)

    return NextResponse.json({
      success: true,
      message: "Redis database initialized successfully",
      duration,
      mode: "redis",
    })
  } catch (error) {
    console.error("[v0] Database initialization error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to initialize database",
      },
      { status: 500 }
    )
  }
}
