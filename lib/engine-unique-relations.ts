/**
 * Engine Unique Relations Manager
 * Single source of truth for all engine tracking, logging, state relations
 * Used by ALL UI components, dialogs and engine systems
 * Guarantees unique isolated relations per connection id
 */

import { getSettings, setSettings } from "@/lib/redis-db"
import { logProgressionEvent } from "@/lib/engine-progression-logs"

export const ENGINE_RELATIONS_VERSION = "1.0.0-unique"

export interface EngineUniqueRelation {
  connectionId: string
  createdAt: string
  lastUpdated: string
  trackingId: string
  loggingContext: string
  stateKey: string
  logsKey: string
  progressionKey: string
  runningFlagKey: string
  isActive: boolean
  enginePhase: string
  phaseProgress: number
}

const RELATION_CACHE = new Map<string, EngineUniqueRelation>()

/**
 * Creates or retrieves unique relation for a connection
 * This is the ONLY valid way to get engine relation identifiers
 * All systems MUST use this function to get consistent unique keys
 */
export function getUniqueEngineRelation(connectionId: string): EngineUniqueRelation {
  if (!connectionId) {
    throw new Error("connectionId is required for unique engine relations")
  }

  // Return cached if exists and active
  if (RELATION_CACHE.has(connectionId)) {
    const existing = RELATION_CACHE.get(connectionId)!
    existing.lastUpdated = new Date().toISOString()
    return existing
  }

  // Generate unique deterministic identifiers
  const cleanId = connectionId.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase()
  const trackingId = `eng:${cleanId}:${Date.now().toString(36)}`
  
  const relation: EngineUniqueRelation = {
    connectionId,
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    trackingId,
    loggingContext: `[${trackingId}]`,
    stateKey: `trade_engine_state:${connectionId}`,
    logsKey: `engine_logs:${connectionId}`,
    progressionKey: `engine_progression:${connectionId}`,
    runningFlagKey: `engine_is_running:${connectionId}`,
    isActive: false,
    enginePhase: "idle",
    phaseProgress: 0
  }

  RELATION_CACHE.set(connectionId, relation)
  return relation
}

/**
 * Updates relation state - single point for all phase updates
 * Called from engine manager, UI controls, and all processors
 */
export async function updateRelationState(
  connectionId: string,
  updates: Partial<EngineUniqueRelation>
): Promise<void> {
  const relation = getUniqueEngineRelation(connectionId)
  Object.assign(relation, updates, { lastUpdated: new Date().toISOString() })
  
  // Persist minimal state for cross-process consistency
  await setSettings(`engine_relation:${connectionId}`, {
    connectionId,
    trackingId: relation.trackingId,
    enginePhase: relation.enginePhase,
    phaseProgress: relation.phaseProgress,
    isActive: relation.isActive,
    lastUpdated: relation.lastUpdated
  })
}

/**
 * Get all active engine relations
 */
export function getAllActiveRelations(): EngineUniqueRelation[] {
  return Array.from(RELATION_CACHE.values()).filter(r => r.isActive)
}

/**
 * Invalidate and clear relation
 */
export function invalidateRelation(connectionId: string): void {
  RELATION_CACHE.delete(connectionId)
}

/**
 * Standard log prefix that ALL systems MUST use for correlated logging
 */
export function getLogPrefix(connectionId: string): string {
  return getUniqueEngineRelation(connectionId).loggingContext
}

// Export standardized key getters for consistency across entire codebase
export const getEngineStateKey = (connectionId: string) => getUniqueEngineRelation(connectionId).stateKey
export const getEngineLogsKey = (connectionId: string) => getUniqueEngineRelation(connectionId).logsKey
export const getEngineProgressionKey = (connectionId: string) => getUniqueEngineRelation(connectionId).progressionKey
export const getEngineRunningFlagKey = (connectionId: string) => getUniqueEngineRelation(connectionId).runningFlagKey

/**
 * Validate that all keys match the unique relation standard
 * Used for migration checks
 */
export function validateRelationKeys(connectionId: string): boolean {
  const relation = getUniqueEngineRelation(connectionId)
  return (
    relation.stateKey === `trade_engine_state:${connectionId}` &&
    relation.logsKey === `engine_logs:${connectionId}` &&
    relation.progressionKey === `engine_progression:${connectionId}` &&
    relation.runningFlagKey === `engine_is_running:${connectionId}`
  )
}

// Global event name for UI state synchronization - used by ALL components
export const ENGINE_RELATION_UPDATED_EVENT = "engine-relation-updated"

/**
 * Dispatch cross-component update event
 * All dialogs, dashboard sections, settings pages listen to this event
 */
export function dispatchRelationUpdate(connectionId: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ENGINE_RELATION_UPDATED_EVENT, {
      detail: { connectionId }
    }))
  }
}
