import { type NextRequest, NextResponse } from "next/server"
import { getAllConnections, initRedis, createConnection, updateConnection } from "@/lib/redis-db"
import { generateConnectionIdFromApiKey, isApiKeyInUse } from "@/lib/connection-id-manager"
import { CONNECTION_PREDEFINITIONS } from "@/lib/connection-predefinitions"
import { API_VERSIONS } from "@/lib/system-version"

export const runtime = "nodejs"

const API_VERSION = API_VERSIONS.connections
const ACTIVE_AUTO_INSERTED = ["bybit", "bingx"]

export async function GET(request: NextRequest) {
  try {
    // Set explicit cache-control headers to prevent caching
    const headers = {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
      "X-API-Version": API_VERSION,
    }
    
    const { searchParams } = new URL(request.url)
    const clientVersion = searchParams.get("v")
    const exchange = searchParams.get("exchange")
    const enabled = searchParams.get("enabled")
    const active = searchParams.get("active")

    console.log(`[v0] [API] [Connections] ${API_VERSION} - Client version: ${clientVersion}`)

    await initRedis()
    let connections = await getAllConnections()

    // CRITICAL MIGRATION: Enforce ONLY bybit and bingx as active-insertable
    // This must run on every request to ensure consistency
    console.log(`[v0] [API] [Connections] ${API_VERSION}: Checking ${connections.length} connections for migration...`)
    
    // Only update connections if active_inserted flags are incorrect
    // Don't update on every request - that causes performance issues and potential duplicates
    let migratedCount = 0
    const connectionsNeedingUpdate: any[] = []
    
    for (const c of connections) {
      const exch = (c.exchange || "").toLowerCase().trim()
      const shouldBeActive = ACTIVE_AUTO_INSERTED.includes(exch)
      const activeInserted = c.is_active_assigned === "1" || c.is_active_assigned === true
      const needsActiveSet = shouldBeActive && !activeInserted
      const needsActiveReset = !shouldBeActive && activeInserted
      
      if (needsActiveSet || needsActiveReset) {
        connectionsNeedingUpdate.push({ connection: c, shouldBeActive })
      }
    }
    
    // Only perform updates if there are actual changes needed
    if (connectionsNeedingUpdate.length > 0) {
      for (const { connection: c, shouldBeActive } of connectionsNeedingUpdate) {
        const newValue = shouldBeActive ? "1" : "0"
        await updateConnection(c.id, {
          ...c,
          is_active_assigned: newValue,
          updated_at: new Date().toISOString(),
        })
        migratedCount++
        console.log(`[v0] [API] [Connections] ${API_VERSION}: ${c.exchange}: is_active_assigned=${shouldBeActive ? "SET to 1" : "RESET to 0"}`)
      }
      console.log(`[v0] [API] [Connections] ${API_VERSION}: Updated ${migratedCount} connections`)
      // Reload after updates
      connections = await getAllConnections()
    } else {
      console.log(`[v0] [API] [Connections] ${API_VERSION}: All active flags correct, no updates needed`)
    }

    // Auto-initialize ONLY user-created connections (not predefined templates)
    // Predefined connections are informational only and should NOT be stored in Redis
    if (connections.length === 0) {
      console.log("[v0] [API] No connections found in Redis, using file-based predefined templates as information only")
      console.log("[v0] [API] User must create actual connections from templates - none auto-initialized")
      
      // DO NOT auto-create predefined connections
      // They remain as file-based templates only
      // The initializeDefaultUserConnections() in redis-db.ts handles creating 4 user-created connections
    }

    if (exchange) {
      connections = connections.filter((c) => c.exchange?.toLowerCase() === exchange.toLowerCase())
    }

    // Filter by is_enabled for trade engine status (Settings connections)
    if (enabled === "true") {
      connections = connections.filter((c) => {
        // Handle both boolean and string representations
        const isEnabled = c.is_enabled === true || c.is_enabled === "1" || c.is_enabled === "true"
        return isEnabled
      })
    }

    // Filter by is_main_enabled for actively using connections (INDEPENDENT from Settings)
    if (active === "true") {
      connections = connections.filter((c) => {
        // Handle both boolean and string representations
        const isEnabledDash = c.is_main_enabled === true || c.is_main_enabled === "1" || c.is_main_enabled === "true"
        return isEnabledDash
      })
    }

    // Log what we're returning
    const bybitBingx = connections.filter(c => ["bybit", "bingx"].includes((c.exchange || "").toLowerCase()))
    console.log(`[v0] [API] [Connections] ${API_VERSION}: Returning ${connections.length} total connections`)
    console.log(`[v0] [API] [Connections] ${API_VERSION}: Active-inserted (bybit/bingx):`, 
      bybitBingx.map(c => ({ name: c.name, exchange: c.exchange, is_active_assigned: c.is_active_assigned })))
    
    return NextResponse.json({ success: true, count: connections.length, connections, version: API_VERSION }, { headers })
  } catch (error) {
    console.error(`[v0] [API] [Connections] ${API_VERSION}: Error:`, error instanceof Error ? error.message : String(error))
    return NextResponse.json({ success: false, error: "Failed to fetch connections", connections: [], version: API_VERSION }, { status: 500, headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "X-API-Version": API_VERSION,
    }})
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    // Validate required fields
    if (!body.name || !body.exchange || !body.api_key || !body.api_secret) {
      return NextResponse.json(
        { error: "Missing required fields: name, exchange, api_key, api_secret" },
        { status: 400 }
      )
    }

    await initRedis()

    // Check if API key is already in use
    const exists = await isApiKeyInUse(body.exchange, body.api_key)
    if (exists) {
      return NextResponse.json(
        { 
          error: "This API key is already connected",
          details: "Please remove the existing connection first or use a different API key"
        },
        { status: 409 }
      )
    }

    // Generate unique connection ID based on exchange + API key
    const connectionId = generateConnectionIdFromApiKey(body.exchange, body.api_key)

    // Create connection object with all required fields
    const connection = {
      id: connectionId,
      name: body.name,
      exchange: body.exchange,
      api_key: body.api_key,
      api_secret: body.api_secret,
      api_passphrase: body.api_passphrase || "",
      api_type: body.api_type || "perpetual_futures",
      api_subtype: body.api_type === "unified" ? (body.api_subtype || "perpetual") : undefined,
      connection_method: body.connection_method || "rest",
      connection_library: body.connection_library || "native",
      margin_type: body.margin_type || "cross",
      position_mode: body.position_mode || "hedge",
      is_testnet: body.is_testnet || false,
      is_enabled: body.is_enabled === true, // Settings: enabled by default for base connections
      is_assigned: true, // User-created connection is "inserted" (available for use)
      is_main_assigned: false, // Not yet added to Active Connections dashboard
      is_active_assigned: false, // Not yet in Active panel
      is_main_enabled: false, // Dashboard toggle OFF by default
      is_active: false, // Not actively processing
      is_predefined: false, // User-created, not predefined template
      is_live_trade: false,
      is_preset_trade: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // Save to Redis database
    await createConnection(connection)

    console.log("[v0] [API] Connection created successfully:", {
      id: connectionId,
      name: body.name,
      exchange: body.exchange,
    })

    // Auto-test the newly created connection (non-blocking)
    let testResult = null
    if (body.api_key && body.api_secret) {
      try {
        console.log("[v0] [API] Auto-testing newly created connection:", connectionId)
        const testResponse = await fetch(
          new URL(`/api/settings/connections/${connectionId}/test`, process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000").toString(),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: "creation" }),
          }
        )
        if (testResponse.ok) {
          testResult = await testResponse.json()
          console.log("[v0] [API] Auto-test result:", testResult.success ? "PASSED" : "FAILED")
        }
      } catch (testError) {
        console.log("[v0] [API] Auto-test skipped (non-blocking error):", testError instanceof Error ? testError.message : "Unknown")
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: "Connection created successfully",
        id: connectionId,
        connectionId: connectionId,
        autoTest: testResult ? { ran: true, success: testResult.success } : { ran: false, reason: "No API credentials provided" },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("[v0] Error creating connection:", error instanceof Error ? error.message : String(error))
    return NextResponse.json(
      { error: "Failed to create connection", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
