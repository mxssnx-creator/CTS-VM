import { NextResponse } from "next/server"
import { getAllConnections, updateConnection } from "@/lib/redis-db"

export async function POST() {
  try {
    console.log("[v0] [FixTestnetAPI] Starting testnet to mainnet conversion...")

    const connections = await getAllConnections()
    let bingxCount = 0
    let bybitCount = 0
    let okxCount = 0

    for (const conn of connections) {
      const exchange = (conn.exchange || conn.exchange_name || "").toLowerCase()
      if (exchange === "bingx") {
        await updateConnection(conn.id, { is_testnet: "0", updated_at: new Date().toISOString() })
        bingxCount++
      } else if (exchange === "bybit") {
        await updateConnection(conn.id, { is_testnet: "0", updated_at: new Date().toISOString() })
        bybitCount++
      } else if (exchange === "okx") {
        await updateConnection(conn.id, { is_testnet: "0", updated_at: new Date().toISOString() })
        okxCount++
      }
    }

    const total = bingxCount + bybitCount + okxCount
    console.log(`[v0] [FixTestnetAPI] Complete: Updated ${total} connections to mainnet`)

    return NextResponse.json({
      success: true,
      message: "All connections updated to mainnet",
      updated: {
        bingx: bingxCount,
        bybit: bybitCount,
        okx: okxCount,
      },
    })
  } catch (error) {
    console.error("[v0] [FixTestnetAPI] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
