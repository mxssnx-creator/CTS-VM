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
} from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

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
          <div className="border-t pt-3">
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
