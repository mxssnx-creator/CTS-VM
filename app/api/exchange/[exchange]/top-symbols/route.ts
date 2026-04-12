import { NextResponse } from "next/server"
import { getTopSymbolsByVolume } from "@/lib/market-data-service"

/**
 * GET /api/exchange/[exchange]/top-symbols
 * Retrieve top N symbols by trading volume from the past 24 hours
 */
export async function GET(request: Request, { params }: { params: { exchange: string } }) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Number(searchParams.get("limit") || "10")
    const exchange = (params.exchange || "").toLowerCase()

    console.log(`[v0] [TopSymbols] Fetching top ${limit} symbols by volume for ${exchange}`)

    // Fetch real top symbols from exchange public APIs
    const symbols = await getTopSymbolsByVolume(exchange, limit)

    return NextResponse.json({
      success: true,
      exchange,
      symbols,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error(`[v0] [TopSymbols] Error:`, error)
    return NextResponse.json(
      { error: "Failed to retrieve top symbols", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
