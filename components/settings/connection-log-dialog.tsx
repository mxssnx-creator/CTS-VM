"use client"

import { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Loader2,
  RefreshCw,
  Activity,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Info,
  Clock,
  TrendingUp,
  Database,
  Zap,
  Layers,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Filter,
  X,
  FileText,
  Shield,
  Cpu,
  Timer,
  Target,
  GitBranch,
  Scale,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Search,
  Trash2,
  Download,
} from "lucide-react"
import { toast } from "@/lib/simple-toast"

interface ConnectionLogDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connectionId: string
  connectionName: string
}

interface LogEntry {
  id: string
  timestamp: string
  level: "info" | "warn" | "error" | "debug"
  category: string
  message: string
  metadata?: any
  connection_id?: string
}

interface EngineProgression {
  phase: string
  progress: number
  message: string
  subPhase: string | null
  startedAt: string | null
  updatedAt: string | null
  details: {
    historicalDataLoaded: boolean
    indicationsCalculated: boolean
    strategiesProcessed: boolean
    liveProcessingActive: boolean
    liveTradingActive: boolean
  }
  error: string | null
}

interface ActivitySummary {
  totalLogs: number
  totalErrors: number
  totalWarnings: number
  totalInfo: number
  totalDebug: number
  cyclesCompleted: number
  successfulCycles: number
  failedCycles: number
  successRate: number
  avgCycleDuration: number
  lastCycleDuration: number
  indicationsCalculated: number
  strategiesEvaluated: number
  positionsGenerated: number
  configsProcessed: number
  symbolsActive: number
  dataPointsProcessed: number
  lastActivity: string | null
  uptime: string | null
  engineStarts: number
  engineStops: number
  connectionTests: number
  connectionTestSuccess: number
  connectionTestFail: number
}

interface CategorizedError {
  id: string
  timestamp: string
  category: string
  severity: "critical" | "high" | "medium" | "low"
  message: string
  details: string
  phase: string
  resolved: boolean
  count: number
  lastOccurrence: string
  firstOccurrence: string
}

interface DataMetrics {
  historicalDataPoints: number
  historicalTimeRange: string
  indicationsByType: Record<string, number>
  strategiesByType: Record<string, number>
  positionTypes: {
    base: number
    main: number
    real: number
    total: number
  }
  loadMetrics: {
    avgLoadTime: number
    maxLoadTime: number
    minLoadTime: number
    totalLoads: number
  }
  timeMetrics: {
    avgProcessingTime: number
    maxProcessingTime: number
    minProcessingTime: number
    totalTimeSpent: number
  }
  sizeMetrics: {
    avgResponseSize: number
    maxResponseSize: number
    totalDataSize: number
  }
  countMetrics: {
    totalRequests: number
    successfulRequests: number
    failedRequests: number
    rateLimitedRequests: number
  }
}

const PHASE_LABELS: Record<string, string> = {
  disabled: "Disabled",
  idle: "Idle",
  initializing: "Initializing",
  prehistoric_data: "Loading Historical Data",
  indications: "Processing Indications",
  strategies: "Calculating Strategies",
  realtime: "Starting Real-time Processor",
  live_trading: "Live Trading Active",
  stopped: "Stopped",
  error: "Error",
}

const PHASE_ICONS: Record<string, React.ReactNode> = {
  disabled: <Shield className="h-3 w-3" />,
  idle: <Clock className="h-3 w-3" />,
  initializing: <Zap className="h-3 w-3" />,
  prehistoric_data: <Database className="h-3 w-3" />,
  indications: <Activity className="h-3 w-3" />,
  strategies: <TrendingUp className="h-3 w-3" />,
  realtime: <Cpu className="h-3 w-3" />,
  live_trading: <Target className="h-3 w-3" />,
  stopped: <X className="h-3 w-3" />,
  error: <AlertCircle className="h-3 w-3" />,
}

const CATEGORY_COLORS: Record<string, string> = {
  connection: "bg-blue-100 text-blue-800 border-blue-200",
  engine: "bg-purple-100 text-purple-800 border-purple-200",
  indication: "bg-cyan-100 text-cyan-800 border-cyan-200",
  strategy: "bg-green-100 text-green-800 border-green-200",
  position: "bg-orange-100 text-orange-800 border-orange-200",
  error: "bg-red-100 text-red-800 border-red-200",
  warning: "bg-yellow-100 text-yellow-800 border-yellow-200",
  data: "bg-indigo-100 text-indigo-800 border-indigo-200",
  realtime: "bg-pink-100 text-pink-800 border-pink-200",
  system: "bg-gray-100 text-gray-800 border-gray-200",
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-red-500 text-white",
  medium: "bg-orange-500 text-white",
  low: "bg-yellow-500 text-yellow-900",
}

const LEVEL_CONFIG = {
  error: { color: "bg-red-100 text-red-800 border-red-200", icon: <AlertCircle className="h-3 w-3" /> },
  warn: { color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: <AlertTriangle className="h-3 w-3" /> },
  info: { color: "bg-blue-100 text-blue-800 border-blue-200", icon: <Info className="h-3 w-3" /> },
  debug: { color: "bg-gray-100 text-gray-800 border-gray-200", icon: <FileText className="h-3 w-3" /> },
}

export function ConnectionLogDialog({ open, onOpenChange, connectionId, connectionName }: ConnectionLogDialogProps) {
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("main")
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [activitySummary, setActivitySummary] = useState<ActivitySummary | null>(null)
  const [engineProgression, setEngineProgression] = useState<EngineProgression | null>(null)
  const [categorizedErrors, setCategorizedErrors] = useState<CategorizedError[]>([])
  const [dataMetrics, setDataMetrics] = useState<DataMetrics | null>(null)
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set())
  const [filterLevel, setFilterLevel] = useState<string>("all")
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [refreshing, setRefreshing] = useState(false)

  const loadData = useCallback(async () => {
    try {
      setRefreshing(true)
      const [logsRes, progressionRes, errorsRes] = await Promise.all([
        fetch(`/api/settings/connections/${connectionId}/log`),
        fetch(`/api/connections/progression/${connectionId}`),
        fetch(`/api/monitoring/errors?limit=100`),
      ])

      if (logsRes.ok) {
        const logsData = await logsRes.json()
        setLogs(logsData.logs || [])
        setActivitySummary({
          totalLogs: logsData.summary?.total || 0,
          totalErrors: logsData.summary?.errors || 0,
          totalWarnings: logsData.summary?.warnings || 0,
          totalInfo: logsData.summary?.info || 0,
          totalDebug: 0,
          cyclesCompleted: 0,
          successfulCycles: 0,
          failedCycles: 0,
          successRate: 0,
          avgCycleDuration: 0,
          lastCycleDuration: 0,
          indicationsCalculated: 0,
          strategiesEvaluated: 0,
          positionsGenerated: 0,
          configsProcessed: 0,
          symbolsActive: 0,
          dataPointsProcessed: 0,
          lastActivity: null,
          uptime: null,
          engineStarts: 0,
          engineStops: 0,
          connectionTests: 0,
          connectionTestSuccess: 0,
          connectionTestFail: 0,
        })
      }

      if (progressionRes.ok) {
        const progData = await progressionRes.json()
        if (progData.success && progData.progression) {
          setEngineProgression(progData.progression)
        }
        if (progData.summary) {
          const s = progData.summary
          setActivitySummary({
            totalLogs: activitySummary?.totalLogs || 0,
            totalErrors: activitySummary?.totalErrors || 0,
            totalWarnings: activitySummary?.totalWarnings || 0,
            totalInfo: activitySummary?.totalInfo || 0,
            totalDebug: activitySummary?.totalDebug || 0,
            cyclesCompleted: s.cyclesCompleted || 0,
            successfulCycles: s.successfulCycles || 0,
            failedCycles: s.failedCycles || 0,
            successRate: s.cycleSuccessRate || 0,
            avgCycleDuration: s.avgCycleDuration || 0,
            lastCycleDuration: s.lastCycleDuration || 0,
            indicationsCalculated: s.totalIndicationsCalculated || 0,
            strategiesEvaluated: s.totalStrategiesEvaluated || 0,
            positionsGenerated: s.positionsGenerated || 0,
            configsProcessed: s.configsProcessed || 0,
            symbolsActive: s.symbolsActive || 0,
            dataPointsProcessed: s.dataPointsProcessed || 0,
            lastActivity: s.lastActivity || null,
            uptime: s.uptime || null,
            engineStarts: s.engineStarts || 0,
            engineStops: s.engineStops || 0,
            connectionTests: s.connectionTests || 0,
            connectionTestSuccess: s.connectionTestSuccess || 0,
            connectionTestFail: s.connectionTestFail || 0,
          })
        }
      }

      if (errorsRes.ok) {
        const errorsData = await errorsRes.json()
        const connErrors = (errorsData.errors || []).filter(
          (e: any) => e.connection_id === connectionId || !e.connection_id
        )
        setCategorizedErrors(connErrors)
      }

      setDataMetrics({
        historicalDataPoints: 0,
        historicalTimeRange: "N/A",
        indicationsByType: {},
        strategiesByType: {},
        positionTypes: { base: 0, main: 0, real: 0, total: 0 },
        loadMetrics: { avgLoadTime: 0, maxLoadTime: 0, minLoadTime: 0, totalLoads: 0 },
        timeMetrics: { avgProcessingTime: 0, maxProcessingTime: 0, minProcessingTime: 0, totalTimeSpent: 0 },
        sizeMetrics: { avgResponseSize: 0, maxResponseSize: 0, totalDataSize: 0 },
        countMetrics: { totalRequests: 0, successfulRequests: 0, failedRequests: 0, rateLimitedRequests: 0 },
      })
    } catch (error) {
      console.error("[v0] Failed to load log data:", error)
      toast.error("Error loading logs", {
        description: error instanceof Error ? error.message : "Failed to load logs",
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [connectionId])

  useEffect(() => {
    if (open) {
      loadData()
      const interval = setInterval(loadData, 5000)
      return () => clearInterval(interval)
    }
  }, [open, loadData])

  const toggleLogExpand = (id: string) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleCategoryExpand = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  const toggleErrorExpand = (id: string) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filteredLogs = logs.filter((log) => {
    if (filterLevel !== "all" && log.level !== filterLevel) return false
    if (filterCategory !== "all" && log.category !== filterCategory) return false
    if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const logsByCategory = logs.reduce((acc: Record<string, LogEntry[]>, log) => {
    const cat = log.category || "uncategorized"
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(log)
    return acc
  }, {})

  const errorsByCategory = categorizedErrors.reduce((acc: Record<string, CategorizedError[]>, err) => {
    const cat = err.category || "uncategorized"
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(err)
    return acc
  }, {})

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return n.toString()
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[85vh]">
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-500" />
                Connection Logs - {connectionName}
              </DialogTitle>
              <DialogDescription>
                Comprehensive activity, progression, and error logging
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadData} disabled={refreshing}>
                <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-4 bg-muted/50 p-1">
            <TabsTrigger value="main" className="flex items-center gap-1.5 text-xs">
              <Activity className="h-3.5 w-3.5" />
              Main
            </TabsTrigger>
            <TabsTrigger value="data" className="flex items-center gap-1.5 text-xs">
              <Database className="h-3.5 w-3.5" />
              Data
            </TabsTrigger>
            <TabsTrigger value="error" className="flex items-center gap-1.5 text-xs">
              <AlertCircle className="h-3.5 w-3.5" />
              Error
            </TabsTrigger>
            <TabsTrigger value="topmenu" className="flex items-center gap-1.5 text-xs">
              <Layers className="h-3.5 w-3.5" />
              Top Menu
            </TabsTrigger>
          </TabsList>

          <TabsContent value="main" className="flex-1 min-h-0 mt-3 overflow-hidden">
            <div className="space-y-3 h-full flex flex-col">
              {/* Activity Summary Cards */}
              {activitySummary && (
                <div className="grid grid-cols-6 gap-2 shrink-0">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-lg p-2.5 border border-blue-200/50 text-center">
                    <div className="text-xl font-bold text-blue-700">{formatNumber(activitySummary.totalLogs)}</div>
                    <div className="text-[10px] text-blue-600/80 font-medium uppercase tracking-wide">Total Logs</div>
                  </div>
                  <div className="bg-gradient-to-br from-green-50 to-green-100/50 rounded-lg p-2.5 border border-green-200/50 text-center">
                    <div className="text-xl font-bold text-green-700">{activitySummary.successfulCycles}</div>
                    <div className="text-[10px] text-green-600/80 font-medium uppercase tracking-wide">Success</div>
                  </div>
                  <div className="bg-gradient-to-br from-red-50 to-red-100/50 rounded-lg p-2.5 border border-red-200/50 text-center">
                    <div className="text-xl font-bold text-red-700">{activitySummary.failedCycles}</div>
                    <div className="text-[10px] text-red-600/80 font-medium uppercase tracking-wide">Failed</div>
                  </div>
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-lg p-2.5 border border-purple-200/50 text-center">
                    <div className="text-xl font-bold text-purple-700">{activitySummary.successRate.toFixed(1)}%</div>
                    <div className="text-[10px] text-purple-600/80 font-medium uppercase tracking-wide">Success Rate</div>
                  </div>
                  <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 rounded-lg p-2.5 border border-orange-200/50 text-center">
                    <div className="text-xl font-bold text-orange-700">{formatDuration(activitySummary.avgCycleDuration)}</div>
                    <div className="text-[10px] text-orange-600/80 font-medium uppercase tracking-wide">Avg Cycle</div>
                  </div>
                  <div className="bg-gradient-to-br from-cyan-50 to-cyan-100/50 rounded-lg p-2.5 border border-cyan-200/50 text-center">
                    <div className="text-xl font-bold text-cyan-700">{activitySummary.symbolsActive}</div>
                    <div className="text-[10px] text-cyan-600/80 font-medium uppercase tracking-wide">Symbols</div>
                  </div>
                </div>
              )}

              {/* Engine Progression */}
              {engineProgression && engineProgression.phase !== "idle" && engineProgression.phase !== "stopped" && (
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-3 border border-indigo-200/50 shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {PHASE_ICONS[engineProgression.phase] || <Activity className="h-4 w-4" />}
                      <span className="text-sm font-semibold text-indigo-900">
                        {PHASE_LABELS[engineProgression.phase] || engineProgression.phase}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-xs bg-white">
                      {engineProgression.progress}%
                    </Badge>
                  </div>
                  <div className="w-full bg-white/60 rounded-full h-1.5 mb-2">
                    <div
                      className="bg-gradient-to-r from-indigo-500 to-purple-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${engineProgression.progress}%` }}
                    />
                  </div>
                  {engineProgression.message && (
                    <p className="text-xs text-indigo-700">{engineProgression.message}</p>
                  )}
                  <div className="grid grid-cols-5 gap-2 mt-2">
                    {Object.entries(engineProgression.details).map(([key, value]) => (
                      <div key={key} className="text-center">
                        <Badge
                          variant="outline"
                          className={`text-[9px] px-1.5 py-0 ${
                            value
                              ? "bg-green-100 text-green-700 border-green-200"
                              : "bg-gray-100 text-gray-500 border-gray-200"
                          }`}
                        >
                          {value ? "✓" : "○"} {key.replace(/([A-Z])/g, " $1").trim()}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Filters */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search logs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-7 pr-3 py-1.5 text-xs border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  {["all", "info", "warn", "error", "debug"].map((level) => (
                    <Button
                      key={level}
                      variant={filterLevel === level ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilterLevel(level)}
                      className="text-[10px] h-6 px-2"
                    >
                      {level === "all" ? "All" : level.toUpperCase()}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Logs List */}
              <ScrollArea className="flex-1 min-h-0 border rounded-lg bg-muted/20">
                <div className="p-2">
                  {filteredLogs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No logs match the current filters</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {filteredLogs.map((log) => (
                        <Collapsible
                          key={log.id}
                          open={expandedLogs.has(log.id)}
                          onOpenChange={() => toggleLogExpand(log.id)}
                        >
                          <CollapsibleTrigger asChild>
                            <div className="flex items-center gap-2 p-2 hover:bg-muted/60 rounded cursor-pointer group">
                              {expandedLogs.has(log.id) ? (
                                <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                              )}
                              <Badge className={`${LEVEL_CONFIG[log.level]?.color} text-[9px] px-1.5 py-0`}>
                                {LEVEL_CONFIG[log.level]?.icon}
                                <span className="ml-0.5">{log.level}</span>
                              </Badge>
                              {log.category && (
                                <Badge
                                  variant="outline"
                                  className={`text-[9px] px-1.5 py-0 ${CATEGORY_COLORS[log.category] || "bg-gray-100 text-gray-800"}`}
                                >
                                  {log.category}
                                </Badge>
                              )}
                              <span className="text-xs flex-1 truncate text-foreground/80">{log.message}</span>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {new Date(log.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="ml-6 p-2.5 bg-muted/40 rounded text-xs space-y-1.5 border border-border/50">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">ID:</span>
                                <span className="font-mono text-[10px]">{log.id}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Timestamp:</span>
                                <span className="font-mono">{new Date(log.timestamp).toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Category:</span>
                                <span className="font-medium capitalize">{log.category || "N/A"}</span>
                              </div>
                              {log.metadata && (
                                <div className="mt-1.5">
                                  <span className="text-muted-foreground block mb-1">Metadata:</span>
                                  <pre className="bg-background/50 p-2 rounded text-[10px] overflow-x-auto border">
                                    {JSON.stringify(log.metadata, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Category Breakdown */}
              {Object.keys(logsByCategory).length > 0 && (
                <div className="shrink-0 border-t pt-2">
                  <h4 className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">Categories</h4>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(logsByCategory).map(([category, entries]) => (
                      <Collapsible
                        key={category}
                        open={expandedCategories.has(category)}
                        onOpenChange={() => toggleCategoryExpand(category)}
                      >
                        <CollapsibleTrigger asChild>
                          <div className="inline-flex items-center gap-1">
                            {expandedCategories.has(category) ? (
                              <ChevronDown className="h-3 w-3 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3 w-3 text-muted-foreground" />
                            )}
                            <Badge
                              variant="outline"
                              className={`text-[10px] cursor-pointer ${CATEGORY_COLORS[category] || "bg-gray-100 text-gray-800"}`}
                            >
                              {category} ({entries.length})
                            </Badge>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="ml-4 mt-1 space-y-0.5 max-h-24 overflow-y-auto">
                            {entries.slice(0, 5).map((entry, idx) => (
                              <div key={idx} className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <span className="text-muted-foreground/50">•</span>
                                {entry.message.slice(0, 80)}{entry.message.length > 80 ? "..." : ""}
                              </div>
                            ))}
                            {entries.length > 5 && (
                              <div className="text-[10px] text-muted-foreground italic">
                                +{entries.length - 5} more entries
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="data" className="flex-1 min-h-0 mt-3 overflow-hidden">
            <ScrollArea className="h-[60vh]">
              <div className="space-y-4 p-1">
                {/* Overall Information */}
                <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-lg p-4 border border-slate-200/50">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-slate-600" />
                    Overall Information
                  </h3>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-white rounded-lg p-2.5 border text-center">
                      <div className="text-lg font-bold text-blue-600">{formatNumber(activitySummary?.totalLogs || 0)}</div>
                      <div className="text-[10px] text-muted-foreground font-medium">Total Entries</div>
                    </div>
                    <div className="bg-white rounded-lg p-2.5 border text-center">
                      <div className="text-lg font-bold text-green-600">{activitySummary?.successfulCycles || 0}</div>
                      <div className="text-[10px] text-muted-foreground font-medium">Successful Cycles</div>
                    </div>
                    <div className="bg-white rounded-lg p-2.5 border text-center">
                      <div className="text-lg font-bold text-purple-600">{activitySummary?.indicationsCalculated || 0}</div>
                      <div className="text-[10px] text-muted-foreground font-medium">Indications Calc</div>
                    </div>
                    <div className="bg-white rounded-lg p-2.5 border text-center">
                      <div className="text-lg font-bold text-orange-600">{activitySummary?.strategiesEvaluated || 0}</div>
                      <div className="text-[10px] text-muted-foreground font-medium">Strategies Eval</div>
                    </div>
                  </div>
                </div>

                {/* Engine Progression Details */}
                {engineProgression && (
                  <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-lg p-4 border border-indigo-200/50">
                    <h3 className="text-sm font-semibold text-indigo-900 mb-3 flex items-center gap-2">
                      <Cpu className="h-4 w-4" />
                      Engine Progression Details
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white rounded-lg p-2.5 border">
                        <div className="text-[10px] text-muted-foreground mb-0.5">Current Phase</div>
                        <div className="flex items-center gap-1.5">
                          {PHASE_ICONS[engineProgression.phase]}
                          <span className="text-xs font-semibold">{PHASE_LABELS[engineProgression.phase] || engineProgression.phase}</span>
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-2.5 border">
                        <div className="text-[10px] text-muted-foreground mb-0.5">Progress</div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted rounded-full h-1.5">
                            <div
                              className="bg-indigo-500 h-1.5 rounded-full"
                              style={{ width: `${engineProgression.progress}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold">{engineProgression.progress}%</span>
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-2.5 border">
                        <div className="text-[10px] text-muted-foreground mb-0.5">Last Updated</div>
                        <div className="text-xs font-mono">
                          {engineProgression.updatedAt ? new Date(engineProgression.updatedAt).toLocaleTimeString() : "N/A"}
                        </div>
                      </div>
                    </div>

                    {/* Prehistoric / Historical Data Info */}
                    <div className="mt-3 bg-white rounded-lg p-3 border">
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        Historical Data Indications
                      </div>
                      <div className="grid grid-cols-5 gap-2">
                        {Object.entries(engineProgression.details).map(([key, value]) => (
                          <div key={key} className="text-center">
                            <div className={`text-lg font-bold ${value ? "text-green-600" : "text-gray-400"}`}>
                              {value ? "✓" : "—"}
                            </div>
                            <div className="text-[9px] text-muted-foreground capitalize">
                              {key.replace(/([A-Z])/g, " $1").trim()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Counts & Cycles */}
                <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-lg p-4 border border-emerald-200/50">
                  <h3 className="text-sm font-semibold text-emerald-900 mb-3 flex items-center gap-2">
                    <GitBranch className="h-4 w-4" />
                    Counts & Cycles
                  </h3>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-white rounded-lg p-2.5 border text-center">
                      <div className="text-lg font-bold text-emerald-600">{activitySummary?.cyclesCompleted || 0}</div>
                      <div className="text-[10px] text-muted-foreground">Total Cycles</div>
                    </div>
                    <div className="bg-white rounded-lg p-2.5 border text-center">
                      <div className="text-lg font-bold text-green-600">{activitySummary?.successfulCycles || 0}</div>
                      <div className="text-[10px] text-muted-foreground">Successful</div>
                    </div>
                    <div className="bg-white rounded-lg p-2.5 border text-center">
                      <div className="text-lg font-bold text-red-600">{activitySummary?.failedCycles || 0}</div>
                      <div className="text-[10px] text-muted-foreground">Failed</div>
                    </div>
                    <div className="bg-white rounded-lg p-2.5 border text-center">
                      <div className="text-lg font-bold text-blue-600">{activitySummary?.successRate?.toFixed(1) || "0.0"}%</div>
                      <div className="text-[10px] text-muted-foreground">Success Rate</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <div className="bg-white rounded-lg p-2.5 border">
                      <div className="text-[10px] text-muted-foreground">Avg Cycle Duration</div>
                      <div className="text-sm font-bold font-mono">
                        {formatDuration(activitySummary?.avgCycleDuration || 0)}
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-2.5 border">
                      <div className="text-[10px] text-muted-foreground">Configs Processed</div>
                      <div className="text-sm font-bold font-mono">{activitySummary?.configsProcessed || 0}</div>
                    </div>
                    <div className="bg-white rounded-lg p-2.5 border">
                      <div className="text-[10px] text-muted-foreground">Positions Generated</div>
                      <div className="text-sm font-bold font-mono">{activitySummary?.positionsGenerated || 0}</div>
                    </div>
                  </div>
                </div>

                {/* Percentages & Types */}
                <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-lg p-4 border border-amber-200/50">
                  <h3 className="text-sm font-semibold text-amber-900 mb-3 flex items-center gap-2">
                    <Scale className="h-4 w-4" />
                    Percentages & Types Breakdown
                  </h3>
                  <div className="space-y-2">
                    {[
                      { label: "Info", count: activitySummary?.totalInfo || 0, color: "bg-blue-500", total: activitySummary?.totalLogs || 1 },
                      { label: "Warnings", count: activitySummary?.totalWarnings || 0, color: "bg-yellow-500", total: activitySummary?.totalLogs || 1 },
                      { label: "Errors", count: activitySummary?.totalErrors || 0, color: "bg-red-500", total: activitySummary?.totalLogs || 1 },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-3">
                        <span className="text-xs font-medium w-16">{item.label}</span>
                        <div className="flex-1 bg-white rounded-full h-2.5 border">
                          <div
                            className={`${item.color} h-2.5 rounded-full transition-all`}
                            style={{ width: `${Math.min((item.count / item.total) * 100, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono w-16 text-right">
                          {item.count} ({((item.count / item.total) * 100).toFixed(1)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Loads & Times */}
                <div className="bg-gradient-to-br from-cyan-50 to-cyan-100/50 rounded-lg p-4 border border-cyan-200/50">
                  <h3 className="text-sm font-semibold text-cyan-900 mb-3 flex items-center gap-2">
                    <Timer className="h-4 w-4" />
                    Loads & Times
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-lg p-3 border">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Load Times</div>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Average:</span>
                          <span className="font-mono font-semibold">
                            {formatDuration(dataMetrics?.loadMetrics.avgLoadTime || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Max:</span>
                          <span className="font-mono font-semibold text-red-600">
                            {formatDuration(dataMetrics?.loadMetrics.maxLoadTime || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Min:</span>
                          <span className="font-mono font-semibold text-green-600">
                            {formatDuration(dataMetrics?.loadMetrics.minLoadTime || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Loads:</span>
                          <span className="font-mono font-semibold">{dataMetrics?.loadMetrics.totalLoads || 0}</span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Processing Times</div>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Average:</span>
                          <span className="font-mono font-semibold">
                            {formatDuration(dataMetrics?.timeMetrics.avgProcessingTime || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Max:</span>
                          <span className="font-mono font-semibold text-red-600">
                            {formatDuration(dataMetrics?.timeMetrics.maxProcessingTime || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Min:</span>
                          <span className="font-mono font-semibold text-green-600">
                            {formatDuration(dataMetrics?.timeMetrics.minProcessingTime || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Time:</span>
                          <span className="font-mono font-semibold">
                            {formatDuration(dataMetrics?.timeMetrics.totalTimeSpent || 0)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sizes & Data Volume */}
                <div className="bg-gradient-to-br from-violet-50 to-violet-100/50 rounded-lg p-4 border border-violet-200/50">
                  <h3 className="text-sm font-semibold text-violet-900 mb-3 flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    Sizes & Data Volume
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white rounded-lg p-3 border text-center">
                      <div className="text-lg font-bold text-violet-600">
                        {formatBytes(dataMetrics?.sizeMetrics.avgResponseSize || 0)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Avg Response</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border text-center">
                      <div className="text-lg font-bold text-violet-600">
                        {formatBytes(dataMetrics?.sizeMetrics.maxResponseSize || 0)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Max Response</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border text-center">
                      <div className="text-lg font-bold text-violet-600">
                        {formatBytes(dataMetrics?.sizeMetrics.totalDataSize || 0)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Total Data</div>
                    </div>
                  </div>
                </div>

                {/* Request Counts */}
                <div className="bg-gradient-to-br from-rose-50 to-rose-100/50 rounded-lg p-4 border border-rose-200/50">
                  <h3 className="text-sm font-semibold text-rose-900 mb-3 flex items-center gap-2">
                    <ArrowUpRight className="h-4 w-4" />
                    Request Counts
                  </h3>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-white rounded-lg p-2.5 border text-center">
                      <div className="text-lg font-bold text-rose-600">{dataMetrics?.countMetrics.totalRequests || 0}</div>
                      <div className="text-[10px] text-muted-foreground">Total</div>
                    </div>
                    <div className="bg-white rounded-lg p-2.5 border text-center">
                      <div className="text-lg font-bold text-green-600">{dataMetrics?.countMetrics.successfulRequests || 0}</div>
                      <div className="text-[10px] text-muted-foreground">Success</div>
                    </div>
                    <div className="bg-white rounded-lg p-2.5 border text-center">
                      <div className="text-lg font-bold text-red-600">{dataMetrics?.countMetrics.failedRequests || 0}</div>
                      <div className="text-[10px] text-muted-foreground">Failed</div>
                    </div>
                    <div className="bg-white rounded-lg p-2.5 border text-center">
                      <div className="text-lg font-bold text-yellow-600">{dataMetrics?.countMetrics.rateLimitedRequests || 0}</div>
                      <div className="text-[10px] text-muted-foreground">Rate Limited</div>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="error" className="flex-1 min-h-0 mt-3 overflow-hidden">
            <div className="space-y-3 h-full flex flex-col">
              {/* Error Summary */}
              <div className="grid grid-cols-4 gap-2 shrink-0">
                <div className="bg-gradient-to-br from-red-50 to-red-100/50 rounded-lg p-3 border border-red-200/50 text-center">
                  <div className="text-xl font-bold text-red-700">{categorizedErrors.length}</div>
                  <div className="text-[10px] text-red-600/80 font-medium uppercase tracking-wide">Total Errors</div>
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 rounded-lg p-3 border border-orange-200/50 text-center">
                  <div className="text-xl font-bold text-orange-700">
                    {categorizedErrors.filter((e) => e.severity === "critical" || e.severity === "high").length}
                  </div>
                  <div className="text-[10px] text-orange-600/80 font-medium uppercase tracking-wide">High Severity</div>
                </div>
                <div className="bg-gradient-to-br from-yellow-50 to-yellow-100/50 rounded-lg p-3 border border-yellow-200/50 text-center">
                  <div className="text-xl font-bold text-yellow-700">
                    {categorizedErrors.filter((e) => !e.resolved).length}
                  </div>
                  <div className="text-[10px] text-yellow-600/80 font-medium uppercase tracking-wide">Unresolved</div>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100/50 rounded-lg p-3 border border-green-200/50 text-center">
                  <div className="text-xl font-bold text-green-700">
                    {categorizedErrors.filter((e) => e.resolved).length}
                  </div>
                  <div className="text-[10px] text-green-600/80 font-medium uppercase tracking-wide">Resolved</div>
                </div>
              </div>

              {/* Zero Results / Mismatches Warning */}
              {categorizedErrors.length === 0 && (
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-6 border border-green-200/50 text-center shrink-0">
                  <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-2" />
                  <h3 className="text-sm font-semibold text-green-900 mb-1">No Errors Detected</h3>
                  <p className="text-xs text-green-700">
                    All operations are running smoothly. No errors, mismatches, or zero-result occurrences found.
                  </p>
                </div>
              )}

              {/* Errors by Category */}
              {Object.keys(errorsByCategory).length > 0 && (
                <ScrollArea className="flex-1 min-h-0 border rounded-lg bg-muted/20">
                  <div className="p-3 space-y-3">
                    {Object.entries(errorsByCategory).map(([category, errors]) => (
                      <Collapsible
                        key={category}
                        open={expandedCategories.has(`error-${category}`)}
                        onOpenChange={() => toggleCategoryExpand(`error-${category}`)}
                      >
                        <CollapsibleTrigger asChild>
                          <div className="flex items-center gap-2 p-2 bg-white rounded-lg border cursor-pointer hover:bg-muted/30">
                            {expandedCategories.has(`error-${category}`) ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            <Badge
                              variant="outline"
                              className={`${CATEGORY_COLORS[category] || "bg-gray-100 text-gray-800"}`}
                            >
                              {category}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {errors.length} error{errors.length !== 1 ? "s" : ""}
                            </span>
                            <Badge variant="destructive" className="ml-auto text-[10px]">
                              {errors.filter((e) => !e.resolved).length} active
                            </Badge>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="ml-6 mt-1 space-y-1.5">
                            {errors.map((error) => (
                              <Collapsible
                                key={error.id}
                                open={expandedErrors.has(error.id)}
                                onOpenChange={() => toggleErrorExpand(error.id)}
                              >
                                <CollapsibleTrigger asChild>
                                  <div className="flex items-start gap-2 p-2.5 bg-white rounded border hover:bg-muted/30 cursor-pointer">
                                    {expandedErrors.has(error.id) ? (
                                      <ChevronDown className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" />
                                    ) : (
                                      <ChevronRight className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                        <Badge className={`${SEVERITY_COLORS[error.severity]} text-[9px] px-1.5 py-0`}>
                                          {error.severity}
                                        </Badge>
                                        <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                                          {error.phase || "N/A"}
                                        </Badge>
                                        {error.resolved ? (
                                          <Badge className="bg-green-100 text-green-800 text-[9px] px-1.5 py-0">
                                            <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                                            Resolved
                                          </Badge>
                                        ) : (
                                          <Badge className="bg-red-100 text-red-800 text-[9px] px-1.5 py-0">
                                            <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
                                            Active
                                          </Badge>
                                        )}
                                        <span className="text-[10px] text-muted-foreground ml-auto">
                                          ×{error.count} occurrences
                                        </span>
                                      </div>
                                      <p className="text-xs font-medium truncate">{error.message}</p>
                                      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                                        <span>First: {new Date(error.firstOccurrence).toLocaleString()}</span>
                                        <span>Last: {new Date(error.lastOccurrence).toLocaleString()}</span>
                                      </div>
                                    </div>
                                  </div>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div className="ml-4 p-2.5 bg-muted/40 rounded border text-xs space-y-1.5">
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Error ID:</span>
                                      <span className="font-mono text-[10px]">{error.id}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Category:</span>
                                      <span className="font-medium capitalize">{error.category}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Phase:</span>
                                      <span className="font-medium">{error.phase || "N/A"}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Occurrences:</span>
                                      <span className="font-mono font-semibold">{error.count}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground block mb-1">Details:</span>
                                      <pre className="bg-background/50 p-2 rounded text-[10px] overflow-x-auto border whitespace-pre-wrap">
                                        {error.details}
                                      </pre>
                                    </div>
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {/* Error Type Distribution */}
              {categorizedErrors.length > 0 && (
                <div className="shrink-0 border-t pt-3">
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                    Error Distribution by Severity
                  </h4>
                  <div className="grid grid-cols-4 gap-2">
                    {(["critical", "high", "medium", "low"] as const).map((severity) => {
                      const count = categorizedErrors.filter((e) => e.severity === severity).length
                      const pct = categorizedErrors.length > 0 ? (count / categorizedErrors.length) * 100 : 0
                      return (
                        <div key={severity} className="bg-white rounded-lg p-2.5 border text-center">
                          <div className={`text-lg font-bold ${
                            severity === "critical" ? "text-red-600" :
                            severity === "high" ? "text-orange-600" :
                            severity === "medium" ? "text-yellow-600" :
                            "text-green-600"
                          }`}>
                            {count}
                          </div>
                          <div className="text-[10px] text-muted-foreground capitalize">{severity}</div>
                          <div className="text-[9px] text-muted-foreground">{pct.toFixed(0)}%</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="topmenu" className="flex-1 min-h-0 mt-3 overflow-hidden">
            <ScrollArea className="h-[60vh]">
              <div className="space-y-4 p-1">
                {/* Connection Overview */}
                <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-lg p-4 border border-blue-200/50">
                  <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Connection Overview
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white rounded-lg p-3 border">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Connection Tests</div>
                      <div className="text-lg font-bold text-blue-600">{activitySummary?.connectionTests || 0}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-green-600 flex items-center gap-0.5">
                          <ArrowUpRight className="h-3 w-3" />
                          {activitySummary?.connectionTestSuccess || 0}
                        </span>
                        <span className="text-[10px] text-red-600 flex items-center gap-0.5">
                          <ArrowDownRight className="h-3 w-3" />
                          {activitySummary?.connectionTestFail || 0}
                        </span>
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Engine Starts</div>
                      <div className="text-lg font-bold text-green-600">{activitySummary?.engineStarts || 0}</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Engine Stops</div>
                      <div className="text-lg font-bold text-red-600">{activitySummary?.engineStops || 0}</div>
                    </div>
                  </div>
                </div>

                {/* Strategy Indications */}
                <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-lg p-4 border border-purple-200/50">
                  <h3 className="text-sm font-semibold text-purple-900 mb-3 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Strategies & Indications
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-lg p-3 border">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Indications Calculated</div>
                      <div className="text-2xl font-bold text-purple-600">{activitySummary?.indicationsCalculated || 0}</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Strategies Evaluated</div>
                      <div className="text-2xl font-bold text-green-600">{activitySummary?.strategiesEvaluated || 0}</div>
                    </div>
                  </div>
                </div>

                {/* Position Breakdown */}
                <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 rounded-lg p-4 border border-orange-200/50">
                  <h3 className="text-sm font-semibold text-orange-900 mb-3 flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Position Breakdown
                  </h3>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-white rounded-lg p-3 border text-center">
                      <div className="text-lg font-bold text-gray-600">{dataMetrics?.positionTypes.base || 0}</div>
                      <div className="text-[10px] text-muted-foreground">Base</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border text-center">
                      <div className="text-lg font-bold text-blue-600">{dataMetrics?.positionTypes.main || 0}</div>
                      <div className="text-[10px] text-muted-foreground">Main</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border text-center">
                      <div className="text-lg font-bold text-green-600">{dataMetrics?.positionTypes.real || 0}</div>
                      <div className="text-[10px] text-muted-foreground">Real</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border text-center">
                      <div className="text-lg font-bold text-purple-600">{dataMetrics?.positionTypes.total || 0}</div>
                      <div className="text-[10px] text-muted-foreground">Total</div>
                    </div>
                  </div>
                </div>

                {/* Activity Timeline */}
                <div className="bg-gradient-to-br from-teal-50 to-teal-100/50 rounded-lg p-4 border border-teal-200/50">
                  <h3 className="text-sm font-semibold text-teal-900 mb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Activity Timeline
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-lg p-3 border">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Last Activity</div>
                      <div className="text-xs font-mono">
                        {activitySummary?.lastActivity
                          ? new Date(activitySummary.lastActivity).toLocaleString()
                          : "No activity recorded"}
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Uptime</div>
                      <div className="text-xs font-mono">
                        {activitySummary?.uptime || "N/A"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-lg p-4 border border-slate-200/50">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Quick Actions
                  </h3>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={loadData}>
                      <RefreshCw className="h-3.5 w-3.5" />
                      Refresh All
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs gap-1.5">
                      <Download className="h-3.5 w-3.5" />
                      Export Logs
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1.5 text-red-600 hover:text-red-700"
                      onClick={() => {
                        if (confirm("Clear all logs for this connection?")) {
                          toast.success("Logs cleared")
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Clear Logs
                    </Button>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
