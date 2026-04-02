import { NextResponse } from "next/server"
import { getRedisClient } from "@/lib/redis-db"
import { USER_CONNECTIONS } from "@/lib/user-connections-config"
import { successResponse, errorResponse } from "@/lib/api-response"

/**
 * Import user-configured connections into Redis
 * POST /api/settings/connections/import-user
 */
export async function POST() {
  try {
    let imported = 0
    let skipped = 0
    const errors: string[] = []
    const client = getRedisClient()

    // Fetch existing connection IDs once
    const existingIds = await client.smembers("connections")

    for (const userConn of USER_CONNECTIONS) {
      try {
        // Check if connection already exists
        const exists = existingIds.includes(userConn.id)

        if (exists) {
          console.log(`[v0] Skipping ${userConn.displayName} - already exists`)
          skipped++
          continue
        }

        // Insert the connection as a Redis hash
        const connectionData: Record<string, string> = {
          id: userConn.id,
          name: userConn.name,
          exchange: userConn.exchange,
          api_type: userConn.apiType,
          connection_method: "rest",
          connection_library: "native",
          api_key: userConn.apiKey,
          api_secret: userConn.apiSecret,
          margin_type: userConn.marginType || "cross",
          position_mode: userConn.positionMode || "hedge",
          is_testnet: userConn.isTestnet ? "1" : "0",
          is_enabled: "1", // Enabled by default
          is_live_trade: "0",
          is_preset_trade: "0",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        await client.hset(`connection:${userConn.id}`, connectionData)
        await client.sadd("connections", userConn.id)

        console.log(`[v0] ✓ Imported ${userConn.displayName}`)
        imported++
      } catch (error) {
        const errorMsg = `Failed to import ${userConn.displayName}: ${error instanceof Error ? error.message : String(error)}`
        console.error(`[v0] ${errorMsg}`)
        errors.push(errorMsg)
      }
    }

    return successResponse({
      imported,
      skipped,
      total: USER_CONNECTIONS.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error("[v0] Error importing user connections:", error)
    return errorResponse("Failed to import user connections", {
      status: 500,
      details: error instanceof Error ? error.message : "Unknown error",
    })
  }
}

/**
 * Get list of available user connections
 * GET /api/settings/connections/import-user
 */
export async function GET() {
  try {
    const client = getRedisClient()
    const existingConnections = await client.smembers("connections")

    // Get list of user connections with their import status
    const connections = USER_CONNECTIONS.map((userConn) => {
      const isImported = existingConnections.includes(userConn.id)

      return {
        id: userConn.id,
        name: userConn.name,
        exchange: userConn.exchange,
        displayName: userConn.displayName,
        apiType: userConn.apiType,
        connectionType: userConn.connectionType,
        maxLeverage: userConn.maxLeverage,
        documentation: userConn.documentation,
        installCommands: userConn.installCommands,
        imported: isImported,
        enabled: false, // will be fetched asynchronously below
        dbId: isImported ? userConn.id : null,
      }
    })

    // Fetch enabled status for imported connections in parallel
    const enrichedConnections = await Promise.all(
      connections.map(async (conn) => {
        if (conn.imported) {
          const data = await client.hgetall(`connection:${conn.id}`)
          if (data && Object.keys(data).length > 0) {
            return {
              ...conn,
               enabled: data.is_enabled === "1",
            }
          }
        }
        return conn
      })
    )

    return successResponse(enrichedConnections)
  } catch (error) {
    console.error("[v0] Error getting user connections:", error)
    return errorResponse("Failed to get user connections", {
      status: 500,
      details: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
