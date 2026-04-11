'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useConnectionState } from '@/lib/connection-state'
import { EngineUniqueRelation } from '@/lib/engine-unique-relations'
import { useAllEngineRelations } from '@/hooks/use-engine-relation'

interface DashboardStateContextType {
  isLoading: boolean
  lastUpdated: Date | null
  activeConnections: any[]
  engineRelations: EngineUniqueRelation[]
  statistics: {
    activeConnections: number
    indicationsActive: number
    strategiesActive: number
    totalPositions: number
    dailyPnL: number
    totalBalance: number
    systemLoad: number
    databaseSize: number
  }
  refresh: () => Promise<void>
}

const DashboardStateContext = createContext<DashboardStateContextType | null>(null)

export function DashboardStateProvider({ children }: { children: React.ReactNode }) {
  const { exchangeConnectionsActive, loadExchangeConnectionsActive } = useConnectionState()
  
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [statistics, setStatistics] = useState({
    activeConnections: 0,
    indicationsActive: 0,
    strategiesActive: 0,
    totalPositions: 0,
    dailyPnL: 0,
    totalBalance: 0,
    systemLoad: 0,
    databaseSize: 0
  })

  const { relations: engineRelations, refresh: refreshRelations } = useAllEngineRelations()

  const loadStats = useCallback(async () => {
    try {
      const [statsRes, sysMonRes] = await Promise.all([
        fetch("/api/monitoring/stats"),
        fetch("/api/system/monitoring"),
      ])
      
      let data: any = {}
      let sysData: any = {}
      
      if (statsRes.ok) data = await statsRes.json()
      if (sysMonRes.ok) sysData = await sysMonRes.json()

      setStatistics({
        activeConnections: data.activeConnections ?? 0,
        totalPositions: data.totalPositions ?? 0,
        dailyPnL: data.dailyPnL ?? 0,
        totalBalance: data.totalBalance ?? 0,
        indicationsActive: sysData.engines?.indications?.resultsCount ?? 0,
        strategiesActive: sysData.engines?.strategies?.resultsCount ?? 0,
        systemLoad: sysData.cpu ?? 0,
        databaseSize: sysData.database?.keys ?? 0,
      })
      
      setLastUpdated(new Date())
    } catch (error) {
      console.error("[DashboardState] Failed to load stats:", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const refresh = useCallback(async () => {
    setIsLoading(true)
    await Promise.all([
      loadExchangeConnectionsActive(),
      loadStats(),
      refreshRelations()
    ])
    setIsLoading(false)
  }, [loadExchangeConnectionsActive, loadStats, refreshRelations])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 4000)
    return () => clearInterval(interval)
  }, [refresh])

  return (
    <DashboardStateContext.Provider value={{
      isLoading,
      lastUpdated,
      activeConnections: exchangeConnectionsActive,
      engineRelations,
      statistics,
      refresh
    }}>
      {children}
    </DashboardStateContext.Provider>
  )
}

export function useDashboardState() {
  const context = useContext(DashboardStateContext)
  if (!context) {
    throw new Error("useDashboardState must be used within DashboardStateProvider")
  }
  return context
}
