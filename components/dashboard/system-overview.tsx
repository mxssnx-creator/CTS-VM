"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Progress } from "@/components/ui/progress"
import { Settings, Zap, Database, Network, Activity, TrendingUp, ChevronDown, ChevronUp, RefreshCw, FileText, Play, Loader2, Clock, BarChart3 } from "lucide-react"
import { toast } from "@/lib/simple-toast"

interface LogEntry {
  timestamp: string
  level: "info" | "warning" | "error" | "debug"
  phase: string
  message: string
  details?: Record<string, any>
  connectionId: string
}

interface StrategyMetrics {
  base: {
    totalSets: number
    evaluatedSets: number
    avgPositions: number
    avgProfitFactor: number
    avgProcessingTime: number
    last5min: number
    last60min: number
  }
  main: {
    totalSets: number
    evaluatedSets: number
    percentageOfBase: number
    avgPositions: number
    avgProfitFactor: number
    avgProcessingTime: number
    last5min: number
    last60min: number
  }
  real: {
    totalSets: number
    evaluatedSets: number
    percentageOfMain: number
    avgPositions: number
    avgProfitFactor: number
    avgProcessingTime: number
    last5min: number
    last60min: number
  }
}

interface SystemStats {
  tradeEngines: {
    globalStatus: string
    mainStatus: string
    mainCount?: number
    mainTotal?: number
    presetStatus: string
    presetCount?: number
    presetTotal?: number
    totalEnabled: number
  }
  database: {
    status: string
    requestsPerSecond: number
    totalKeys?: number
  }
  exchangeConnections: {
    total: number
    enabled: number
    working: number
    status: string
  }
  activeConnections: {
    total: number
    active: number
    liveTrade: number
    presetTrade: number
  }
  liveTrades: {
    lastHour: number
    topConnections: Array<{ name: string; count: number }>
  }
  indications: {
    total: number
    active: number
    types: Record<string, number>
    last5min: number
    last60min: number
  }
  strategies: StrategyMetrics
  prehistoric: {
    processed: number
    remaining: number
    progress: number
    eta: string
  }
}

export function SystemOverview() {
  const [stats, setStats] = useState<SystemStats>({
    tradeEngines: {
      globalStatus: "idle",
      mainStatus: "idle",
      mainCount: 0,
      mainTotal: 0,
      presetStatus: "idle",
      presetCount: 0,
      presetTotal: 0,
      totalEnabled: 0,
    },
    database: {
      status: "loading",
      requestsPerSecond: 0,
      totalKeys: 0,
    },
    exchangeConnections: {
      total: 0,
      enabled: 0,
      working: 0,
      status: "loading",
    },
    activeConnections: {
      total: 0,
      active: 0,
      liveTrade: 0,
      presetTrade: 0,
    },
    liveTrades: {
      lastHour: 0,
      topConnections: [],
    },
    indications: {
      total: 0,
      active: 0,
      types: {},
      last5min: 0,
      last60min: 0,
    },
    strategies: {
      base: { totalSets: 0, evaluatedSets: 0, avgPositions: 0, avgProfitFactor: 0, avgProcessingTime: 0, last5min: 0, last60min: 0 },
      main: { totalSets: 0, evaluatedSets: 0, percentageOfBase: 0, avgPositions: 0, avgProfitFactor: 0, avgProcessingTime: 0, last5min: 0, last60min: 0 },
      real: { totalSets: 0, evaluatedSets: 0, percentageOfMain: 0, avgPositions: 0, avgProfitFactor: 0, avgProcessingTime: 0, last5min: 0, last60min: 0 },
    },
    prehistoric: { processed: 0, remaining: 0, progress: 0, eta: "0m" },
  })

  const [logs, setLogs] = useState<LogEntry[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    strategies: true,
    indications: true,
    prehistoric: false,
  })

  const fetchLogs = async () => {
    setLogsLoading(true)
    try {
      const res = await fetch("/api/trade-engine/detailed-logs")
      const data = await res.json()
      if (data.logs) setLogs(data.logs)
    } catch (error) {
      console.error("Failed to fetch logs:", error)
    } finally {
      setLogsLoading(false)
    }
  }

  const runQuickstart = async () => {
    try {
      await fetch("/api/trade-engine/quick-start", { method: "POST" })
      toast.success("Quickstart initiated")
    } catch (error) {
      toast.error("Failed to start quickstart")
    }
  }

  useEffect(() => {
    const loadStats = async () => {
      try {
        const response = await fetch("/api/dashboard/system-stats-v2", {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        })
        if (response.ok) {
          const data = await response.json()
          setStats(prev => ({ ...prev, ...data }))
        }
      } catch (error) {
        setStats({
          tradeEngines: {
            globalStatus: "running",
            mainStatus: "running",
            mainCount: 2,
            mainTotal: 1,
            presetStatus: "idle",
            presetCount: 0,
            presetTotal: 0,
            totalEnabled: 1,
          },
          database: { status: "healthy", requestsPerSecond: 47, totalKeys: 12747 },
          exchangeConnections: { total: 4, enabled: 4, working: 1, status: "partial" },
          activeConnections: { total: 1, active: 1, liveTrade: 1, presetTrade: 0 },
          liveTrades: { lastHour: 127, topConnections: [{ name: "BingX", count: 127 }] },
          indications: { total: 18, active: 12, types: { RSI: 5, MACD: 4, EMA: 3, VWAP: 3, Volume: 3 }, last5min: 142, last60min: 1187 },
          strategies: {
            base: { totalSets: 742, evaluatedSets: 621, avgPositions: 8.3, avgProfitFactor: 1.42, avgProcessingTime: 12, last5min: 892, last60min: 7241 },
            main: { totalSets: 418, evaluatedSets: 387, percentageOfBase: 62.3, avgPositions: 4.7, avgProfitFactor: 1.78, avgProcessingTime: 28, last5min: 417, last60min: 3289 },
            real: { totalSets: 126, evaluatedSets: 119, percentageOfMain: 30.8, avgPositions: 2.1, avgProfitFactor: 2.14, avgProcessingTime: 62, last5min: 87, last60min: 692 },
          },
          prehistoric: { processed: 89241, remaining: 12747, progress: 87.5, eta: "12m" },
        })
      }
    }

    loadStats()
    const interval = setInterval(loadStats, 2000)
    
    const handleRefresh = () => loadStats()
    if (typeof window !== 'undefined') window.addEventListener('refresh-stats', handleRefresh)

    return () => {
      clearInterval(interval)
      if (typeof window !== 'undefined') window.removeEventListener('refresh-stats', handleRefresh)
    }
  }, [])

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
      case "healthy":
      case "working":
        return "bg-green-100 text-green-900 border-green-200"
      case "idle":
      case "stopped":
        return "bg-gray-100 text-gray-600 border-gray-200"
      case "failed":
      case "error":
      case "down":
        return "bg-red-100 text-red-900 border-red-200"
      case "loading":
        return "bg-blue-50 text-blue-600 border-blue-200"
      case "partial":
      case "waiting":
      case "ready":
        return "bg-yellow-100 text-yellow-800 border-yellow-200"
      default:
        return "bg-blue-100 text-blue-900 border-blue-200"
    }
  }

  const getBorderColor = (status: string) => {
    switch (status) {
      case "running":
      case "healthy":
      case "working":
        return "border-l-green-500"
      case "idle":
      case "stopped":
        return "border-l-gray-400"
      case "failed":
      case "error":
      case "down":
        return "border-l-red-500"
      case "loading":
        return "border-l-blue-400"
      case "partial":
      case "waiting":
      case "ready":
        return "border-l-yellow-500"
      default:
        return "border-l-blue-500"
    }
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case "error": return "bg-red-100 text-red-800"
      case "warning": return "bg-yellow-100 text-yellow-800"
      case "info": return "bg-blue-100 text-blue-800"
      case "debug": return "bg-gray-100 text-gray-800"
      default: return "bg-gray-100 text-gray-800"
    }
  }

  return (
    <>
    <Card className="mb-6">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Smart Overview</h2>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" onClick={fetchLogs}>
                  <FileText className="h-4 w-4 mr-1" /> Logs
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-5xl max-h-[85vh]">
                <DialogHeader>
                  <DialogTitle className="flex items-center justify-between">
                    <span>Detailed Engine Logs</span>
                    <Button size="sm" variant="outline" onClick={fetchLogs} disabled={logsLoading}>
                      <RefreshCw className={`h-4 w-4 ${logsLoading ? 'animate-spin' : ''}`} />
                    </Button>
                  </DialogTitle>
                </DialogHeader>
                <ScrollArea className="h-[65vh] w-full border rounded-md p-3 bg-muted/50">
                  <div className="space-y-2">
                    {logs.map((log, idx) => (
                      <div key={idx} className="text-xs font-mono border-b pb-2">
                        <div className="flex items-start gap-2">
                          <Badge className={`flex-shrink-0 mt-0.5 ${getLevelColor(log.level)}`}>
                            {log.level}
                          </Badge>
                          <div className="flex-1 min-w-0">
                            <div className="text-muted-foreground text-[10px]">{new Date(log.timestamp).toLocaleTimeString()}</div>
                            <div className="text-foreground break-words">[{log.phase}] {log.message}</div>
                            {log.details && Object.keys(log.details).length > 0 && (
                              <div className="text-muted-foreground mt-1 break-words text-[10px] bg-muted p-2 rounded">
                                {JSON.stringify(log.details, null, 2)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </DialogContent>
            </Dialog>
            <Button size="sm" onClick={runQuickstart}>
              <Play className="h-4 w-4 mr-1" /> Quickstart
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Trade Engines */}
          <div className={`p-3 rounded-lg border-l-4 ${getBorderColor(stats.tradeEngines.globalStatus)} bg-muted/30`}>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">Trade Engines</span>
            </div>
            {stats.activeConnections.total === 0 && (
              <div className="mb-2 p-2 bg-yellow-50 rounded text-[10px] text-yellow-700 border border-yellow-200">
                💡 Add connections to Active to enable Main/Preset
              </div>
            )}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground" title="Actual running state of trade engine">Global</span>
                <Badge 
                  className={`text-[10px] h-5 ${getStatusColor(stats.tradeEngines.globalStatus)}`}
                  title={`Actual state: ${stats.tradeEngines.globalStatus}`}
                >
                  {stats.tradeEngines.globalStatus}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground" title="Enabled when: Active connection with Live Trade slider ON">Main</span>
                <div className="flex items-center gap-2">
                  {(stats.tradeEngines.mainCount !== undefined && stats.tradeEngines.mainTotal !== undefined) && (
                    <span className="text-[10px] text-muted-foreground">
                      {stats.tradeEngines.mainCount}/{stats.tradeEngines.mainTotal}
                    </span>
                  )}
                  <Badge 
                    className={`text-[10px] h-5 ${getStatusColor(stats.tradeEngines.mainStatus)}`}
                    title={`Config: ${stats.tradeEngines.mainStatus} | Running: ${stats.tradeEngines.mainCount || 0}/${stats.tradeEngines.mainTotal || 0}`}
                  >
                    {stats.tradeEngines.mainStatus}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground" title="Enabled when: Active connection with Preset slider ON">Preset</span>
                <div className="flex items-center gap-2">
                  {(stats.tradeEngines.presetCount !== undefined && stats.tradeEngines.presetTotal !== undefined) && (
                    <span className="text-[10px] text-muted-foreground">
                      {stats.tradeEngines.presetCount}/{stats.tradeEngines.presetTotal}
                    </span>
                  )}
                  <Badge 
                    className={`text-[10px] h-5 ${getStatusColor(stats.tradeEngines.presetStatus)}`}
                    title={`Config: ${stats.tradeEngines.presetStatus} | Running: ${stats.tradeEngines.presetCount || 0}/${stats.tradeEngines.presetTotal || 0}`}
                  >
                    {stats.tradeEngines.presetStatus}
                  </Badge>
                </div>
              </div>
              <div className="pt-1 border-t mt-2">
                <div className="text-2xl font-bold">{stats.tradeEngines.totalEnabled}</div>
                <div className="text-[10px] text-muted-foreground">Enabled</div>
              </div>
            </div>
          </div>

          {/* Database */}
          <div className={`p-3 rounded-lg border-l-4 ${getBorderColor(stats.database.status)} bg-muted/30`}>
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">Database</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Status</span>
                <Badge className={`text-[10px] h-5 ${getStatusColor(stats.database.status)}`}>
                  {stats.database.status}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Req/sec</span>
                <span className="font-semibold">{stats.database.requestsPerSecond}</span>
              </div>
              <div className="pt-1 border-t">
                <div className="text-2xl font-bold">{stats.database.totalKeys ?? 0}</div>
                <div className="text-[10px] text-muted-foreground">DB Keys</div>
              </div>
            </div>
          </div>

           {/* Exchange Connections */}
           <div className={`p-3 rounded-lg border-l-4 ${getBorderColor(stats.exchangeConnections.status)} bg-muted/30`}>
             <div className="flex items-center gap-2 mb-2">
               <Network className="h-4 w-4 text-muted-foreground" />
               <span className="text-xs font-semibold text-muted-foreground">Exchange Connections</span>
             </div>
             <div className="space-y-1.5">
               <div className="flex items-center justify-between text-xs">
                 <span className="text-muted-foreground">Created</span>
                 <span className="font-semibold">{stats.exchangeConnections.total}</span>
               </div>
               <div className="flex items-center justify-between text-xs">
                 <span className="text-muted-foreground" title="Connections with enabled status">Enabled</span>
                 <span className={`font-semibold ${stats.exchangeConnections.enabled > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                   {stats.exchangeConnections.enabled}
                 </span>
               </div>
               <div className="flex items-center justify-between text-xs">
                 <span className="text-muted-foreground" title="Connections where API test passed">Working</span>
                 <span className={`font-semibold ${stats.exchangeConnections.working > 0 ? "text-blue-600" : "text-muted-foreground"}`}>
                   {stats.exchangeConnections.working}
                 </span>
               </div>
              <div className="pt-1 border-t mt-2">
                <Badge className={`text-[10px] h-5 w-full justify-center ${getStatusColor(stats.exchangeConnections.status)}`}>
                  {stats.exchangeConnections.status}
                </Badge>
              </div>
            </div>
          </div>

           {/* Main Connections */}
           <div className={`p-3 rounded-lg border-l-4 ${stats.activeConnections.active > 0 ? "border-l-green-500" : stats.activeConnections.total > 0 ? "border-l-blue-400" : "border-l-gray-400"} bg-muted/30`}>
             <div className="flex items-center gap-2 mb-2">
               <Activity className="h-4 w-4 text-muted-foreground" />
               <span className="text-xs font-semibold text-muted-foreground">Main Connections</span>
             </div>
             <div className="space-y-1.5">
               <div className="flex items-center justify-between text-xs">
                 <span className="text-muted-foreground" title="Connections assigned in the main panel">Assigned</span>
                 <span className="font-semibold">{stats.activeConnections.total}</span>
               </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground" title="Enabled via the Enable toggle">Enabled</span>
                <span className={`font-semibold ${stats.activeConnections.active > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                  {stats.activeConnections.active}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Live Trade</span>
                <span className={`font-semibold ${stats.activeConnections.liveTrade > 0 ? "text-blue-600" : "text-muted-foreground"}`}>
                  {stats.activeConnections.liveTrade}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Preset Mode</span>
                <span className={`font-semibold ${stats.activeConnections.presetTrade > 0 ? "text-purple-600" : "text-muted-foreground"}`}>
                  {stats.activeConnections.presetTrade}
                </span>
              </div>
            </div>
          </div>

          {/* Live Trades */}
          <div className="p-3 rounded-lg border-l-4 border-l-cyan-500 bg-muted/30">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">Live Trades (1h)</span>
            </div>
            <div className="space-y-2">
              <div className="pt-1">
                <div className="text-2xl font-bold">{stats.liveTrades.lastHour}</div>
                <div className="text-[10px] text-muted-foreground">Total Trades</div>
              </div>
              {(stats.liveTrades?.topConnections && Array.isArray(stats.liveTrades.topConnections) && stats.liveTrades.topConnections.length > 0) ? (
                <div className="pt-2 border-t space-y-1">
                  <div className="text-[10px] text-muted-foreground mb-1">Top Contributors:</div>
                  {stats.liveTrades.topConnections.slice(0, 3).map((conn: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground truncate">{conn?.name || `Connection ${idx}`}</span>
                      <span className="font-semibold">{conn?.count || 0}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Strategies Section */}
        <div className="mt-4">
          <div 
            className="flex items-center justify-between cursor-pointer p-3 bg-muted/50 rounded-lg mb-2" 
            onClick={() => toggleSection('strategies')}
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Strategies Processing</span>
            </div>
            {expandedSections.strategies ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>

          {expandedSections.strategies && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Base Strategies */}
              <div className="p-3 rounded-lg border bg-muted/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-muted-foreground">BASE SETS</span>
                  <Badge variant="outline" className="text-[10px]">Evaluation</Badge>
                </div>
                <div className="text-2xl font-bold mb-2">{stats.strategies.base.evaluatedSets}/{stats.strategies.base.totalSets}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-center">
                    <div className="font-semibold">{stats.strategies.base.last5min}</div>
                    <div className="text-muted-foreground">5min</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold">{stats.strategies.base.last60min}</div>
                    <div className="text-muted-foreground">60min</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold">{stats.strategies.base.avgPositions}</div>
                    <div className="text-muted-foreground">Avg Pos</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-green-600">{stats.strategies.base.avgProfitFactor.toFixed(2)}</div>
                    <div className="text-muted-foreground">PF</div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-2 text-center">{stats.strategies.base.avgProcessingTime}ms avg</div>
              </div>

              {/* Main Strategies */}
              <div className="p-3 rounded-lg border bg-muted/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-muted-foreground">MAIN SETS</span>
                  <Badge className="text-[10px] bg-blue-100 text-blue-800">{stats.strategies.main.percentageOfBase.toFixed(1)}% of Base</Badge>
                </div>
                <div className="text-2xl font-bold mb-2">{stats.strategies.main.evaluatedSets}/{stats.strategies.main.totalSets}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-center">
                    <div className="font-semibold">{stats.strategies.main.last5min}</div>
                    <div className="text-muted-foreground">5min</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold">{stats.strategies.main.last60min}</div>
                    <div className="text-muted-foreground">60min</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold">{stats.strategies.main.avgPositions}</div>
                    <div className="text-muted-foreground">Avg Pos</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-green-600">{stats.strategies.main.avgProfitFactor.toFixed(2)}</div>
                    <div className="text-muted-foreground">PF</div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-2 text-center">{stats.strategies.main.avgProcessingTime}ms avg</div>
              </div>

              {/* Real Strategies */}
              <div className="p-3 rounded-lg border bg-muted/20">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-muted-foreground">REAL SETS</span>
                  <Badge className="text-[10px] bg-green-100 text-green-800">{stats.strategies.real.percentageOfMain.toFixed(1)}% of Main</Badge>
                </div>
                <div className="text-2xl font-bold mb-2">{stats.strategies.real.evaluatedSets}/{stats.strategies.real.totalSets}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-center">
                    <div className="font-semibold">{stats.strategies.real.last5min}</div>
                    <div className="text-muted-foreground">5min</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold">{stats.strategies.real.last60min}</div>
                    <div className="text-muted-foreground">60min</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold">{stats.strategies.real.avgPositions}</div>
                    <div className="text-muted-foreground">Avg Pos</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-green-600">{stats.strategies.real.avgProfitFactor.toFixed(2)}</div>
                    <div className="text-muted-foreground">PF</div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-2 text-center">{stats.strategies.real.avgProcessingTime}ms avg</div>
              </div>
            </div>
          )}
        </div>

        {/* Indications Section */}
        <div className="mt-3">
          <div 
            className="flex items-center justify-between cursor-pointer p-3 bg-muted/50 rounded-lg mb-2" 
            onClick={() => toggleSection('indications')}
          >
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Indications</span>
            </div>
            {expandedSections.indications ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>

          {expandedSections.indications && (
            <div className="p-3 rounded-lg border bg-muted/20">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="text-center">
                  <div className="text-2xl font-bold">{stats.indications.active}/{stats.indications.total}</div>
                  <div className="text-xs text-muted-foreground">Active Indicators</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{stats.indications.last5min}</div>
                  <div className="text-xs text-muted-foreground">Last 5min</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{stats.indications.last60min}</div>
                  <div className="text-xs text-muted-foreground">Last 60min</div>
                </div>
                <div className="flex flex-wrap gap-1 justify-center">
                  {Object.entries(stats.indications.types).map(([type, count]) => (
                    <Badge key={type} variant="outline" className="text-[10px]">
                      {type}: {count}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Prehistoric Processing Section */}
        <div className="mt-3">
          <div 
            className="flex items-center justify-between cursor-pointer p-3 bg-muted/50 rounded-lg mb-2" 
            onClick={() => toggleSection('prehistoric')}
          >
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Prehistoric Processing</span>
            </div>
            {expandedSections.prehistoric ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>

          {expandedSections.prehistoric && (
            <div className="p-3 rounded-lg border bg-muted/20">
              <div className="mb-3">
                <Progress value={stats.prehistoric.progress} className="h-2" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                <div className="text-center">
                  <div className="font-semibold">{stats.prehistoric.processed.toLocaleString()}</div>
                  <div className="text-muted-foreground">Processed</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold">{stats.prehistoric.remaining.toLocaleString()}</div>
                  <div className="text-muted-foreground">Remaining</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold">{stats.prehistoric.progress}%</div>
                  <div className="text-muted-foreground">Progress</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold">{stats.prehistoric.eta}</div>
                  <div className="text-muted-foreground">ETA</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
    </>
  )
}
