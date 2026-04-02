import { NextResponse } from "next/server"
import { getRedisClient, getRedisStats } from "@/lib/redis-db"

export async function GET() {
  try {
    const client = getRedisClient()
    
    // Get all Redis keys
    const keys = await client.keys("*")
    const keyCount = keys ? keys.length : 0
    
    // Get Redis stats
    const stats = getRedisStats()
    
    return NextResponse.json({
      success: true,
      database_type: "redis",
      key_count: keyCount,
      keys_sample: keys ? keys.slice(0, 50) : [],
      info: stats
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
