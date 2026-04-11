"use client"

import React, { useState, useEffect, useMemo, ReactNode } from "react"
import { useAuth } from "@/lib/auth-context"
import { useExchange } from "@/lib/exchange-context"
import { DashboardStateProvider, useDashboardState } from "@/contexts/dashboard-state-context"
import { SystemOverview } from "./system-overview"
import { FunctionalOverview } from "./functional-overview"
import { GlobalTradeEngineControls } from "./global-trade-engine-controls"
import { DashboardActiveConnectionsManager } from "./dashboard-active-connections-manager"
import { IntervalsStrategiesOverview } from "./intervals-strategies-overview"
import { StatisticsOverviewV2 } from "./statistics-overview-v2"
import { SystemMonitoringPanel } from "./system-monitoring-panel"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import type { ExchangeConnection } from "@/lib/types"

// Error Boundary Component
interface ErrorBoundaryProps {
  children: ReactNode
  name: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error) {
    console.error(`[v0] [ErrorBoundary] Error in ${this.props.name}:`, error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="p-4 bg-red-50 border-red-200">
          <p className="text-sm text-red-700">
            Failed to load {this.props.name}. {this.state.error?.message}
          </p>
        </Card>
      )
    }

    return this.props.children
  }
}

export function Dashboard() {
  const { user } = useAuth()
  const { selectedExchange } = useExchange()

  return (
    <DashboardStateProvider>
      <DashboardContent selectedExchange={selectedExchange} />
    </DashboardStateProvider>
  )
}

function DashboardContent({ selectedExchange }: { selectedExchange: string | null }) {
  const { 
    isLoading, 
    activeConnections,
    statistics,
    refresh
  } = useDashboardState()

  // Filter ExchangeConnectionsActive by selected exchange
  const filteredConnections = useMemo(() => {
    if (!selectedExchange) {
      return activeConnections
    }
    return activeConnections.filter((conn: any) => conn.exchange === selectedExchange)
  }, [activeConnections, selectedExchange])

  useEffect(() => {
    console.log("[v0] [Dashboard] Mounted")
  }, [])

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-1">CTS v3.2 Dashboard</h1>
          <p className="text-muted-foreground text-sm">Monitor and control your active trading connections</p>
        </div>
        <Button onClick={loadExchangeConnectionsActive} size="sm" variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Smart Overview - Comprehensive system status */}
      <ErrorBoundary name="System Overview">
        <SystemOverview />
      </ErrorBoundary>

      {/* Functional Overview - Real-time processing metrics */}
      <ErrorBoundary name="Functional Overview">
        <FunctionalOverview />
      </ErrorBoundary>

      {/* Trade Engine Controls */}
      <ErrorBoundary name="Global Trade Engine Controls">
        <GlobalTradeEngineControls />
      </ErrorBoundary>

      {/* Active Connections - With global engine guard, progression tracking, sticky state */}
      <ErrorBoundary name="Active Connections">
        <DashboardActiveConnectionsManager />
      </ErrorBoundary>

      {/* Intervals & Strategies Overview */}
      {filteredConnections.length > 0 && (
        <ErrorBoundary name="Intervals & Strategies">
          <IntervalsStrategiesOverview connections={filteredConnections} />
        </ErrorBoundary>
      )}

      {/* Statistics Overview V2 - Unified widget with all metrics */}
      {filteredConnections.length > 0 && (
        <div className="col-span-full">
          <ErrorBoundary name="Statistics Overview">
            <StatisticsOverviewV2 connections={filteredConnections.map(c => ({ id: c.connectionId, name: c.exchangeName }))} />
          </ErrorBoundary>
        </div>
      )}

      {/* System Monitoring Panel - CPU, Memory, Services, Database, Recent Activity */}
      <ErrorBoundary name="System Monitoring">
        <SystemMonitoringPanel />
      </ErrorBoundary>
    </div>
  )
}
