import { createConnection, getAllConnections, getConnection, initRedis } from "@/lib/redis-db"

/**
 * PREDEFINED EXCHANGE INFO - Just informational templates (not connections)
 * These are reference data about supported exchanges
 */
export const PREDEFINED_EXCHANGE_INFO = [
  {
    exchange: "bybit",
    name: "Bybit",
    description: "Bybit futures trading platform",
    api_type: "perpetual_futures",
    margin_type: "cross",
    position_mode: "hedge",
  },
  {
    exchange: "bingx",
    name: "BingX",
    description: "BingX perpetual futures platform",
    api_type: "perpetual_futures",
    margin_type: "cross",
    position_mode: "hedge",
  },
  {
    exchange: "binance",
    name: "Binance",
    description: "Binance futures trading platform",
    api_type: "perpetual_futures",
    margin_type: "cross",
    position_mode: "hedge",
  },
  {
    exchange: "okx",
    name: "OKX",
    description: "OKX futures trading platform",
    api_type: "perpetual_futures",
    margin_type: "cross",
    position_mode: "hedge",
  },
]

/**
 * Seeds BASE CONNECTIONS from predefined exchange info
 * Base connections are ENABLED by default in Settings
 * But NOT assigned to Active panel (user must add them)
 */
export async function seedDefaultExchanges() {
  console.log("[v0] Seeding base connections from predefined info...")
  await initRedis()

  try {
    for (const info of PREDEFINED_EXCHANGE_INFO) {
      const connectionId = `${info.exchange}-base`

      const existing = await getConnection(connectionId)
      if (existing) {
        console.log(`[v0] Base connection ${info.exchange} already exists, skipping`)
        continue
      }

      // Create BASE CONNECTION - ENABLED by default, NOT in Active panel
      const baseConnection = {
        id: connectionId,
        user_id: 1,
        name: `${info.name} Connection`,
        exchange: info.exchange,
        exchange_id: info.exchange.toUpperCase(),
        api_type: info.api_type,
        api_subtype: "perpetual",
        connection_method: "rest",
        connection_library: "native",
        api_key: "",
        api_secret: "",
        api_passphrase: "",
        margin_type: info.margin_type,
        position_mode: info.position_mode,
        is_testnet: false, // Production by default
        is_enabled: true, // ENABLED in Settings by default
        is_live_trade: false,
        is_preset_trade: false,
        is_active: false,
        is_predefined: false, // NOT predefined - this is a real connection
        is_active_assigned: false, // NOT in Active panel by default
        is_main_enabled: false, // Main page toggle OFF
        is_assigned: false,
        volume_factor: 1.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_test_status: "not_tested",
        last_test_log: [],
        connection_settings: {
          description: info.description,
          baseVolumeFactorLive: 1.0,
          baseVolumeFactorPreset: 1.0,
          profitFactorMinBase: 0.6,
          profitFactorMinMain: 0.6,
          profitFactorMinReal: 0.6,
          trailingWithTrailing: true,
          trailingOnly: false,
          blockEnabled: true,
          blockOnly: false,
          dcaEnabled: false,
          dcaOnly: false,
        },
      }

      await createConnection(baseConnection)
      console.log(`[v0] Created base connection: ${info.exchange} (enabled in Settings)`)
    }

    console.log("[v0] Base connections seeding completed")
    return { success: true, message: "Base connections created successfully" }
  } catch (error) {
    console.error("[v0] Error seeding base connections:", error)
    return { success: false, error: String(error) }
  }
}

/**
 * Ensures base connections exist for all predefined exchanges
 */
export async function ensureDefaultExchangesExist() {
  console.log("[v0] Ensuring base connections exist...")
  await initRedis()

  try {
    const allConnections = await getAllConnections()
    const baseConnectionIds = PREDEFINED_EXCHANGE_INFO.map((e) => `${e.exchange}-base`)
    
    // Check if any base connections are missing
    const existingIds = allConnections?.map((c) => c.id) || []
    const missingConnections = baseConnectionIds.filter((id) => !existingIds.includes(id))

    if (missingConnections.length > 0) {
      console.log(`[v0] Missing base connections: ${missingConnections.join(", ")}`)
      await seedDefaultExchanges()
    } else {
      console.log("[v0] All base connections exist")
    }

    return { success: true }
  } catch (error) {
    console.error("[v0] Error ensuring base connections:", error)
    return { success: false, error: String(error) }
  }
}

/**
 * Get list of available base connections (enabled in Settings, can be added to Main panel)
 */
export async function getAvailableBaseConnections() {
  await initRedis()
  const allConnections = await getAllConnections()
  
  // Return base connections that are ENABLED but NOT yet in Active panel
  return allConnections?.filter((c) => {
    const isEnabled = c.is_enabled === true || c.is_enabled === "1"
    const isInActivePanel = c.is_active_assigned === true || c.is_active_assigned === "1"
    return isEnabled && !isInActivePanel
  }) || []
}
