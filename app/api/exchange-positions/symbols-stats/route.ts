import { NextResponse } from "next/server"
import { initRedis, getAllConnections } from "@/lib/redis-db"

export async function GET() {
  try {
    console.log("[v0] Fetching aggregated exchange-positions statistics")
    
    await initRedis()
    const connections = await getAllConnections()
    const activeConnections = connections.filter(c => 
      (c.is_main_enabled === "1" || c.is_main_enabled === true) &&
      (c.is_enabled === "1" || c.is_enabled === true)
    )

    if (activeConnections.length === 0) {
      return NextResponse.json({
        symbols: []
      })
    }

    // For now, return mock symbols until we have real data aggregation
    // In production, this would aggregate from redis position data
    const symbols = [
      { symbol: "BTC/USDT", openPositions: 2, profitFactor250: 1.45, profitFactor50: 1.32 },
      { symbol: "ETH/USDT", openPositions: 1, profitFactor250: 1.28, profitFactor50: 1.15 },
      { symbol: "BNB/USDT", openPositions: 0, profitFactor250: 0.92, profitFactor50: 0.88 },
      { symbol: "XRP/USDT", openPositions: 1, profitFactor250: 1.52, profitFactor50: 1.68 },
      { symbol: "ADA/USDT", openPositions: 0, profitFactor250: 1.1, profitFactor50: 0.95 },
      { symbol: "DOGE/USDT", openPositions: 1, profitFactor250: 1.35, profitFactor50: 1.22 },
      { symbol: "SOL/USDT", openPositions: 2, profitFactor250: 1.62, profitFactor50: 1.45 },
      { symbol: "LINK/USDT", openPositions: 0, profitFactor250: 1.18, profitFactor50: 1.05 },
      { symbol: "LTC/USDT", openPositions: 1, profitFactor250: 1.42, profitFactor50: 1.38 },
      { symbol: "AVAX/USDT", openPositions: 0, profitFactor250: 0.98, profitFactor50: 0.92 },
      { symbol: "ARB/USDT", openPositions: 1, profitFactor250: 1.55, profitFactor50: 1.48 },
      { symbol: "OP/USDT", openPositions: 0, profitFactor250: 1.22, profitFactor50: 1.12 },
      { symbol: "MATIC/USDT", openPositions: 1, profitFactor250: 1.38, profitFactor50: 1.25 },
      { symbol: "APE/USDT", openPositions: 0, profitFactor250: 0.88, profitFactor50: 0.82 },
      { symbol: "FTM/USDT", openPositions: 1, profitFactor250: 1.31, profitFactor50: 1.28 },
      { symbol: "NEAR/USDT", openPositions: 0, profitFactor250: 1.44, profitFactor50: 1.39 },
      { symbol: "ATOM/USDT", openPositions: 1, profitFactor250: 1.25, profitFactor50: 1.18 },
      { symbol: "CRO/USDT", openPositions: 0, profitFactor250: 0.95, profitFactor50: 0.91 },
      { symbol: "PEPE/USDT", openPositions: 1, profitFactor250: 1.58, profitFactor50: 1.52 },
      { symbol: "INJ/USDT", openPositions: 0, profitFactor250: 1.36, profitFactor50: 1.29 },
      { symbol: "BLUR/USDT", openPositions: 1, profitFactor250: 1.19, profitFactor50: 1.1 },
      { symbol: "SEI/USDT", openPositions: 0, profitFactor250: 1.41, profitFactor50: 1.35 },
    ]

    console.log(`[v0] Returning ${symbols.length} symbols`)
    
    return NextResponse.json({
      symbols: symbols.slice(0, 22) // Return max 22 symbols as requested
    })
  } catch (error) {
    console.error("[v0] Failed to fetch exchange-positions statistics:", error)
    return NextResponse.json({
      symbols: []
    })
  }
}
