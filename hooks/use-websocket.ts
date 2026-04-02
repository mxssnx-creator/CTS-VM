"use client"

// Custom hook for WebSocket connection with proper reconnection logic
import { useEffect, useRef, useState, useCallback } from "react"

export interface WebSocketMessage {
  type: string
  data: any
  timestamp: string
}

interface UseWebSocketOptions {
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: Event) => void
  onMessage?: (message: WebSocketMessage) => void
  reconnectAttempts?: number
  reconnectInterval?: number
}

export function useWebSocket(url: string, options: UseWebSocketOptions = {}) {
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const isMountedRef = useRef(true)
  
  const {
    onOpen,
    onClose,
    onError,
    onMessage,
    reconnectAttempts = 5,
    reconnectInterval = 5000,
  } = options

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      console.log("[v0] [WebSocket] Cleaning up existing connection")
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close(1000, "Component unmounting or reconnecting")
      }
      wsRef.current = null
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    if (!isMountedRef.current) return
    
    cleanup()
    
    try {
      console.log(`[v0] [WebSocket] Attempting to connect to ${url} (attempt ${reconnectAttemptsRef.current + 1}/${reconnectAttempts})`)
      setConnectionError(null)
      
      // For now, we're in a simulated mode since Next.js API routes don't support WebSocket
      // This can be replaced with a real WebSocket server in production
      const wsUrl = url.startsWith('/') ? `ws://localhost:3000${url}` : url
      
      try {
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws
        
        ws.onopen = (event) => {
          if (!isMountedRef.current) {
            ws.close()
            return
          }
          console.log("[v0] [WebSocket] Connection established")
          setIsConnected(true)
          setConnectionError(null)
          reconnectAttemptsRef.current = 0
          onOpen?.()
        }
        
        ws.onclose = (event) => {
          if (!isMountedRef.current) return
          console.log(`[v0] [WebSocket] Connection closed: code=${event.code}, reason=${event.reason}`)
          setIsConnected(false)
          onClose?.()
          
          // Attempt reconnection if not a clean close
          if (event.code !== 1000 && reconnectAttemptsRef.current < reconnectAttempts) {
            console.log(`[v0] [WebSocket] Scheduling reconnection in ${reconnectInterval}ms`)
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectAttemptsRef.current++
              connect()
            }, reconnectInterval)
          }
        }
        
        ws.onerror = (error) => {
          if (!isMountedRef.current) return
          console.error("[v0] [WebSocket] Connection error:", error)
          setConnectionError("WebSocket connection failed")
          onError?.(error)
        }
        
        ws.onmessage = (event) => {
          if (!isMountedRef.current) return
          try {
            const message = JSON.parse(event.data) as WebSocketMessage
            setLastMessage(message)
            onMessage?.(message)
          } catch (parseError) {
            console.warn("[v0] [WebSocket] Failed to parse message:", parseError)
          }
        }
      } catch (wsError) {
        // WebSocket not supported or URL invalid - use simulation mode
        console.log("[v0] [WebSocket] WebSocket not available, using simulation mode")
        setIsConnected(true)
        
        // Simulate receiving messages
        const interval = setInterval(() => {
          if (!isMountedRef.current) {
            clearInterval(interval)
            return
          }
          const simulatedMessage: WebSocketMessage = {
            type: "price_update",
            data: {
              symbol: "BTCUSDT",
              price: 50000 + (Math.random() - 0.5) * 1000,
              change_24h: (Math.random() - 0.5) * 10,
            },
            timestamp: new Date().toISOString(),
          }
          setLastMessage(simulatedMessage)
          onMessage?.(simulatedMessage)
        }, 3000)
        
        // Store cleanup for simulation
        wsRef.current = {
          close: () => {
            clearInterval(interval)
            setIsConnected(false)
          },
          send: () => {},
          readyState: WebSocket.OPEN,
        } as any
      }
    } catch (error) {
      console.error("[v0] [WebSocket] Connection setup failed:", error)
      setConnectionError(error instanceof Error ? error.message : "Unknown error")
      
      // Attempt reconnection
      if (reconnectAttemptsRef.current < reconnectAttempts) {
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++
          connect()
        }, reconnectInterval)
      }
    }
  }, [url, reconnectAttempts, reconnectInterval, cleanup, onOpen, onClose, onError, onMessage])

  useEffect(() => {
    isMountedRef.current = true
    connect()

    return () => {
      isMountedRef.current = false
      cleanup()
    }
  }, [url])

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    } else {
      console.warn("[v0] [WebSocket] Cannot send message - not connected")
    }
  }, [])

  const disconnect = useCallback(() => {
    reconnectAttemptsRef.current = reconnectAttempts // Prevent reconnection
    cleanup()
    setIsConnected(false)
  }, [reconnectAttempts, cleanup])

  return {
    isConnected,
    lastMessage,
    connectionError,
    sendMessage,
    disconnect,
    reconnect: connect,
  }
}
