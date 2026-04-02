"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, Activity, Zap } from "lucide-react"

// STRATEGIES: Have base/main/real/live types
interface StrategyMetrics {
  type: "base" | "main" | "real" | "live"
  count: number
  winRate: number
  drawdown: number
  drawdownHours: number
  profitFactor250: number
  profitFactor50: number
}

// INDICATIONS: Have direction/move/active/optimal types (INDEPENDENT from strategies)
interface IndicationMetrics {
  type: "direction" | "move" | "active" | "optimal"
  totalCount: number
  avgSignalStrength: number
  lastTrigger: Date | null
  profitFactor: number
}

interface SymbolStats {
  symbol: string
  livePositions: number
  profitFactor250: number
  profitFactor50: number
}

interface PerformanceMetrics {
  last250Positions: {
    total: number
    winning: number
    losing: number
    winRate: number
    profitFactor: number
    totalProfit: number
  }
  last50Positions: {
    total: number
    winning: number
    losing: number
    winRate: number
    profitFactor: number
    totalProfit: number
  }
  last32Hours: {
    totalPositions: number
    totalProfit: number
    profitFactor: number
  }
}

interface StatisticsOverviewV2Props {
  connections?: Array<{ id: string; name: string }> | string
}

export function StatisticsOverviewV2({ connections }: StatisticsOverviewV2Props) {
  const [strategies, setStrategies] = useState<StrategyMetrics[]>([])
  const [indications, setIndications] = useState<IndicationMetrics[]>([])
  const [symbols, setSymbols] = useState<SymbolStats[]>([])
  const [performance, setPerformance] = useState<PerformanceMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null)
  const [fetchAttempts, setFetchAttempts] = useState(0)

  useEffect(() => {
    loadStatistics()
    const interval = setInterval(loadStatistics, 15000)
    return () => clearInterval(interval)
  }, [connections])

  const loadStatistics = async () => {
    try {
      setError(null)
      setLoading(true)

      console.log("[v0] [StatisticsOverviewV2] Fetching statistics...")

      // FETCH 1: Performance metrics (overall positions)
      try {
        const perfResponse = await fetch("/api/trading/stats")
        if (perfResponse.ok) {
          const perfData = await perfResponse.json()
          setPerformance({
            last250Positions: {
              total: perfData.last250?.total || 0,
              winning: perfData.last250?.wins || 0,
              losing: perfData.last250?.losses || 0,
              winRate: perfData.last250?.winRate || 0,
              profitFactor: perfData.last250?.profitFactor || 0,
              totalProfit: perfData.last250?.totalProfit || 0,
            },
            last50Positions: {
              total: perfData.last50?.total || 0,
              winning: perfData.last50?.wins || 0,
              losing: perfData.last50?.losses || 0,
              winRate: perfData.last50?.winRate || 0,
              profitFactor: perfData.last50?.profitFactor || 0,
              totalProfit: perfData.last50?.totalProfit || 0,
            },
            last32Hours: {
              totalPositions: perfData.last32h?.total || 0,
              totalProfit: perfData.last32h?.totalProfit || 0,
              profitFactor: perfData.last32h?.profitFactor || 0,
            },
          })
          console.log("[v0] [StatisticsOverviewV2] Performance data loaded:", perfData.last250?.total || 0, "positions")
        } else {
          console.warn("[v0] [StatisticsOverviewV2] Performance API failed:", perfResponse.status)
        }
      } catch (perfError) {
        console.error("[v0] [StatisticsOverviewV2] Failed to fetch performance:", perfError)
      }

      // FETCH 2: Strategies metrics (base/main/real/live types)
      try {
        const stratResponse = await fetch("/api/dashboard/strategies-evaluation")
        if (stratResponse.ok) {
          const stratData = await stratResponse.json()
          const strategiesData: StrategyMetrics[] = [
            { 
              type: "base", 
              count: stratData.strategies?.base?.count || 0, 
              winRate: stratData.strategies?.base?.winRate || 0,
              drawdown: stratData.strategies?.base?.drawdown || 0,
              drawdownHours: stratData.strategies?.base?.drawdownHours || 0,
              profitFactor250: stratData.strategies?.base?.profitFactor250 || 0,
              profitFactor50: stratData.strategies?.base?.profitFactor50 || 0,
            },
            { 
              type: "main", 
              count: stratData.strategies?.main?.count || 0,
              winRate: stratData.strategies?.main?.winRate || 0,
              drawdown: stratData.strategies?.main?.drawdown || 0,
              drawdownHours: stratData.strategies?.main?.drawdownHours || 0,
              profitFactor250: stratData.strategies?.main?.profitFactor250 || 0,
              profitFactor50: stratData.strategies?.main?.profitFactor50 || 0,
            },
            { 
              type: "real", 
              count: stratData.strategies?.real?.count || 0,
              winRate: stratData.strategies?.real?.winRate || 0,
              drawdown: stratData.strategies?.real?.drawdown || 0,
              drawdownHours: stratData.strategies?.real?.drawdownHours || 0,
              profitFactor250: stratData.strategies?.real?.profitFactor250 || 0,
              profitFactor50: stratData.strategies?.real?.profitFactor50 || 0,
            },
            { 
              type: "live", 
              count: stratData.strategies?.live?.count || 0,
              winRate: stratData.strategies?.live?.winRate || 0,
              drawdown: stratData.strategies?.live?.drawdown || 0,
              drawdownHours: stratData.strategies?.live?.drawdownHours || 0,
              profitFactor250: stratData.strategies?.live?.profitFactor250 || 0,
              profitFactor50: stratData.strategies?.live?.profitFactor50 || 0,
            },
          ]
          setStrategies(strategiesData)
          console.log("[v0] [StatisticsOverviewV2] Strategies data loaded:", strategiesData.reduce((sum, s) => sum + s.count, 0), "strategies")
        } else {
          console.warn("[v0] [StatisticsOverviewV2] Strategies API failed:", stratResponse.status)
        }
      } catch (stratError) {
        console.error("[v0] [StatisticsOverviewV2] Failed to fetch strategies:", stratError)
      }

      // FETCH 3: Indications metrics (direction/move/active/optimal types - INDEPENDENT)
      try {
        const indicResponse = await fetch("/api/dashboard/indications-stats")
        if (indicResponse.ok) {
          const indicData = await indicResponse.json()
          const indicationsData: IndicationMetrics[] = [
            {
              type: "direction",
              totalCount: indicData.indications?.direction?.count || 0,
              avgSignalStrength: indicData.indications?.direction?.avgSignalStrength || 0,
              lastTrigger: indicData.indications?.direction?.lastTrigger ? new Date(indicData.indications.direction.lastTrigger) : null,
              profitFactor: indicData.indications?.direction?.profitFactor || 0,
            },
            {
              type: "move",
              totalCount: indicData.indications?.move?.count || 0,
              avgSignalStrength: indicData.indications?.move?.avgSignalStrength || 0,
              lastTrigger: indicData.indications?.move?.lastTrigger ? new Date(indicData.indications.move.lastTrigger) : null,
              profitFactor: indicData.indications?.move?.profitFactor || 0,
            },
            {
              type: "active",
              totalCount: indicData.indications?.active?.count || 0,
              avgSignalStrength: indicData.indications?.active?.avgSignalStrength || 0,
              lastTrigger: indicData.indications?.active?.lastTrigger ? new Date(indicData.indications.active.lastTrigger) : null,
              profitFactor: indicData.indications?.active?.profitFactor || 0,
            },
            {
              type: "optimal",
              totalCount: indicData.indications?.optimal?.count || 0,
              avgSignalStrength: indicData.indications?.optimal?.avgSignalStrength || 0,
              lastTrigger: indicData.indications?.optimal?.lastTrigger ? new Date(indicData.indications.optimal.lastTrigger) : null,
              profitFactor: indicData.indications?.optimal?.profitFactor || 0,
            },
          ]
          setIndications(indicationsData)
          console.log("[v0] [StatisticsOverviewV2] Indications data loaded:", indicationsData.reduce((sum, i) => sum + i.totalCount, 0), "signals")
        } else {
          console.warn("[v0] [StatisticsOverviewV2] Indications API failed:", indicResponse.status)
        }
      } catch (indicError) {
        console.error("[v0] [StatisticsOverviewV2] Failed to fetch indications:", indicError)
      }

      // FETCH 4: Symbols stats
      try {
        const symbolResponse = await fetch("/api/exchange-positions/symbols-stats")
        if (symbolResponse.ok) {
          const symbolData = await symbolResponse.json()
          setSymbols((symbolData.symbols || []).slice(0, 22))
          console.log("[v0] [StatisticsOverviewV2] Symbols data loaded:", (symbolData.symbols || []).length, "symbols")
        } else {
          console.warn("[v0] [StatisticsOverviewV2] Symbols API failed:", symbolResponse.status)
        }
      } catch (symbolError) {
        console.error("[v0] [StatisticsOverviewV2] Failed to fetch symbols:", symbolError)
      }

      setLoading(false)
      setLastFetchTime(new Date())
      setFetchAttempts(0)
    } catch (err) {
      console.error("[v0] [StatisticsOverviewV2] Error loading data:", err)
      setError("Failed to load statistics")
      setLoading(false)
      setFetchAttempts(prev => prev + 1)
      
      // Provide sensible defaults on failure
      if (strategies.length === 0) {
        setStrategies([
          { type: "base", count: 0, winRate: 0, drawdown: 0, drawdownHours: 0, profitFactor250: 0, profitFactor50: 0 },
          { type: "main", count: 0, winRate: 0, drawdown: 0, drawdownHours: 0, profitFactor250: 0, profitFactor50: 0 },
          { type: "real", count: 0, winRate: 0, drawdown: 0, drawdownHours: 0, profitFactor250: 0, profitFactor50: 0 },
          { type: "live", count: 0, winRate: 0, drawdown: 0, drawdownHours: 0, profitFactor250: 0, profitFactor50: 0 },
        ])
      }
      if (indications.length === 0) {
        setIndications([
          { type: "direction", totalCount: 0, avgSignalStrength: 0, lastTrigger: null, profitFactor: 0 },
          { type: "move", totalCount: 0, avgSignalStrength: 0, lastTrigger: null, profitFactor: 0 },
          { type: "active", totalCount: 0, avgSignalStrength: 0, lastTrigger: null, profitFactor: 0 },
          { type: "optimal", totalCount: 0, avgSignalStrength: 0, lastTrigger: null, profitFactor: 0 },
        ])
      }
      if (!performance) {
        setPerformance({
          last250Positions: { total: 0, winning: 0, losing: 0, winRate: 0, profitFactor: 0, totalProfit: 0 },
          last50Positions: { total: 0, winning: 0, losing: 0, winRate: 0, profitFactor: 0, totalProfit: 0 },
          last32Hours: { totalPositions: 0, totalProfit: 0, profitFactor: 0 },
        })
      }
    }
  }

  if (loading) {
    return (
      <Card className="col-span-full bg-gradient-to-br from-card to-card/50 border-primary/20">
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">Loading statistics...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="col-span-full bg-gradient-to-br from-card to-card/50 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Trading Statistics Overview</CardTitle>
          <div className="flex items-center gap-2 text-xs">
            {lastFetchTime && (
              <span className="text-muted-foreground">
                Updated: {lastFetchTime.toLocaleTimeString()}
              </span>
            )}
            {error && (
              <Badge variant="destructive" className="text-xs">
                Error
              </Badge>
            )}
            {fetchAttempts > 0 && !error && (
              <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-600">
                Retrying...
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* PERFORMANCE METRICS - Overall trading performance */}
        {performance && (
          <div className="space-y-3 pb-4 border-b">
            <div className="text-sm font-semibold text-muted-foreground">Performance Metrics</div>
            <div className="grid grid-cols-3 gap-3">
              {/* Last 250 Positions */}
              <div className="rounded-lg border bg-card p-3 space-y-1">
                <div className="text-xs text-muted-foreground">Last 250 Positions</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">Win Rate</div>
                    <div className="font-semibold">{(performance.last250Positions.winRate * 100).toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Profit Factor</div>
                    <div className={`font-semibold ${performance.last250Positions.profitFactor >= 1.5 ? "text-green-600" : performance.last250Positions.profitFactor >= 1.0 ? "text-blue-600" : "text-red-600"}`}>
                      {performance.last250Positions.profitFactor.toFixed(2)}
                    </div>
                  </div>
                </div>
                <div className="text-xs pt-1 border-t">
                  <div className="text-muted-foreground">Total Profit</div>
                  <div className="font-semibold">${performance.last250Positions.totalProfit.toFixed(2)}</div>
                </div>
              </div>

              {/* Last 50 Positions */}
              <div className="rounded-lg border bg-card p-3 space-y-1">
                <div className="text-xs text-muted-foreground">Last 50 Positions</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">Win Rate</div>
                    <div className="font-semibold">{(performance.last50Positions.winRate * 100).toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Profit Factor</div>
                    <div className={`font-semibold ${performance.last50Positions.profitFactor >= 1.5 ? "text-green-600" : performance.last50Positions.profitFactor >= 1.0 ? "text-blue-600" : "text-red-600"}`}>
                      {performance.last50Positions.profitFactor.toFixed(2)}
                    </div>
                  </div>
                </div>
                <div className="text-xs pt-1 border-t">
                  <div className="text-muted-foreground">Total Profit</div>
                  <div className="font-semibold">${performance.last50Positions.totalProfit.toFixed(2)}</div>
                </div>
              </div>

              {/* Last 32 Hours */}
              <div className="rounded-lg border bg-card p-3 space-y-1">
                <div className="text-xs text-muted-foreground">Last 32 Hours</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-muted-foreground">Positions</div>
                    <div className="font-semibold">{performance.last32Hours.totalPositions}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Profit Factor</div>
                    <div className={`font-semibold ${performance.last32Hours.profitFactor >= 1.5 ? "text-green-600" : performance.last32Hours.profitFactor >= 1.0 ? "text-blue-600" : "text-red-600"}`}>
                      {performance.last32Hours.profitFactor.toFixed(2)}
                    </div>
                  </div>
                </div>
                <div className="text-xs pt-1 border-t">
                  <div className="text-muted-foreground">Total Profit</div>
                  <div className="font-semibold">${performance.last32Hours.totalProfit.toFixed(2)}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STRATEGIES - base/main/real/live types with smart line format */}
        <div className="space-y-3 pb-4 border-b">
          <div className="text-sm font-semibold text-muted-foreground">Strategy Types</div>
          <div className="space-y-2">
            {strategies.map((strategy) => (
              <div key={strategy.type} className="rounded-lg border bg-card p-3">
                <div className="flex items-center justify-between pb-2 border-b">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize text-xs font-semibold">
                      {strategy.type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{strategy.count} strat</span>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3 pt-2 text-xs">
                  <div className="flex flex-col">
                    <span className="text-muted-foreground text-xs">Win Rate</span>
                    <span className="font-semibold text-sm">{(strategy.winRate * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-muted-foreground text-xs">Drawdown</span>
                    <span className={`font-semibold text-sm ${strategy.drawdown > 20 ? "text-red-600" : strategy.drawdown > 10 ? "text-orange-600" : "text-green-600"}`}>
                      {strategy.drawdown.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-muted-foreground text-xs">Time (h)</span>
                    <span className="font-semibold text-sm">{strategy.drawdownHours.toFixed(1)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-muted-foreground text-xs">PF Avg</span>
                    <span className={`font-semibold text-sm ${((strategy.profitFactor250 + strategy.profitFactor50) / 2) >= 1.5 ? "text-green-600" : ((strategy.profitFactor250 + strategy.profitFactor50) / 2) >= 1.0 ? "text-blue-600" : "text-red-600"}`}>
                      {((strategy.profitFactor250 + strategy.profitFactor50) / 2).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-3 border-t mt-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">PF (250)</span>
                    <span className={`font-semibold ${strategy.profitFactor250 >= 1.5 ? "text-green-600" : strategy.profitFactor250 >= 1.0 ? "text-blue-600" : "text-red-600"}`}>
                      {strategy.profitFactor250.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">PF (50)</span>
                    <span className={`font-semibold ${strategy.profitFactor50 >= 1.5 ? "text-green-600" : strategy.profitFactor50 >= 1.0 ? "text-blue-600" : "text-red-600"}`}>
                      {strategy.profitFactor50.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* INDICATIONS - direction/move/active/optimal types (INDEPENDENT from strategies) */}
        <div className="space-y-3 pb-4 border-b">
          <div className="text-sm font-semibold text-muted-foreground">Indication Types</div>
          <div className="space-y-2">
            {indications.map((indication) => (
              <div key={indication.type} className="rounded-lg border bg-card p-3">
                <div className="flex items-center justify-between pb-2 border-b">
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="outline" 
                      className={`capitalize text-xs font-semibold ${
                        indication.type === "direction" ? "border-blue-500 text-blue-600" :
                        indication.type === "move" ? "border-green-500 text-green-600" :
                        indication.type === "active" ? "border-orange-500 text-orange-600" :
                        "border-purple-500 text-purple-600"
                      }`}
                    >
                      {indication.type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{indication.totalCount} signals</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {indication.lastTrigger ? indication.lastTrigger.toLocaleTimeString() : "Never"}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-2 text-xs">
                  <div className="flex flex-col">
                    <span className="text-muted-foreground text-xs">Signal Strength</span>
                    <span className={`font-semibold text-sm ${indication.avgSignalStrength >= 0.7 ? "text-green-600" : indication.avgSignalStrength >= 0.4 ? "text-yellow-600" : "text-red-600"}`}>
                      {indication.avgSignalStrength.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-muted-foreground text-xs">Profit Factor</span>
                    <span className={`font-semibold text-sm ${indication.profitFactor >= 1.5 ? "text-green-600" : indication.profitFactor >= 1.0 ? "text-blue-600" : "text-red-600"}`}>
                      {indication.profitFactor.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-muted-foreground text-xs">Total Count</span>
                    <span className="font-semibold text-sm">{indication.totalCount}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SYMBOLS - Live positions and metrics */}
        {symbols.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-muted-foreground">Symbols ({symbols.length})</div>
            <div className="grid gap-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {symbols.map((symbol) => (
                <div key={symbol.symbol} className="rounded-lg border bg-card p-2 text-center hover:bg-card/80 transition-colors">
                  <div className="font-semibold text-xs">{symbol.symbol}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {symbol.livePositions} live
                  </div>
                  <div className="text-xs mt-1">
                    <div className={symbol.profitFactor250 >= 1.5 ? "text-green-600" : symbol.profitFactor250 >= 1.0 ? "text-blue-600" : "text-red-600"}>
                      PF250: {symbol.profitFactor250.toFixed(1)}
                    </div>
                    <div className={symbol.profitFactor50 >= 1.5 ? "text-green-600" : symbol.profitFactor50 >= 1.0 ? "text-blue-600" : "text-red-600"}>
                      PF50: {symbol.profitFactor50.toFixed(1)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer note explaining the architecture */}
        <div className="pt-4 border-t">
          <div className="text-xs text-muted-foreground">
            <strong>Strategies</strong> (base, main, real, live) are complexity levels for trading strategies evaluated on pseudo positions.
            <br />
            <strong>Indications</strong> (direction, move, active, optimal) are independent signal types that drive strategy evaluation.
            <br />
            Direction (trend reversals) • Move (volatility) • Active (volume/activity) • Optimal (combined signals)
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
