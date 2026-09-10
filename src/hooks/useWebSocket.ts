import { useEffect, useRef, useState } from 'react'
import { getToken } from '../services/api'
import type { Reading } from '../services/readings'

export interface WebSocketMessage {
  type: 'reading' | 'relay_update'
  meter_id?: string
  meter_code?: string
  reading?: Reading
  relay_state?: string
}

interface UseWebSocketOptions {
  onReading?: (reading: Reading, relayState?: string, meterId?: string) => void
  onRelayUpdate?: (meterCode: string, relayState: string) => void
}

export function useWebSocket({ onReading, onRelayUpdate }: UseWebSocketOptions = {}) {
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const onReadingRef = useRef(onReading)
  const onRelayUpdateRef = useRef(onRelayUpdate)

  onReadingRef.current = onReading
  onRelayUpdateRef.current = onRelayUpdate

  useEffect(() => {
    let unmounted = false
    let reconnectTimeout: number | undefined
    let pingInterval: number | undefined

    function connect() {
      const token = getToken()
      if (!token) {
        setIsConnected(false)
        return
      }

      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'https://theft-backend.vercel.app'
      const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/api/ws?token=${encodeURIComponent(token)}`

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        if (unmounted) {
          ws.close()
          return
        }
        setIsConnected(true)

        // Keep-alive heartbeat ping every 25s
        pingInterval = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping')
          }
        }, 25000)
      }

      ws.onmessage = (event) => {
        if (event.data === 'pong') return
        try {
          const data: WebSocketMessage = JSON.parse(event.data)
          if (data.type === 'reading' && data.reading) {
            onReadingRef.current?.(data.reading, data.relay_state, data.meter_id)
          } else if (data.type === 'relay_update' && data.relay_state && data.meter_code) {
            onRelayUpdateRef.current?.(data.meter_code, data.relay_state)
          }
        } catch {
          // ignore malformed frame
        }
      }

      ws.onclose = () => {
        setIsConnected(false)
        clearInterval(pingInterval)
        if (!unmounted) {
          // Reconnect with 3s backoff
          reconnectTimeout = window.setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      unmounted = true
      clearInterval(pingInterval)
      clearTimeout(reconnectTimeout)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [])

  return { isConnected }
}
