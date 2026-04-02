import { NextResponse } from "next/server"
import { getRedisClient } from "@/lib/redis-db"

interface ActiveConfig {
  id: string
  preset_id: string
  connection_id: string
  symbol: string
  indicator_type: string
  indicator_params: Record<string, any>
  timeframe: string
  test_result_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  max_drawdown?: number
  drawdown_hours?: number
  sharpe_ratio?: number
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const connectionId = searchParams.get("connectionId")
    const symbol = searchParams.get("symbol")
    const indicatorType = searchParams.get("indicatorType")

    const redis = await getRedisClient()

    try {
      // Build Redis query based on filters
      const configIdsSetKey = `preset:${id}:active-configs`
      
      // Get config IDs based on filters
      let configIds: string[]
      
      if (connectionId || symbol || indicatorType) {
        // Need to intersect sets for filtering
        const setKeys: string[] = []
        
        if (connectionId) {
          setKeys.push(`preset:${id}:active-config:connection:${connectionId}`)
        }
        if (symbol) {
          setKeys.push(`preset:${id}:active-config:symbol:${symbol}`)
        }
        if (indicatorType) {
          setKeys.push(`preset:${id}:active-config:type:${indicatorType}`)
        }
        
        if (setKeys.length > 0) {
          // Interesect the filter sets
          const tempSetKey = `temp:intersect:${Date.now()}`
          await redis.sInterStore(tempSetKey, setKeys)
          configIds = await redis.sMembers(tempSetKey)
          await redis.del(tempSetKey)
        } else {
          configIds = await redis.sMembers(configIdsSetKey)
        }
      } else {
        // Get all active config IDs for this preset
        configIds = await redis.sMembers(configIdsSetKey)
      }

      // Get sorted order by profit_factor (use ZREVRANGE from profit_factor_scores)
      const scoredConfigIds = await redis.zrevrange(`preset:${id}:active-configs:by-profit`, 0, 99)
      
      // Intersect with filtered IDs if filters applied
      if (connectionId || symbol || indicatorType) {
        const filteredSet = new Set(configIds)
        const orderedIds = scoredConfigIds.filter(id => filteredSet.has(id)).slice(0, 100)
        configIds = orderedIds
      } else {
        configIds = scoredConfigIds.slice(0, 100)
      }

      if (configIds.length === 0) {
        return NextResponse.json([])
      }

      // Fetch config hashes and test result hashes in pipeline
      const pipeline = redis.pipeline()
      const configHashes: Record<string, any> = {}
      const testResultIds: string[] = []

      configIds.forEach(configId => {
        pipeline.hGetAll(`preset:active-config:${configId}`)
      })

      const results = await pipeline.exec()

      if (!results) {
        return NextResponse.json([])
      }

      const configs: ActiveConfig[] = []

      results.forEach((result, index) => {
        if (result && result[1]) {
          const configData = result[1]
          const testResultId = configData.test_result_id
          
          if (testResultId && testResultId !== 'null' && testResultId !== '') {
            testResultIds.push(testResultId)
          }
          
          configHashes[configIds[index]] = configData
        }
      })

      // Fetch test results in separate pipeline if needed
      if (testResultIds.length > 0) {
        const testResultPipeline = redis.pipeline()
        const testResultHashes: Record<string, any> = {}
        
        testResultIds.forEach(testResultId => {
          testResultPipeline.hGetAll(`preset:test-result:${testResultId}`)
        })
        
        const testResults = await testResultPipeline.exec()
        
        if (testResults) {
          testResults.forEach((result, index) => {
            if (result && result[1]) {
              testResultHashes[testResultIds[index]] = result[1]
            }
          })
        }

        // Merge test result data into configs
        Object.keys(configHashes).forEach(configId => {
          const config = configHashes[configId]
          const testResultId = config.test_result_id
          
          if (testResultId && testResultHashes[testResultId]) {
            config.max_drawdown = parseFloat(testResultHashes[testResultId].max_drawdown) || null
            config.drawdown_hours = parseFloat(testResultHashes[testResultId].drawdown_hours) || null
            config.sharpe_ratio = parseFloat(testResultHashes[testResultId].sharpe_ratio) || null
          } else {
            config.max_drawdown = null
            config.drawdown_hours = null
            config.sharpe_ratio = null
          }
          
          // Ensure indicator_params is parsed from JSON if stored as string
          if (config.indicator_params && typeof config.indicator_params === 'string') {
            try {
              config.indicator_params = JSON.parse(config.indicator_params)
            } catch {
              config.indicator_params = {}
            }
          }
          
          configs.push(config as ActiveConfig)
        })
      } else {
        // No test results, just return configs with null test result fields
        Object.keys(configHashes).forEach(configId => {
          const config = configHashes[configId]
          config.max_drawdown = null
          config.drawdown_hours = null
          config.sharpe_ratio = null
          
          if (config.indicator_params && typeof config.indicator_params === 'string') {
            try {
              config.indicator_params = JSON.parse(config.indicator_params)
            } catch {
              config.indicator_params = {}
            }
          }
          
          configs.push(config as ActiveConfig)
        })
      }

      return NextResponse.json(configs)
    } catch (dbError) {
      console.error("[v0] Redis query failed:", dbError)
      // Return empty array instead of error to prevent UI crash
      return NextResponse.json([])
    }
  } catch (error) {
    console.error("[v0] Failed to fetch active configurations:", error)
    // Return empty array instead of error
    return NextResponse.json([])
  }
}
