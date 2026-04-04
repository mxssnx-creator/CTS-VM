import type { NextRequest } from "next/server"
import { initRedis, getSettings } from "@/lib/redis-db"

export async function GET(request: NextRequest) {
  try {
    await initRedis()

    const upgrade = request.headers.get("upgrade")
    const connection = request.headers.get("connection")

    if (upgrade?.toLowerCase() === "websocket" && connection?.toLowerCase().includes("upgrade")) {
      return new Response("WebSocket upgrade not supported in this environment. Use Server-Sent Events (SSE) or polling for real-time updates.", {
        status: 426,
        headers: { "Content-Type": "text/plain" },
      })
    }

    const engineStatus = await getSettings("engine_status") || { running: false }
    const activeConnections = await getSettings("active_connections") || []
    const progressionState = await getSettings("progression_state") || {}

    return new Response(
      JSON.stringify({
        success: true,
        message: "Real-time status endpoint",
        data: {
          engine: engineStatus,
          activeConnections: Array.isArray(activeConnections) ? activeConnections.length : 0,
          progression: progressionState,
          timestamp: new Date().toISOString(),
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Failed to fetch real-time status",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    )
  }
}
