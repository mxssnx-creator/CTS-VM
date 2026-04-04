import { type NextRequest, NextResponse } from "next/server"
import { initRedis, getSettings } from "@/lib/redis-db"

const EXCHANGE_SYMBOLS: Record<string, { symbol: string; volume24h: number }[]> = {
  bingx: [
    { symbol: "BTC-USDT", volume24h: 1500000000 },
    { symbol: "ETH-USDT", volume24h: 800000000 },
    { symbol: "SOL-USDT", volume24h: 500000000 },
    { symbol: "XRP-USDT", volume24h: 300000000 },
    { symbol: "ADA-USDT", volume24h: 200000000 },
    { symbol: "DOGE-USDT", volume24h: 150000000 },
    { symbol: "AVAX-USDT", volume24h: 100000000 },
    { symbol: "DOT-USDT", volume24h: 80000000 },
    { symbol: "MATIC-USDT", volume24h: 70000000 },
    { symbol: "LINK-USDT", volume24h: 60000000 },
  ],
  bybit: [
    { symbol: "BTCUSDT", volume24h: 2000000000 },
    { symbol: "ETHUSDT", volume24h: 1000000000 },
    { symbol: "SOLUSDT", volume24h: 600000000 },
    { symbol: "XRPUSDT", volume24h: 400000000 },
    { symbol: "ADAUSDT", volume24h: 250000000 },
  ],
  binance: [
    { symbol: "BTCUSDT", volume24h: 3000000000 },
    { symbol: "ETHUSDT", volume24h: 1500000000 },
    { symbol: "SOLUSDT", volume24h: 800000000 },
    { symbol: "BNBUSDT", volume24h: 500000000 },
    { symbol: "XRPUSDT", volume24h: 400000000 },
  ],
  okx: [
    { symbol: "BTC-USDT", volume24h: 1800000000 },
    { symbol: "ETH-USDT", volume24h: 900000000 },
    { symbol: "SOL-USDT", volume24h: 550000000 },
    { symbol: "XRP-USDT", volume24h: 350000000 },
  ],
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ exchange: string }> }) {
  try {
    await initRedis()
    const { exchange } = await params
    const { searchParams } = new URL(_request.url)
    const limit = parseInt(searchParams.get("limit") || "50", 10)
    const symbols = EXCHANGE_SYMBOLS[exchange.toLowerCase()] || []
    const sorted = symbols.sort((a, b) => b.volume24h - a.volume24h).slice(0, limit)
    return NextResponse.json({ success: true, symbols: sorted })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch exchange symbols", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
