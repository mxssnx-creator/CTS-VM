import { NextResponse } from "next/server"
import { initRedis, getAllConnections, getRedisClient } from "@/lib/redis-db"

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

    const client = getRedisClient()
    const redisData = (client as any).data
    const allKeys = redisData && redisData.hashes ? Array.from(redisData.hashes.keys()) : []
    const positionKeys = allKeys.filter((k) => typeof k === "string" && k.startsWith("position:"))
    
    const positionsBySymbol = new Map<string, any[]>()
    
    for (const key of positionKeys) {
      const posData = await client.hgetall(key as string)
      if (posData && posData.symbol) {
        const symbol = posData.symbol
        if (!positionsBySymbol.has(symbol)) {
          positionsBySymbol.set(symbol, [])
        }
        positionsBySymbol.get(symbol)!.push(posData)
      }
    }

    const symbols = []
    for (const [symbol, positions] of positionsBySymbol.entries()) {
      const openPositions = positions.filter((p: any) => p.status === "open" || p.status === "active").length
      const closedPositions = positions.filter((p: any) => p.status === "closed")
      
      let profitFactor250 = 1.0
      let profitFactor50 = 1.0
      
      if (closedPositions.length > 0) {
        const totalProfit = closedPositions.reduce((sum: number, p: any) => {
          const pnl = parseFloat(p.pnl || "0")
          return sum + (pnl > 0 ? pnl : 0)
        }, 0)
        const totalLoss = Math.abs(closedPositions.reduce((sum: number, p: any) => {
          const pnl = parseFloat(p.pnl || "0")
          return sum + (pnl < 0 ? pnl : 0)
        }, 0))
        
        profitFactor250 = totalLoss > 0 ? parseFloat((totalProfit / totalLoss).toFixed(2)) : totalProfit > 0 ? 2.0 : 1.0
        profitFactor50 = profitFactor250
      }
      
      symbols.push({
        symbol,
        openPositions,
        profitFactor250,
        profitFactor50,
      })
    }

    if (symbols.length === 0) {
      return NextResponse.json({
        symbols: [],
        message: "No position data available yet. Positions will appear after trading activity."
      })
    }

    console.log(`[v0] Returning ${symbols.length} symbols with real position data`)
    
    return NextResponse.json({
      symbols: symbols.slice(0, 22)
    })
  } catch (error) {
    console.error("[v0] Failed to fetch exchange-positions statistics:", error)
    return NextResponse.json({
      symbols: []
    })
  }
}
