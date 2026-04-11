"use client"

import { AuthGuard } from "@/components/auth-guard"
import { Dashboard } from "@/components/dashboard/dashboard"
import { PageHeader } from "@/components/page-header"
import { useState, useEffect } from "react"

export default function HomePage() {
  const [mounted, setMounted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      setMounted(true)
      console.log("[v0] HomePage mounted successfully")
      
      // Fix: Ensure all BingX/Bybit connections use mainnet (not testnet) - both Redis and DB
      Promise.all([
        fetch("/api/trade-engine/fix-testnet", { method: "POST" }),
        fetch("/api/trade-engine/fix-testnet-database", { method: "POST" }),
      ])
        .then(() => console.log("[v0] Testnet fixes complete"))
        .catch(err => console.warn("[v0] Testnet fix failed:", err instanceof Error ? err.message : String(err)))
      
      // Auto-setup: Add BingX to active connections if it has credentials
      fetch("/api/trade-engine/auto-setup", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
        .then(() => console.log("[v0] Auto-setup complete"))
        .catch(err => console.warn("[v0] Auto-setup failed:", err instanceof Error ? err.message : String(err)))
      
      // Call startup-complete endpoint to trigger connection testing
      fetch("/api/health/startup-complete", { method: "POST" })
        .then(() => console.log("[v0] Startup complete notification sent"))
        .catch(err => console.warn("[v0] Failed to notify startup complete:", err instanceof Error ? err.message : String(err)))
    } catch (err) {
      console.error("[v0] Error in HomePage useEffect:", err)
      setError(err instanceof Error ? err.message : "Unknown error")
    }
  }, [])

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Initializing...</p>
        </div>
      </div>
    )
  }

  return (
    <AuthGuard>
      <div className="flex flex-col h-screen">
        <PageHeader title="Dashboard" description="Complete trading system monitoring and controls" />
        <div className="flex-1 overflow-auto">
          {error ? (
            <div className="p-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-700 font-medium">Error loading dashboard</p>
                <p className="text-sm text-red-600 mt-1">{error}</p>
              </div>
            </div>
          ) : (
            <ErrorBoundaryWrapper>
              <Dashboard />
            </ErrorBoundaryWrapper>
          )}
        </div>
      </div>
    </AuthGuard>
  )
}

function SmartLoggingDashboard() {
  const [logs, setLogs] = useState<any[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<string>("all")
  const [search, setSearch] = useState("")

  useEffect(() => {
    // Load initial logs
    fetch("/api/health/logs")
      .then(res => res.json())
      .then(data => setLogs(Array.isArray(data) ? data : []))
      .catch(() => setLogs([]))

    // Live log streaming
    const evtSource = new EventSource("/api/health/logs/stream")
    evtSource.onmessage = (event) => {
      try {
        const newLog = JSON.parse(event.data)
        setLogs(prev => [newLog, ...prev].slice(0, 500))
      } catch (e) {}
    }
    return () => evtSource.close()
  }, [])

  const filteredLogs = logs.filter(log => {
    if (filter !== "all" && log.level !== filter) return false
    if (search && !JSON.stringify(log).toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const logColors: Record<string, string> = {
    error: "border-l-red-500 bg-red-50/50",
    warn: "border-l-amber-500 bg-amber-50/50",
    info: "border-l-blue-500 bg-blue-50/50",
    debug: "border-l-slate-500 bg-slate-50/50",
    success: "border-l-green-500 bg-green-50/50",
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <input
          type="text"
          placeholder="Search logs..."
          className="flex-1 min-w-[200px] px-3 py-2 border rounded-md bg-background text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex items-center gap-2">
          {["all", "error", "warn", "info", "debug", "success"].map(level => (
            <button
              key={level}
              onClick={() => setFilter(level)}
              className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                filter === level
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent"
              }`}
            >
              {level.charAt(0).toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden divide-y">
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No logs found</div>
        ) : (
          filteredLogs.map((log, idx) => (
            <div
              key={log.id || idx}
              className={`border-l-4 ${logColors[log.level] || logColors.info} cursor-pointer hover:bg-accent/50 transition-colors`}
              onClick={() => toggleExpand(log.id || String(idx))}
            >
              <div className="px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                      log.level === "error" ? "bg-red-100 text-red-700" :
                      log.level === "warn" ? "bg-amber-100 text-amber-700" :
                      log.level === "success" ? "bg-green-100 text-green-700" :
                      log.level === "debug" ? "bg-slate-100 text-slate-700" :
                      "bg-blue-100 text-blue-700"
                    }`}>
                      {log.level?.toUpperCase() || "INFO"}
                    </span>
                    <span className="text-sm font-medium">{log.message || log.msg || "Log entry"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.timestamp || Date.now()).toLocaleString()}
                  </div>
                </div>
                {expanded.has(log.id || String(idx)) && (
                  <div className="mt-3 pt-3 border-t">
                    <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap bg-background/50 p-3 rounded-md text-muted-foreground">
                      {JSON.stringify(log, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function ErrorBoundaryWrapper({ children }: { children: React.ReactNode }) {
  const [hasError, setHasError] = useState(false)
  const [error, setErrorMessage] = useState<string>("")

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error("[v0] Global error caught:", event.error)
      setHasError(true)
      setErrorMessage(event.error?.message || "Unknown error")
    }

    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error("[v0] Unhandled rejection caught:", event.reason)
      setHasError(true)
      setErrorMessage(event.reason?.message || String(event.reason) || "Unknown error")
    }

    window.addEventListener("error", handleError)
    window.addEventListener("unhandledrejection", handleRejection)

    return () => {
      window.removeEventListener("error", handleError)
      window.removeEventListener("unhandledrejection", handleRejection)
    }
  }, [])

  if (hasError) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700 font-medium">Dashboard Error</p>
          <p className="text-sm text-red-600 mt-1">{error}</p>
          <button
            onClick={() => {
              setHasError(false)
              setErrorMessage("")
              window.location.reload()
            }}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700"
          >
            Reload Page
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
