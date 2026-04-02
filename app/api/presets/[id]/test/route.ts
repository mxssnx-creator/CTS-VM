import { NextResponse } from "next/server"
import { PresetConfigGenerator } from "@/lib/preset-config-generator"
import { PresetTester } from "@/lib/preset-tester"
import { getRedisClient } from "@/lib/redis-db"
import type { Preset } from "@/lib/types"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const client = getRedisClient()
  try {
    const { id } = await params
    const body = await request.json()
    const { connectionId, symbols, testPeriodHours = 12 } = body

    // Get preset configuration from Redis
    const presetData = await client.hgetall(`preset:${id}`)
    const preset = presetData && Object.keys(presetData).length > 0 ? presetData as unknown as Preset : null

    if (!preset) {
      return NextResponse.json({ error: "Preset not found" }, { status: 404 })
    }

    // Generate indicator configurations
    const indicatorConfigs = PresetConfigGenerator.generateIndicatorConfigs()

    // Generate all test configurations (limit to 500)
    const testSymbols = symbols && symbols.length > 0 ? symbols : ["BTCUSDT", "ETHUSDT", "XRPUSDT"]
    const configurations = await PresetConfigGenerator.generateAllConfigurations(testSymbols, indicatorConfigs, 500)

    console.log(`[v0] Generated ${configurations.length} configurations to test`)

    // Initialize tester
    const tester = new PresetTester(connectionId)

    // Test configurations
    const results = await tester.testConfigurations(configurations, testPeriodHours)

    // Filter valid configurations
    const validConfigs = PresetConfigGenerator.filterValidConfigurations(
      configurations,
      results,
      Number(preset.min_profit_factor),
      12, // max drawdown hours
    )

    console.log(`[v0] Found ${validConfigs.length} valid configurations`)

    // Save results to database
    await tester.saveResults(id)

    // Save valid configurations as active in Redis
    for (const config of validConfigs.slice(0, 100)) {
      // Limit to top 100
      const result = results.get(config.id)
      if (!result) continue

      const configId = config.id
      const activeConfigKey = `preset:active-config:${configId}`

      // Store active configuration as hash
      await client.hset(activeConfigKey, {
        preset_id: id,
        connection_id: connectionId,
        config_id: configId,
        indicator_type: config.indicator.type,
        indicator_params: JSON.stringify(config.indicator.params),
        symbol: config.symbol,
        timeframe: config.timeframe,
        takeprofit_factor: config.takeprofit_factor.toString(),
        stoploss_ratio: config.stoploss_ratio.toString(),
        trailing_enabled: config.trailing_enabled ? "1" : "0",
        trail_start: config.trail_start?.toString() || "",
        trail_stop: config.trail_stop?.toString() || "",
        profit_factor: result.profitFactor.toString(),
        win_rate: result.winRate.toString(),
        total_trades: result.totalTrades.toString(),
        is_active: "1",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      // Add to index sets
      await client.sadd(`preset:${id}:active-configs`, configId)
      await client.zadd(`preset:${id}:active-configs:by-profit`, result.profitFactor, configId)

      // Add to filter sets
      await client.sadd(`preset:${id}:active-config:connection:${connectionId}`, configId)
      await client.sadd(`preset:${id}:active-config:symbol:${config.symbol}`, configId)
      await client.sadd(`preset:${id}:active-config:type:${config.indicator.type}`, configId)
    }

    return NextResponse.json({
      success: true,
      totalConfigurations: configurations.length,
      validConfigurations: validConfigs.length,
      testedSymbols: testSymbols,
      testPeriodHours,
    })
   } catch (error) {
     console.error("[v0] Failed to test preset configurations:", error)
     return NextResponse.json({ error: "Failed to test configurations" }, { status: 500 })
   } finally {
     await client.quit()
   }
}
