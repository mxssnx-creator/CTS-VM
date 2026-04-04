"use client"

import { useState, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Play,
  Clock,
  ChevronDown,
  ChevronRight,
  Activity,
  Terminal,
  Cpu,
  MemoryStick,
  TrendingUp,
  Database,
  BarChart3,
  Zap,
  Shield,
  Gauge,
  Layers,
  Target,
} from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

interface TestMetrics {
  testDuration: string
  cpuAverage: string
  memoryAverage: string
  cycleSuccessRate: string
  avgCycleTime: string
  totalCycles: number
  totalIndicationsGenerated: number
  strategiesEvaluated: number
  prehistoricCandlesProcessed: number
  symbolsLoaded: number
  databaseSize: string
  databaseKeys: number
  tradeSuccessRate: string
  positionsGenerated: number
}

interface TestOverview {
  engineHealth: string
  redisConnections: number
  marketDataStatus: string
  progressionPhase: string
  activeStrategies: {
    base: number
    main: number
    real: number
    live: number
  }
  activePositions: number
  indicationTypes: string[]
  errorCount: number
  warningsCount: number
  throughputPerMinute: {
    indications: number
    strategies: number
    cycles: number
  }
  resourceUtilization: {
    cpuPeak: string
    memoryPeak: string
    networkLatency: string
  }
  dataIntegrity: {
    candlesValidated: number
    strategiesValidated: number
    positionsValidated: number
    consistencyScore: string
  }
}

interface TestMetrics {
  testDuration: string
  cpuAverage: string
  memoryAverage: string
  cycleSuccessRate: string
  avgCycleTime: string
  totalCycles: number
  totalIndicationsGenerated: number
  strategiesEvaluated: number
  prehistoricCandlesProcessed: number
  symbolsLoaded: number
  databaseSize: string
  databaseKeys: number
  tradeSuccessRate: string
  positionsGenerated: number
}

interface TestOverview {
  engineHealth: string
  redisConnections: number
  marketDataStatus: string
  progressionPhase: string
  activeStrategies: {
    base: number
    main: number
    real: number
    live: number
  }
  activePositions: number
  indicationTypes: string[]
  errorCount: number
  warningsCount: number
  throughputPerMinute: {
    indications: number
    strategies: number
    cycles: number
  }
  resourceUtilization: {
    cpuPeak: string
    memoryPeak: string
    networkLatency: string
  }
  dataIntegrity: {
    candlesValidated: number
    strategiesValidated: number
    positionsValidated: number
    consistencyScore: string
  }
}

interface TestPhase {
  id: string
  name: string
  status: "pending" | "running" | "success" | "error" | "skipped"
  message?: string
  duration?: number
  details?: Record<string, unknown>
}

interface TestState {
  phases: TestPhase[]
  overallStatus: "idle" | "running" | "completed" | "error"
  currentPhase: string
  startTime: number
  summary?: {
    total: number
    passed: number
    failed: number
    skipped: number
    duration: number
  }
  metrics?: TestMetrics
  overview?: TestOverview
}

interface TestState {
  phases: TestPhase[]
  overallStatus: "idle" | "running" | "completed" | "error"
  currentPhase: string
  startTime: number
  summary?: {
    total: number
    passed: number
    failed: number
    skipped: number
    duration: number
  }
  metrics?: TestMetrics
  overview?: TestOverview
}

export function ComprehensiveDevModeDialog() {
  const [open, setOpen] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [testState, setTestState] = useState<TestState | null>(null)
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set())
  const [elapsed, setElapsed] = useState(0)

  const toggleExpand = (id: string) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const runTest = useCallback(async () => {
    setIsRunning(true)
    setElapsed(0)

    const initialState: TestState = {
      phases: [
        { id: "init", name: "Redis & Database Init", status: "pending" },
        { id: "market_data", name: "Market Data Loading", status: "pending" },
        { id: "prehistoric", name: "Prehistoric Data Processing", status: "pending" },
        { id: "indications", name: "Indication Processing", status: "pending" },
        { id: "strategy_flow", name: "Strategy Flow (BASE → MAIN → REAL → LIVE)", status: "pending" },
        { id: "positions", name: "Position Management", status: "pending" },
        { id: "engine_cycle", name: "Engine Manager Full Cycle", status: "pending" },
        { id: "logging", name: "Logging Verification", status: "pending" },
        { id: "realtime", name: "Real-time Processing", status: "pending" },
        { id: "final_state", name: "Final Database State & Statistics", status: "pending" },
      ],
      overallStatus: "running",
      currentPhase: "",
      startTime: Date.now(),
    }
    setTestState(initialState)

    const timer = setInterval(() => {
      setElapsed((e) => e + 100)
    }, 100)

    try {
      const response = await fetch("/api/testing/comprehensive-dev-mode", {
        method: "POST",
        cache: "no-store",
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const data = await response.json()
      setTestState(data)
    } catch (error) {
      setTestState((prev) =>
        prev
          ? {
              ...prev,
              overallStatus: "error",
              currentPhase: "",
              summary: {
                total: prev.phases.length,
                passed: prev.phases.filter((p) => p.status === "success").length,
                failed: 1,
                skipped: 0,
                duration: Date.now() - prev.startTime,
              },
            }
          : null
      )
    } finally {
      clearInterval(timer)
      setIsRunning(false)
    }
  }, [])

  const getStatusIcon = (status: TestPhase["status"]) => {
    switch (status) {
      case "running":
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
      case "success":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-500" />
      case "skipped":
        return <Clock className="w-4 h-4 text-gray-400" />
      default:
        return <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
    }
  }

  const getStatusBadge = (status: TestPhase["status"]) => {
    const variants: Record<string, string> = {
      pending: "bg-gray-100 text-gray-600",
      running: "bg-blue-100 text-blue-700",
      success: "bg-green-100 text-green-700",
      error: "bg-red-100 text-red-700",
      skipped: "bg-gray-100 text-gray-500",
    }
    return (
      <Badge className={`${variants[status]} text-[10px] px-1.5 py-0`}>
        {status}
      </Badge>
    )
  }

  const completedCount = testState?.phases.filter((p) => p.status === "success" || p.status === "error" || p.status === "skipped").length ?? 0
  const totalCount = testState?.phases.length ?? 10
  const progressPercent = (completedCount / totalCount) * 100

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${seconds}s`
  }

  const renderPhaseDetails = (phase: TestPhase) => {
    if (!phase.details) return null

    const entries = Object.entries(phase.details)
    return (
      <div className="ml-6 p-3 bg-muted/50 rounded text-xs space-y-1.5 font-mono">
        {entries.map(([key, value]) => (
          <div key={key} className="flex justify-between gap-4">
            <span className="text-muted-foreground shrink-0">{key}:</span>
            <span className="truncate">
              {typeof value === "object" ? JSON.stringify(value) : String(value)}
            </span>
          </div>
        ))}
        {phase.duration && (
          <div className="flex justify-between gap-4 pt-1 border-t border-muted">
            <span className="text-muted-foreground">Duration:</span>
            <span>{phase.duration}ms</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 w-full">
          <Terminal className="w-4 h-4" />
          Run Comprehensive Dev Mode Test
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-purple-500" />
            Comprehensive Dev Mode Test Suite
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Tests complete engine progression: quickstart, prehistoric data, engine processing,
            indications, strategies, positions, database, logging, and real-time processing.
          </p>
        </DialogHeader>

        {/* Action Bar */}
        <div className="flex items-center gap-3">
          <Button
            onClick={runTest}
            disabled={isRunning}
            className="gap-2"
            size="sm"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run Test Suite
              </>
            )}
          </Button>

          {testState && (
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="outline" className="text-xs">
                {completedCount}/{totalCount} phases
              </Badge>
              {testState.summary && (
                <>
                  <Badge className="bg-green-100 text-green-700 text-xs">
                    {testState.summary.passed} passed
                  </Badge>
                  {testState.summary.failed > 0 && (
                    <Badge className="bg-red-100 text-red-700 text-xs">
                      {testState.summary.failed} failed
                    </Badge>
                  )}
                  <span className="text-muted-foreground text-xs">
                    {formatDuration(testState.summary.duration)}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {testState && (
          <div className="space-y-1">
            <Progress value={progressPercent} className="h-2" />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Progress: {Math.round(progressPercent)}%</span>
              {testState.currentPhase && (
                <span>Current: {testState.phases.find((p) => p.id === testState.currentPhase)?.name}</span>
              )}
            </div>
          </div>
        )}

        {/* Phase List */}
        <ScrollArea className="flex-1 min-h-[300px] border rounded-md">
          <div className="p-2 space-y-1">
            {testState?.phases.map((phase) => (
              <Collapsible
                key={phase.id}
                open={expandedPhases.has(phase.id)}
                onOpenChange={() => toggleExpand(phase.id)}
              >
                <CollapsibleTrigger asChild>
                  <div className="flex items-center gap-3 p-2.5 hover:bg-muted rounded cursor-pointer text-sm">
                    {phase.details ? (
                      expandedPhases.has(phase.id) ? (
                        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      )
                    ) : (
                      <div className="w-3.5 shrink-0" />
                    )}
                    {getStatusIcon(phase.status)}
                    <span className="flex-1 font-medium truncate">{phase.name}</span>
                    {getStatusBadge(phase.status)}
                    {phase.message && (
                      <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {phase.message}
                      </span>
                    )}
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  {renderPhaseDetails(phase)}
                </CollapsibleContent>
              </Collapsible>
            ))}

            {!testState && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Click &quot;Run Test Suite&quot; to start the comprehensive dev mode test
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Summary Footer */}
        {testState?.summary && (
          <div className="border-t pt-3 space-y-4">
            {/* Quick Summary */}
            <div className="grid grid-cols-4 gap-3 text-xs">
              <div className="bg-muted rounded p-2 text-center">
                <div className="text-lg font-bold">{testState.summary.total}</div>
                <div className="text-muted-foreground">Total Phases</div>
              </div>
              <div className="bg-green-50 rounded p-2 text-center">
                <div className="text-lg font-bold text-green-600">{testState.summary.passed}</div>
                <div className="text-muted-foreground">Passed</div>
              </div>
              <div className="bg-red-50 rounded p-2 text-center">
                <div className="text-lg font-bold text-red-600">{testState.summary.failed}</div>
                <div className="text-muted-foreground">Failed</div>
              </div>
              <div className="bg-muted rounded p-2 text-center">
                <div className="text-lg font-bold">{formatDuration(testState.summary.duration)}</div>
                <div className="text-muted-foreground">Duration</div>
              </div>
            </div>

            {/* Metrics Table */}
            {testState.metrics && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gradient-to-r from-purple-500 to-indigo-600 px-4 py-2.5">
                  <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Test Results Metrics
                  </h3>
                </div>
                <div className="divide-y">
                  <div className="grid grid-cols-2 px-4 py-2.5 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Test Duration</span>
                    </div>
                    <div className="text-sm font-semibold text-right">{testState.metrics.testDuration}</div>
                  </div>
                  <div className="grid grid-cols-2 px-4 py-2.5 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Cpu className="w-3.5 h-3.5" />
                      <span>CPU Average</span>
                    </div>
                    <div className="text-sm font-semibold text-right">{testState.metrics.cpuAverage}</div>
                  </div>
                  <div className="grid grid-cols-2 px-4 py-2.5 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MemoryStick className="w-3.5 h-3.5" />
                      <span>Memory Average</span>
                    </div>
                    <div className="text-sm font-semibold text-right">{testState.metrics.memoryAverage}</div>
                  </div>
                  <div className="grid grid-cols-2 px-4 py-2.5 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Target className="w-3.5 h-3.5" />
                      <span>Cycle Success Rate</span>
                    </div>
                    <div className="text-sm font-semibold text-right text-green-600">{testState.metrics.cycleSuccessRate}</div>
                  </div>
                  <div className="grid grid-cols-2 px-4 py-2.5 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Gauge className="w-3.5 h-3.5" />
                      <span>Avg Cycle Time</span>
                    </div>
                    <div className="text-sm font-semibold text-right">{testState.metrics.avgCycleTime}</div>
                  </div>
                  <div className="grid grid-cols-2 px-4 py-2.5 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Layers className="w-3.5 h-3.5" />
                      <span>Total Cycles</span>
                    </div>
                    <div className="text-sm font-semibold text-right">{testState.metrics.totalCycles.toLocaleString()}</div>
                  </div>
                  <div className="grid grid-cols-2 px-4 py-2.5 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Zap className="w-3.5 h-3.5" />
                      <span>Total Indications Generated</span>
                    </div>
                    <div className="text-sm font-semibold text-right">{testState.metrics.totalIndicationsGenerated.toLocaleString()}</div>
                  </div>
                  <div className="grid grid-cols-2 px-4 py-2.5 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>Strategies Evaluated</span>
                    </div>
                    <div className="text-sm font-semibold text-right">{testState.metrics.strategiesEvaluated.toLocaleString()}</div>
                  </div>
                  <div className="grid grid-cols-2 px-4 py-2.5 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Prehistoric Candles Processed</span>
                    </div>
                    <div className="text-sm font-semibold text-right">{testState.metrics.prehistoricCandlesProcessed.toLocaleString()}</div>
                  </div>
                  <div className="grid grid-cols-2 px-4 py-2.5 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span>Symbols Loaded</span>
                    </div>
                    <div className="text-sm font-semibold text-right">{testState.metrics.symbolsLoaded}</div>
                  </div>
                  <div className="grid grid-cols-2 px-4 py-2.5 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Database className="w-3.5 h-3.5" />
                      <span>Database Size</span>
                    </div>
                    <div className="text-sm font-semibold text-right">{testState.metrics.databaseSize}</div>
                  </div>
                  <div className="grid grid-cols-2 px-4 py-2.5 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Database className="w-3.5 h-3.5" />
                      <span>Database Keys</span>
                    </div>
                    <div className="text-sm font-semibold text-right">{testState.metrics.databaseKeys.toLocaleString()}</div>
                  </div>
                  <div className="grid grid-cols-2 px-4 py-2.5 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Target className="w-3.5 h-3.5" />
                      <span>Trade Success Rate</span>
                    </div>
                    <div className="text-sm font-semibold text-right text-green-600">{testState.metrics.tradeSuccessRate}</div>
                  </div>
                  <div className="grid grid-cols-2 px-4 py-2.5 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Layers className="w-3.5 h-3.5" />
                      <span>Positions Generated</span>
                    </div>
                    <div className="text-sm font-semibold text-right">{testState.metrics.positionsGenerated}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Overview Section */}
            {testState.overview && (
              <div className="border rounded-lg overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
                <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2.5">
                  <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    System Overview
                  </h3>
                </div>
                <div className="p-4 space-y-4">
                  {/* Engine Status Row */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2 h-2 rounded-full ${testState.overview.engineHealth === "healthy" ? "bg-green-500" : "bg-red-500"}`} />
                        <span className="text-xs text-muted-foreground">Engine Health</span>
                      </div>
                      <div className="text-lg font-bold capitalize">{testState.overview.engineHealth}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <Database className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Redis Connections</span>
                      </div>
                      <div className="text-lg font-bold">{testState.overview.redisConnections}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Market Data</span>
                      </div>
                      <div className="text-lg font-bold capitalize">{testState.overview.marketDataStatus}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <Layers className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Progression</span>
                      </div>
                      <div className="text-lg font-bold capitalize">{testState.overview.progressionPhase}</div>
                    </div>
                  </div>

                  {/* Active Strategies */}
                  <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">Active Strategies by Stage</div>
                    <div className="grid grid-cols-4 gap-3">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">{testState.overview.activeStrategies.base}</div>
                        <div className="text-xs text-muted-foreground">BASE</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-indigo-600">{testState.overview.activeStrategies.main}</div>
                        <div className="text-xs text-muted-foreground">MAIN</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-600">{testState.overview.activeStrategies.real}</div>
                        <div className="text-xs text-muted-foreground">REAL</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-emerald-600">{testState.overview.activeStrategies.live}</div>
                        <div className="text-xs text-muted-foreground">LIVE</div>
                      </div>
                    </div>
                  </div>

                  {/* Throughput & Resources */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm">
                      <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Gauge className="w-3.5 h-3.5" />
                        Throughput / Minute
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Indications</span>
                          <span className="font-semibold">{testState.overview.throughputPerMinute.indications.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Strategies</span>
                          <span className="font-semibold">{testState.overview.throughputPerMinute.strategies.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Cycles</span>
                          <span className="font-semibold">{testState.overview.throughputPerMinute.cycles.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm">
                      <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5" />
                        Resource Utilization
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">CPU Peak</span>
                          <span className="font-semibold">{testState.overview.resourceUtilization.cpuPeak}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Memory Peak</span>
                          <span className="font-semibold">{testState.overview.resourceUtilization.memoryPeak}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Network Latency</span>
                          <span className="font-semibold">{testState.overview.resourceUtilization.networkLatency}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Data Integrity */}
                  <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm">
                    <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5" />
                      Data Integrity
                    </div>
                    <div className="grid grid-cols-4 gap-3 text-center">
                      <div>
                        <div className="text-lg font-bold">{testState.overview.dataIntegrity.candlesValidated.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">Candles</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold">{testState.overview.dataIntegrity.strategiesValidated.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">Strategies</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold">{testState.overview.dataIntegrity.positionsValidated}</div>
                        <div className="text-xs text-muted-foreground">Positions</div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-green-600">{testState.overview.dataIntegrity.consistencyScore}</div>
                        <div className="text-xs text-muted-foreground">Consistency</div>
                      </div>
                    </div>
                  </div>

                  {/* Indication Types & Errors */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm">
                      <div className="text-xs font-semibold text-muted-foreground mb-2">Indication Types</div>
                      <div className="flex flex-wrap gap-1.5">
                        {testState.overview.indicationTypes.map((type) => (
                          <Badge key={type} variant="secondary" className="text-xs">
                            {type}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-3 shadow-sm">
                      <div className="text-xs font-semibold text-muted-foreground mb-2">Test Summary</div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Errors</span>
                          <span className="font-semibold text-red-600">{testState.overview.errorCount}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Warnings</span>
                          <span className="font-semibold text-yellow-600">{testState.overview.warningsCount}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Active Positions</span>
                          <span className="font-semibold">{testState.overview.activePositions}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
