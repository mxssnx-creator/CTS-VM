"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { 
  BarChart3, Clock, Database, Activity, ArrowUpDown,
  TrendingUp, Target, Zap, CircleDollarSign, RefreshCw
} from "lucide-react"

interface PrehistoricMetrics {
  dataLoaded: number
  cyclesCompleted: number
  symbolsProcessed: number
  isActive: boolean
  progress: number
}

interface ProcessingMetrics {
  symbolsProcessed: number
  totalDataSizeMB: number
  totalCycles: number
  successfulCycles: number
  failedCycles: number
  cycleSuccessRate: number
  avgCycleDurationMs: number
}

interface IndicationMetrics {
  total: number
  direction: number
  move: number
  active: number
  optimal: number
  common: number
  rsi: number
  macd: number
  bollinger: number
  evaluated: number
  evaluationRate: number
}

interface StrategyMetrics {
  baseCreated: number
  baseEvaluated: number
  mainCreated: number
  mainEvaluated: number
  mainEvaluationRate: number
  realCreated: number
  realEvaluated: number
  realEvaluationRate: number
  avgProfitFactor: number
}

interface PositionMetrics {
  pseudoActive: number
  realActive: number
  exchangeLive: number
  totalCreated: number
}

interface FunctionalOverviewData {
  prehistoric: PrehistoricMetrics
  processing: ProcessingMetrics
  indications: IndicationMetrics
  strategies: StrategyMetrics
  positions: PositionMetrics
  lastUpdated: string
}

const initialData: FunctionalOverviewData = {
  prehistoric: {
    dataLoaded: 0,
    cyclesCompleted: 0,
    symbolsProcessed: 0,
    isActive: false,
    progress: 0
  },
  processing: {
    symbolsProcessed: 0,
    totalDataSizeMB: 0,
    totalCycles: 0,
    successfulCycles: 0,
    failedCycles: 0,
    cycleSuccessRate: 0,
    avgCycleDurationMs: 0
  },
  indications: {
    total: 0,
    direction: 0,
    move: 0,
    active: 0,
    optimal: 0,
    common: 0,
    rsi: 0,
    macd: 0,
    bollinger: 0,
    evaluated: 0,
    evaluationRate: 0
  },
  strategies: {
    baseCreated: 0,
    baseEvaluated: 0,
    mainCreated: 0,
    mainEvaluated: 0,
    mainEvaluationRate: 0,
    realCreated: 0,
    realEvaluated: 0,
    realEvaluationRate: 0,
    avgProfitFactor: 0
  },
  positions: {
    pseudoActive: 0,
    realActive: 0,
    exchangeLive: 0,
    totalCreated: 0
  },
  lastUpdated: new Date().toISOString()
}

export function FunctionalOverview() {
  const [data, setData] = useState<FunctionalOverviewData>(initialData)
  const [loading, setLoading] = useState(true)
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date())

  const fetchOverviewData = async () => {
    try {
      const response = await fetch("/api/trade-engine/functional-overview", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      })
      
      if (response.ok) {
        const overviewData = await response.json()
        setData(overviewData)
        setLastUpdateTime(new Date())
      }
    } catch (error) {
      console.error("Failed to load functional overview:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOverviewData()
    const interval = setInterval(fetchOverviewData, 5000)
    return () => clearInterval(interval)
  }, [])

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toFixed(0)
  }

  const formatMB = (mb: number): string => {
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
    return `${mb.toFixed(2)} MB`
  }

  return (
    <Card className="mb-6">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Functional Overview</h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            <span>Auto-refresh 5s</span>
            <span>•</span>
            <span>Last update: {lastUpdateTime.toLocaleTimeString()}</span>
          </div>
        </div>

        {/* Prehistoric Phase */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Prehistoric Phase</h3>
            {data.prehistoric.isActive && <Badge className="text-[10px]">Active</Badge>}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-2 rounded-lg bg-muted/30 text-center">
              <div className="text-lg font-bold">{formatNumber(data.prehistoric.symbolsProcessed)}</div>
              <div className="text-[10px] text-muted-foreground">Symbols Processed</div>
            </div>
            <div className="p-2 rounded-lg bg-muted/30 text-center">
              <div className="text-lg font-bold">{formatNumber(data.prehistoric.cyclesCompleted)}</div>
              <div className="text-[10px] text-muted-foreground">Cycles Completed</div>
            </div>
            <div className="p-2 rounded-lg bg-muted/30 text-center">
              <div className="text-lg font-bold">{formatMB(data.prehistoric.dataLoaded)}</div>
              <div className="text-[10px] text-muted-foreground">Data Loaded</div>
            </div>
            <div className="p-2 rounded-lg bg-muted/30 text-center">
              <div className="text-lg font-bold">{data.prehistoric.progress.toFixed(1)}%</div>
              <div className="text-[10px] text-muted-foreground">Progress</div>
              <Progress value={data.prehistoric.progress} className="h-1 mt-1" />
            </div>
          </div>
        </div>

        {/* Processing Metrics */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Processing Data</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="p-2 rounded-lg bg-muted/30 text-center">
              <div className="text-lg font-bold">{data.processing.symbolsProcessed}</div>
              <div className="text-[10px] text-muted-foreground">Symbols</div>
            </div>
            <div className="p-2 rounded-lg bg-muted/30 text-center">
              <div className="text-lg font-bold">{formatMB(data.processing.totalDataSizeMB)}</div>
              <div className="text-[10px] text-muted-foreground">Data Size</div>
            </div>
            <div className="p-2 rounded-lg bg-muted/30 text-center">
              <div className="text-lg font-bold">{formatNumber(data.processing.totalCycles)}</div>
              <div className="text-[10px] text-muted-foreground">Total Cycles</div>
            </div>
            <div className="p-2 rounded-lg bg-muted/30 text-center">
              <div className="text-lg font-bold text-green-600">{formatNumber(data.processing.successfulCycles)}</div>
              <div className="text-[10px] text-muted-foreground">Success</div>
            </div>
            <div className="p-2 rounded-lg bg-muted/30 text-center">
              <div className="text-lg font-bold text-red-600">{data.processing.failedCycles}</div>
              <div className="text-[10px] text-muted-foreground">Failed</div>
            </div>
            <div className="p-2 rounded-lg bg-muted/30 text-center">
              <div className="text-lg font-bold">{data.processing.cycleSuccessRate.toFixed(1)}%</div>
              <div className="text-[10px] text-muted-foreground">Success Rate</div>
              <Progress value={data.processing.cycleSuccessRate} className="h-1 mt-1" />
            </div>
            <div className="p-2 rounded-lg bg-muted/30 text-center">
              <div className="text-lg font-bold">{data.processing.avgCycleDurationMs}ms</div>
              <div className="text-[10px] text-muted-foreground">Avg Cycle</div>
            </div>
          </div>
        </div>

        {/* Indications */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Indications Evaluated</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-2">
            <div className="p-2 rounded-lg bg-muted/30 text-center">
              <div className="text-sm font-bold">{formatNumber(data.indications.total)}</div>
              <div className="text-[10px] text-muted-foreground">Total</div>
            </div>
            <div className="p-2 rounded-lg bg-blue-50 text-center border border-blue-100">
              <div className="text-sm font-bold text-blue-700">{formatNumber(data.indications.direction)}</div>
              <div className="text-[10px] text-blue-600">Direction</div>
            </div>
            <div className="p-2 rounded-lg bg-cyan-50 text-center border border-cyan-100">
              <div className="text-sm font-bold text-cyan-700">{formatNumber(data.indications.move)}</div>
              <div className="text-[10px] text-cyan-600">Move</div>
            </div>
            <div className="p-2 rounded-lg bg-teal-50 text-center border border-teal-100">
              <div className="text-sm font-bold text-teal-700">{formatNumber(data.indications.active)}</div>
              <div className="text-[10px] text-teal-600">Active</div>
            </div>
            <div className="p-2 rounded-lg bg-green-50 text-center border border-green-100">
              <div className="text-sm font-bold text-green-700">{formatNumber(data.indications.optimal)}</div>
              <div className="text-[10px] text-green-600">Optimal</div>
            </div>
            <div className="p-2 rounded-lg bg-purple-50 text-center border border-purple-100">
              <div className="text-sm font-bold text-purple-700">{formatNumber(data.indications.common)}</div>
              <div className="text-[10px] text-purple-600">Common</div>
            </div>
            <div className="p-2 rounded-lg bg-orange-50 text-center border border-orange-100">
              <div className="text-sm font-bold text-orange-700">{formatNumber(data.indications.rsi)}</div>
              <div className="text-[10px] text-orange-600">RSI</div>
            </div>
            <div className="p-2 rounded-lg bg-amber-50 text-center border border-amber-100">
              <div className="text-sm font-bold text-amber-700">{formatNumber(data.indications.macd)}</div>
              <div className="text-[10px] text-amber-600">MACD</div>
            </div>
            <div className="p-2 rounded-lg bg-rose-50 text-center border border-rose-100">
              <div className="text-sm font-bold text-rose-700">{formatNumber(data.indications.bollinger)}</div>
              <div className="text-[10px] text-rose-600">Bollinger</div>
            </div>
            <div className="p-2 rounded-lg bg-emerald-50 text-center border border-emerald-100">
              <div className="text-sm font-bold text-emerald-700">{data.indications.evaluationRate.toFixed(1)}%</div>
              <div className="text-[10px] text-emerald-600">Eval Rate</div>
            </div>
          </div>
        </div>

        {/* Strategies */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Strategies</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Base Strategies */}
            <div className="p-3 rounded-lg bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground">Base Strategies</span>
                <Badge variant="secondary" className="text-[10px]">Base</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div>
                  <div className="text-lg font-bold">{formatNumber(data.strategies.baseCreated)}</div>
                  <div className="text-[10px] text-muted-foreground">Created</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-blue-600">{formatNumber(data.strategies.baseEvaluated)}</div>
                  <div className="text-[10px] text-muted-foreground">Evaluated</div>
                </div>
              </div>
            </div>

            {/* Main Strategies */}
            <div className="p-3 rounded-lg bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground">Main Strategies</span>
                <Badge className="bg-blue-500 text-[10px]">Main</Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-lg font-bold">{formatNumber(data.strategies.mainCreated)}</div>
                  <div className="text-[10px] text-muted-foreground">Created</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-blue-600">{formatNumber(data.strategies.mainEvaluated)}</div>
                  <div className="text-[10px] text-muted-foreground">Evaluated</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-emerald-600">{data.strategies.mainEvaluationRate.toFixed(0)}%</div>
                  <div className="text-[10px] text-muted-foreground">Rate</div>
                </div>
              </div>
              <Progress value={data.strategies.mainEvaluationRate} className="h-1 mt-2" />
            </div>

            {/* Real Strategies */}
            <div className="p-3 rounded-lg bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground">Real Strategies</span>
                <Badge className="bg-green-500 text-[10px]">Real</Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-lg font-bold">{formatNumber(data.strategies.realCreated)}</div>
                  <div className="text-[10px] text-muted-foreground">Created</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-green-600">{formatNumber(data.strategies.realEvaluated)}</div>
                  <div className="text-[10px] text-muted-foreground">Evaluated</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-emerald-600">{data.strategies.realEvaluationRate.toFixed(0)}%</div>
                  <div className="text-[10px] text-muted-foreground">Rate</div>
                </div>
              </div>
              <Progress value={data.strategies.realEvaluationRate} className="h-1 mt-2" />
            </div>
          </div>

          {/* Profit Factor */}
          <div className="mt-3 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-semibold text-emerald-700">Average Profit Factor</span>
              </div>
              <div className="text-xl font-bold text-emerald-700">{data.strategies.avgProfitFactor.toFixed(2)}</div>
            </div>
          </div>
        </div>

        {/* Live Positions */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Live Positions</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-muted/30 text-center">
              <div className="text-lg font-bold">{data.positions.pseudoActive}</div>
              <div className="text-[10px] text-muted-foreground">Pseudo Active</div>
            </div>
            <div className="p-3 rounded-lg bg-blue-50 text-center border border-blue-100">
              <div className="text-lg font-bold text-blue-700">{data.positions.realActive}</div>
              <div className="text-[10px] text-blue-600">Real Active</div>
            </div>
            <div className="p-3 rounded-lg bg-green-50 text-center border border-green-100">
              <div className="text-lg font-bold text-green-700">{data.positions.exchangeLive}</div>
              <div className="text-[10px] text-green-600">Exchange Live</div>
              <CircleDollarSign className="h-3 w-3 mx-auto mt-1 text-green-600" />
            </div>
            <div className="p-3 rounded-lg bg-muted/30 text-center">
              <div className="text-lg font-bold">{formatNumber(data.positions.totalCreated)}</div>
              <div className="text-[10px] text-muted-foreground">Total Created</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
