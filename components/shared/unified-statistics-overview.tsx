/**
 * Unified Statistics Overview Component
 * SINGLE IMPLEMENTATION - used by ALL sections:
 * - Dashboard main page
 * - Settings pages
 * - Connection dialogs
 * - Prehistoric views
 * - Indications views
 * - Strategies views
 * 
 * This eliminates duplicate implementations and guarantees consistent unique relation usage
 */

'use client'

import { useEngineRelation } from '@/hooks/use-engine-relation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface UnifiedStatisticsOverviewProps {
  connectionId: string
  showFullDetails?: boolean
  compact?: boolean
}

const PHASE_LABELS: Record<string, string> = {
  idle: "Idle",
  initializing: "Initializing",
  market_data: "Loading Market Data",
  prehistoric_data: "Loading Prehistoric Data",
  indications: "Processing Indications",
  strategies: "Processing Strategies",
  realtime: "Realtime Processing",
  live_trading: "Live Trading Active",
  error: "Error",
  stopped: "Stopped"
}

const PHASE_COLORS: Record<string, string> = {
  idle: "bg-slate-500",
  initializing: "bg-blue-500",
  market_data: "bg-blue-400",
  prehistoric_data: "bg-yellow-500",
  indications: "bg-purple-500",
  strategies: "bg-indigo-500",
  realtime: "bg-cyan-500",
  live_trading: "bg-green-500",
  error: "bg-red-500",
  stopped: "bg-slate-600"
}

export function UnifiedStatisticsOverview({ 
  connectionId, 
  showFullDetails = true,
  compact = false 
}: UnifiedStatisticsOverviewProps) {
  const { relation, isLoading } = useEngineRelation(connectionId, {
    autoRefresh: true,
    refreshInterval: 2000
  })

  if (isLoading || !relation) {
    return (
      <Card className="w-full opacity-60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Loading engine status...</CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={33} className="h-2" />
        </CardContent>
      </Card>
    )
  }

  const phaseLabel = PHASE_LABELS[relation.enginePhase] || relation.enginePhase
  const phaseColor = PHASE_COLORS[relation.enginePhase] || "bg-slate-500"

  if (compact) {
    return (
      <div className="flex items-center gap-3 w-full">
        <div className={`w-2 h-2 rounded-full ${phaseColor} animate-pulse`} />
        <span className="text-sm font-medium">{phaseLabel}</span>
        <Progress value={relation.phaseProgress} className="h-1 flex-1" />
        <span className="text-xs text-muted-foreground">{relation.phaseProgress}%</span>
      </div>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Engine Status</CardTitle>
          <Badge variant="outline" className={relation.isActive ? "bg-green-50 dark:bg-green-950" : ""}>
            {relation.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{phaseLabel}</span>
            <span className="text-muted-foreground">{relation.phaseProgress}%</span>
          </div>
          <Progress value={relation.phaseProgress} className="h-2" />
        </div>

        {showFullDetails && (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="indications">Indications</TabsTrigger>
              <TabsTrigger value="strategies">Strategies</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="space-y-2 pt-2">
              <div className="text-xs text-muted-foreground">
                Tracking ID: <code className="bg-muted px-1 rounded">{relation.trackingId}</code>
              </div>
              <div className="text-xs text-muted-foreground">
                Last updated: {new Date(relation.lastUpdated).toLocaleTimeString()}
              </div>
            </TabsContent>
            <TabsContent value="indications">
              <div className="text-sm text-muted-foreground py-2">
                Indications processor active
              </div>
            </TabsContent>
            <TabsContent value="strategies">
              <div className="text-sm text-muted-foreground py-2">
                Strategies processor active
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  )
}

// Legacy compatibility exports - redirect all old imports here
export const StatisticsOverview = UnifiedStatisticsOverview
export const StatisticsOverviewV2 = UnifiedStatisticsOverview
export default UnifiedStatisticsOverview
