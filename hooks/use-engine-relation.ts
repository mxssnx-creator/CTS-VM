/**
 * useEngineRelation - Universal React Hook
 * ALL UI components, dialogs, pages MUST use this hook for engine state
 * Single source of truth - eliminates duplicate state fetching
 * Guarantees consistent unique relation references across entire UI
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { ENGINE_RELATION_UPDATED_EVENT, EngineUniqueRelation, getUniqueEngineRelation } from '@/lib/engine-unique-relations'

interface UseEngineRelationOptions {
  autoRefresh?: boolean
  refreshInterval?: number
}

/**
 * Universal engine relation hook - used by ALL UI components
 * @param connectionId Target connection id - must be provided
 * @param options Configuration options
 * 
 * Usage:
 *   const { relation, isLoading, refresh } = useEngineRelation(connectionId)
 * 
 * Used in:
 * - Dashboard main page sections
 * - All dialogs (connection, logs, settings)
 * - Prehistoric data views
 * - Indications components
 * - Strategies components
 * - All settings pages
 */
export function useEngineRelation(
  connectionId: string | null | undefined,
  options: UseEngineRelationOptions = {}
) {
  const { autoRefresh = false, refreshInterval = 2000 } = options
  
  const [relation, setRelation] = useState<EngineUniqueRelation | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(() => {
    if (!connectionId) {
      setRelation(null)
      setIsLoading(false)
      return
    }

    try {
      const engineRelation = getUniqueEngineRelation(connectionId)
      setRelation(engineRelation)
      setIsLoading(false)
    } catch (error) {
      console.error('[useEngineRelation] Failed to get relation:', error)
      setRelation(null)
      setIsLoading(false)
    }
  }, [connectionId])

  // Handle global relation update events
  useEffect(() => {
    if (!connectionId) return

    const handleRelationUpdate = (event: CustomEvent) => {
      if (event.detail?.connectionId === connectionId) {
        refresh()
      }
    }

    window.addEventListener(
      ENGINE_RELATION_UPDATED_EVENT,
      handleRelationUpdate as EventListener
    )

    return () => {
      window.removeEventListener(
        ENGINE_RELATION_UPDATED_EVENT,
        handleRelationUpdate as EventListener
      )
    }
  }, [connectionId, refresh])

  // Initial load
  useEffect(() => {
    refresh()
  }, [refresh])

  // Auto refresh timer
  useEffect(() => {
    if (!connectionId || !autoRefresh) {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
      return
    }

    refreshTimerRef.current = setInterval(refresh, refreshInterval)

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [connectionId, autoRefresh, refreshInterval, refresh])

  return {
    relation,
    isLoading,
    refresh,
    connectionId: connectionId || null,
    isValid: relation !== null
  }
}

/**
 * Hook for multiple connections - used in dashboard overview
 */
export function useAllEngineRelations() {
  const [relations, setRelations] = useState<EngineUniqueRelation[]>([])
  
  const refresh = useCallback(() => {
    // Will be populated from API in actual implementation
    setRelations([])
  }, [])

  useEffect(() => {
    const handleUpdate = () => refresh()
    window.addEventListener(ENGINE_RELATION_UPDATED_EVENT, handleUpdate)
    return () => window.removeEventListener(ENGINE_RELATION_UPDATED_EVENT, handleUpdate)
  }, [refresh])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { relations, refresh }
}
