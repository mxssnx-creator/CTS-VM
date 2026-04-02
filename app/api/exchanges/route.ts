import { NextResponse } from "next/server"
import { getRedisClient } from "@/lib/redis-db"

export async function GET() {
  try {
    console.log("[v0] Fetching exchanges from Redis")
    const client = getRedisClient()

    // Get all exchange IDs from set
    const exchangeIds = await client.smembers("exchanges:all") || []

    // Fetch all exchange data in parallel
    const exchanges = await Promise.all(
      exchangeIds.map(async (exId) => {
        const data = await client.hgetall(`exchange:${exId}`)
        if (data && Object.keys(data).length > 0) {
          const isActive = data.is_active === "1"
          if (!isActive) {
            return null
          }
          return {
            id: data.id || exId,
            name: data.name || "",
            display_name: data.display_name || "",
            is_active: isActive,
            supports_spot: data.supports_spot === "1",
            supports_futures: data.supports_futures === "1",
            supports_margin: data.supports_margin === "1",
            api_endpoint: data.api_endpoint || "",
            websocket_endpoint: data.websocket_endpoint || "",
          }
        }
        return null
      })
    )

    // Filter out nulls and sort by display_name
    const validExchanges = exchanges.filter((ex): ex is NonNullable<typeof ex> => ex !== null)
    validExchanges.sort((a, b) => a.display_name.localeCompare(b.display_name))

    console.log("[v0] Found exchanges:", validExchanges.length)
    validExchanges.forEach((ex) => {
      console.log("[v0] - Exchange:", ex.name, "->", ex.display_name)
    })

    return NextResponse.json(validExchanges)
  } catch (error) {
    console.error("[v0] Failed to fetch exchanges:", error)
    console.error("[v0] Error details:", error instanceof Error ? error.message : "Unknown error")
    return NextResponse.json([])
  }
}
