"use client"

import { useState, useEffect } from "react"
import { ExchangeStatistics } from "@/components/dashboard/exchange-statistics"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function ActiveExchangePage() {
  const [activeConnections, setActiveConnections] = useState<any[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadConnections = async () => {
      try {
        setLoading(true)
        const res = await fetch("/api/settings/connections")
        if (!res.ok) throw new Error("Failed to fetch connections")
        const data = await res.json()
        
        // Filter to only dashboard-active connections
        const active = (data.connections || []).filter(
          (c: any) => c.is_main_enabled === true || c.is_main_enabled === "1" || c.is_main_enabled === "true"
        )
        
        setActiveConnections(active)
        if (active.length > 0 && !selectedConnectionId) {
          setSelectedConnectionId(active[0].id)
        }
      } catch (err) {
        console.error("Failed to load connections:", err)
      } finally {
        setLoading(false)
      }
    }

    loadConnections()
  }, [])

  const selectedConnection = activeConnections.find((c) => c.id === selectedConnectionId)

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Active Exchange Statistics</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">Loading active connections...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (activeConnections.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Active Exchange Statistics</h1>
        </div>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No active connections found. Please enable at least one connection on the dashboard to view its statistics.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Active Exchange Statistics</h1>
        <p className="text-muted-foreground mt-1">
          View detailed prehistoric analysis, market data, and trading metrics for selected active connection
        </p>
      </div>

      {/* Connection Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Select Active Connection</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedConnectionId} onValueChange={setSelectedConnectionId}>
            <SelectTrigger className="w-full md:w-72">
              <SelectValue placeholder="Select a connection..." />
            </SelectTrigger>
            <SelectContent>
              {activeConnections.map((conn) => (
                <SelectItem key={conn.id} value={conn.id}>
                  <div className="flex items-center gap-2">
                    <span>{conn.name || conn.exchange}</span>
                    <Badge variant="outline" className="text-xs">
                      {conn.exchange}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-2">
            {activeConnections.length} active connection{activeConnections.length !== 1 ? "s" : ""} available
          </p>
        </CardContent>
      </Card>

      {/* Statistics Component */}
      {selectedConnection && (
        <ExchangeStatistics
          key={selectedConnection.id}
          connectionId={selectedConnection.id}
          connectionName={selectedConnection.name || selectedConnection.exchange}
        />
      )}
    </div>
  )
}
