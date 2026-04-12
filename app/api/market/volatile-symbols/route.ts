import { NextResponse } from "next/server"
import { getMostVolatileSymbols } from "@/lib/market-data-service"

export const dynamic = "force-dynamic"

/**
 * GET /api/market/volatile-symbols
 * Returns the most volatile trading symbols from major exchanges
 */
export async function GET() {
  try {
    const volatileSymbols = await getMostVolatileSymbols(10)
    
    return NextResponse.json({
      success: true,
      symbols: volatileSymbols,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[v0] [VolatileSymbols] Error:", error)
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to fetch volatile symbols", 
        details: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    )
  }
}
