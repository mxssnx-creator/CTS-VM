// Migration 015 - Fix connection inserted/enabled states
// Uses Upstash REST API directly (no TypeScript, no path aliases)

const REDIS_URL = process.env.KV_REST_API_URL
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN

if (!REDIS_URL || !REDIS_TOKEN) {
  console.error("Missing KV_REST_API_URL or KV_REST_API_TOKEN")
  process.exit(1)
}

async function redisCommand(...args) {
  const res = await fetch(`${REDIS_URL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data.result
}

async function redisPipeline(commands) {
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  })
  const data = await res.json()
  return data
}

async function main() {
  console.log("[Migration 015] Starting - Fix connection inserted/enabled states")
  
  // Check current schema version
  const currentVersion = await redisCommand("GET", "_schema_version")
  console.log(`[Migration 015] Current schema version: ${currentVersion}`)
  
  // Get all connection IDs
  const connectionIds = await redisCommand("SMEMBERS", "connections")
  console.log(`[Migration 015] Total connections in Redis: ${connectionIds.length}`)
  
  if (connectionIds.length === 0) {
    console.log("[Migration 015] No connections found - nothing to do")
    return
  }
  
  // The 4 base exchanges that should be INSERTED and ENABLED
  const baseExchangeIds = ["bybit-x03", "bingx-x01", "binance-x01", "okx-x01"]
  
  let updatedBase = 0
  let updatedOther = 0
  
  for (const connId of connectionIds) {
    // Get current data
    const connData = await redisCommand("HGETALL", `connection:${connId}`)
    
    // HGETALL returns flat array: [key1, val1, key2, val2, ...]
    const obj = {}
    if (Array.isArray(connData)) {
      for (let i = 0; i < connData.length; i += 2) {
        obj[connData[i]] = connData[i + 1]
      }
    }
    
    console.log(`[Migration 015] Before: ${connId} -> is_assigned=${obj.is_assigned}, is_enabled=${obj.is_enabled}, is_predefined=${obj.is_predefined}`)
    
    const now = new Date().toISOString()
    
    if (baseExchangeIds.includes(connId)) {
      // Mark as INSERTED and ENABLED (base connection)
      await redisCommand("HSET", `connection:${connId}`, 
        "is_assigned", "1",
        "is_enabled", "1", 
        "is_predefined", "1",
        "updated_at", now
      )
      updatedBase++
      console.log(`[Migration 015] Updated: ${connId} -> inserted=1, enabled=1 (BASE CONNECTION)`)
    } else {
      // Template only - NOT inserted, NOT enabled
      await redisCommand("HSET", `connection:${connId}`,
        "is_assigned", "0",
        "is_enabled", "0",
        "is_predefined", "1",
        "is_main_enabled", "0",
        "updated_at", now
      )
      updatedOther++
      console.log(`[Migration 015] Updated: ${connId} -> inserted=0, enabled=0 (TEMPLATE ONLY)`)
    }
  }
  
  // Update schema version to 15
  await redisCommand("SET", "_schema_version", "15")
  
  console.log(`[Migration 015] COMPLETE: ${updatedBase} base connections, ${updatedOther} template connections`)
  console.log(`[Migration 015] Schema version updated to 15`)
  
  // Verify base connections
  for (const baseId of baseExchangeIds) {
    const data = await redisCommand("HGETALL", `connection:${baseId}`)
    const obj = {}
    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i += 2) {
        obj[data[i]] = data[i + 1]
      }
    }
    console.log(`[Migration 015] VERIFY ${baseId}: is_assigned=${obj.is_assigned}, is_enabled=${obj.is_enabled}, is_main_enabled=${obj.is_main_enabled}`)
  }
}

main().catch(err => {
  console.error("[Migration 015] FAILED:", err)
  process.exit(1)
})
