"use client"

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react"
import type { ExchangeConnection } from "@/lib/types"

interface TradeEngineStatus {
  connectionId: string
  status: "idle" | "starting" | "running" | "stopped" | "failed"
  lastUpdated: number
  progressionData?: {
    cycles_completed: number
    successful_cycles: number
    cycle_success_rate: string
    trades: number
    positions: number
  }
}

interface ConnectionState {
  // Base connections (all connections from database) - used in Settings
  baseConnections: ExchangeConnection[]
  setBaseConnections: (connections: ExchangeConnection[]) => void
  loadBaseConnections: () => Promise<void>
  isBaseLoading: boolean
  baseConnectionStatuses: Map<string, { enabled: boolean; assigned: boolean }>
  setBaseConnectionStatus: (id: string, enabled: boolean) => void
  markBaseAsAssigned: (id: string) => void
  
  // MainConnectionsActive (enabled only) - used in Main page with independent status
  exchangeConnectionsActive: ExchangeConnection[]
  setExchangeConnectionsActive: (connections: ExchangeConnection[]) => void
  loadExchangeConnectionsActive: () => Promise<void>
  isExchangeConnectionsActiveLoading: boolean
  
  // MainConnectionsActive status management - independent from settings
  exchangeConnectionsActiveStatus: Map<string, boolean> // id -> is_active
  toggleExchangeConnectionsActiveStatus: (id: string) => void
  markExchangeAsAssigned: (id: string) => void
  exchangeConnectionsAssignedStatus: Set<string>
  
  // Trade Engine Status - independent from connection status
  tradeEngineStatuses: Map<string, TradeEngineStatus>
  updateTradeEngineStatus: (connectionId: string, status: TradeEngineStatus) => void
  getTradeEngineStatus: (connectionId: string) => TradeEngineStatus | undefined
}

const ConnectionStateContext = createContext<ConnectionState | undefined>(undefined)

export function ConnectionStateProvider({ children }: { children: ReactNode }) {
  // Base connections state (Settings)
  const [baseConnections, setBaseConnections] = useState<ExchangeConnection[]>([])
  const [isBaseLoading, setIsBaseLoading] = useState(false)
  const [baseConnectionStatuses, setBaseConnectionStatuses] = useState<Map<string, { enabled: boolean; assigned: boolean }>>(new Map())
  
  // MainConnectionsActive state (Main page - independent status)
  const [exchangeConnectionsActive, setExchangeConnectionsActive] = useState<ExchangeConnection[]>([])
  const [isExchangeConnectionsActiveLoading, setIsExchangeConnectionsActiveLoading] = useState(false)
  const [exchangeConnectionsActiveStatus, setExchangeConnectionsActiveStatus] = useState<Map<string, boolean>>(new Map())
  const [exchangeConnectionsAssignedStatus, setExchangeConnectionsAssignedStatus] = useState<Set<string>>(new Set())
  
  // Trade Engine Status - independent from connections
  const [tradeEngineStatuses, setTradeEngineStatuses] = useState<Map<string, TradeEngineStatus>>(new Map())
  
  // Prevent concurrent loads and excessive queries
  const loadingRef = useRef<{ base: boolean; active: boolean }>({ base: false, active: false })
  const lastLoadRef = useRef<{ base: number; active: number }>({ base: 0, active: 0 })
  const LOAD_COOLDOWN = 5000 // 5 seconds between same-type loads

  // Load all connections for Settings (single unified function)
  const loadBaseConnections = async () => {
    if (loadingRef.current.base) return
    if (Date.now() - lastLoadRef.current.base < LOAD_COOLDOWN) return

    loadingRef.current.base = true
    setIsBaseLoading(true)
    try {
      const response = await fetch("/api/settings/connections")
      if (response.ok) {
        const data = await response.json()
        setBaseConnections(data.connections || [])
        
        // Initialize status map
        const AUTO_ASSIGNED = ["bybit", "bingx"]
        const statusMap = new Map<string, { enabled: boolean; assigned: boolean }>()
        data.connections?.forEach((conn: ExchangeConnection) => {
          const exchange = (conn.exchange || "").toLowerCase().trim()
          const isAutoAssigned = AUTO_ASSIGNED.includes(exchange)
          const isAssigned = (conn as any).is_assigned === "1" || (conn as any).is_assigned === true
          
          statusMap.set(conn.id, { 
            enabled: isAutoAssigned && isAssigned,
            assigned: false 
          })
        })
        setBaseConnectionStatuses(statusMap)
        
        // Also update Main connections if any are marked as visible on main page
        const activeConns = data.connections?.filter((c: ExchangeConnection) => 
          (c as any).is_main_enabled === true || (c as any).is_main_enabled === "1"
        ) || []
        
        if (activeConns.length > 0) {
          setExchangeConnectionsActive(activeConns)
          const activeStatusMap = new Map<string, boolean>()
          activeConns.forEach((conn: ExchangeConnection) => {
            activeStatusMap.set(conn.id, false)
          })
          setExchangeConnectionsActiveStatus(activeStatusMap)
        }
      }
    } catch (error) {
      console.error("[v0] [ConnectionState] Failed to load base connections:", error)
    } finally {
      loadingRef.current.base = false
      setIsBaseLoading(false)
      lastLoadRef.current.base = Date.now()
    }
  }

  // Load ALL BASE connections for Main Connections list
  const loadExchangeConnectionsActive = async () => {
    if (loadingRef.current.active) return
    if (Date.now() - lastLoadRef.current.active < LOAD_COOLDOWN) return

    loadingRef.current.active = true
    setIsExchangeConnectionsActiveLoading(true)
    try {
      const response = await fetch("/api/settings/connections")
      if (response.ok) {
        const data = await response.json()
        const allConnections = data.connections || []
        
        const BASE_EXCHANGES = ["bybit", "bingx", "pionex", "orangex"]
        const activeConns = allConnections.filter((c: any) => {
          const exchange = (c.exchange || "").toLowerCase().trim()
          const isBase = BASE_EXCHANGES.includes(exchange)
          const isAssigned = c.is_assigned === true || c.is_assigned === "1" || c.is_assigned === "true"
          const isMainEnabled = c.is_main_enabled === true || c.is_main_enabled === "1" || c.is_main_enabled === "true"
          return isBase || isAssigned || isMainEnabled
        })
        
        setExchangeConnectionsActive(activeConns)
        
        const statusMap = new Map<string, boolean>()
        activeConns.forEach((conn: ExchangeConnection) => {
          const isMainEnabled = (conn as any).is_main_enabled === true || (conn as any).is_main_enabled === "1" || (conn as any).is_main_enabled === "true"
          statusMap.set(conn.id, isMainEnabled)
        })
        setExchangeConnectionsActiveStatus(statusMap)
      }
    } catch (error) {
      console.error("[v0] [ConnectionState] Failed to load Main Connections:", error)
    } finally {
      loadingRef.current.active = false
      setIsExchangeConnectionsActiveLoading(false)
      lastLoadRef.current.active = Date.now()
    }
  }

  const setBaseConnectionStatus = (id: string, enabled: boolean) => {
    setBaseConnectionStatuses(prev => {
      const next = new Map(prev)
      const current = next.get(id) || { enabled: false, assigned: false }
      next.set(id, { ...current, enabled })
      return next
    })
  }

  const markBaseAsAssigned = (id: string) => {
    setBaseConnectionStatuses(prev => {
      const next = new Map(prev)
      const current = next.get(id) || { enabled: false, assigned: false }
      next.set(id, { ...current, assigned: true })
      return next
    })
    
    setTimeout(() => {
      setBaseConnectionStatuses(prev => {
        const next = new Map(prev)
        const current = next.get(id) || { enabled: false, assigned: false }
        next.set(id, { ...current, assigned: false })
        return next
      })
    }, 5000)
  }

  const toggleExchangeConnectionsActiveStatus = (id: string) => {
    setExchangeConnectionsActiveStatus(prev => {
      const next = new Map(prev)
      const currentStatus = next.get(id) ?? false
      const newStatus = !currentStatus
      next.set(id, newStatus)
      
      const conn = exchangeConnectionsActive.find(c => c.id === `active-${id}`) || exchangeConnectionsActive.find(c => c.id === id)
      const connName = conn?.name || id
      console.log(`[v0] [ConnectionStateToggle] ${newStatus ? "ENABLED" : "DISABLED"}: ${connName} (${id})`)
      
      return next
    })
  }

  const markExchangeAsAssigned = (id: string) => {
    setExchangeConnectionsAssignedStatus(prev => new Set(prev).add(id))
    
    setTimeout(() => {
      setExchangeConnectionsAssignedStatus(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }, 5000)
  }

  const updateTradeEngineStatus = (connectionId: string, status: TradeEngineStatus) => {
    setTradeEngineStatuses(prev => {
      const next = new Map(prev)
      next.set(connectionId, { ...status, lastUpdated: Date.now() })
      return next
    })
  }

  const getTradeEngineStatus = (connectionId: string): TradeEngineStatus | undefined => {
    return tradeEngineStatuses.get(connectionId)
  }

  const triggerAutoTest = async () => {
    try {
      await fetch("/api/settings/connections/auto-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    } catch {
      // Non-blocking: auto-test is best-effort
    }
  }

  useEffect(() => {
    loadBaseConnections()
    loadExchangeConnectionsActive()
    triggerAutoTest()
    
    const refreshInterval = setInterval(() => {
      loadBaseConnections()
      loadExchangeConnectionsActive()
    }, 30000)
    
    const autoTestInterval = setInterval(triggerAutoTest, 5 * 60 * 1000)
    
    return () => {
      clearInterval(refreshInterval)
      clearInterval(autoTestInterval)
    }
  }, [])

  return (
    <ConnectionStateContext.Provider
      value={{
        baseConnections,
        setBaseConnections,
        loadBaseConnections,
        isBaseLoading,
        baseConnectionStatuses,
        setBaseConnectionStatus,
        markBaseAsAssigned,
        exchangeConnectionsActive,
        setExchangeConnectionsActive,
        loadExchangeConnectionsActive,
        isExchangeConnectionsActiveLoading,
        exchangeConnectionsActiveStatus,
        toggleExchangeConnectionsActiveStatus,
        markExchangeAsAssigned,
        exchangeConnectionsAssignedStatus,
        tradeEngineStatuses,
        updateTradeEngineStatus,
        getTradeEngineStatus,
      }}
    >
      {children}
    </ConnectionStateContext.Provider>
  )
}

export function useConnectionState() {
  const context = useContext(ConnectionStateContext)
  if (!context) {
    throw new Error("useConnectionState must be used within ConnectionStateProvider")
  }
  return context
}
