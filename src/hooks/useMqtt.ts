import { useEffect, useRef, useState } from 'react'
import Paho from 'paho-mqtt'
import type { Reading } from '../services/readings'

export interface UseMqttOptions {
  meterCode?: string
  onReading?: (reading: Reading, meterCode: string) => void
  onRelayUpdate?: (meterCode: string, relayState: string) => void
  enabled?: boolean
}

export function useMqtt({
  meterCode,
  onReading,
  onRelayUpdate,
  enabled = true,
}: UseMqttOptions = {}) {
  const [isConnected, setIsConnected] = useState(false)
  const clientRef = useRef<Paho.Client | null>(null)
  const onReadingRef = useRef(onReading)
  const onRelayUpdateRef = useRef(onRelayUpdate)

  onReadingRef.current = onReading
  onRelayUpdateRef.current = onRelayUpdate

  useEffect(() => {
    if (!enabled) return

    let isUnmounted = false
    let reconnectTimer: number | undefined

    const host =
      import.meta.env.VITE_MQTT_BROKER ||
      '30855871514d47bb8a01912f2f20e51f.s1.eu.hivemq.cloud'
    const port = Number(import.meta.env.VITE_MQTT_PORT || 8884)
    const path = import.meta.env.VITE_MQTT_PATH || '/mqtt'
    const username = import.meta.env.VITE_MQTT_USERNAME || 'theft'
    const password = import.meta.env.VITE_MQTT_PASSWORD || 'Test@12345'

    const clientId = `gridwatch-web-${Math.random().toString(16).substring(2, 10)}`
    const client = new Paho.Client(host, port, path, clientId)
    clientRef.current = client

    function connect() {
      if (isUnmounted) return

      client.connect({
        useSSL: true,
        userName: username,
        password: password,
        timeout: 10,
        keepAliveInterval: 30,
        cleanSession: true,
        onSuccess: () => {
          if (isUnmounted) {
            try {
              client.disconnect()
            } catch {}
            return
          }
          setIsConnected(true)

          // Subscribe to readings topic
          const readingTopic = meterCode
            ? `meters/${meterCode}/readings`
            : 'meters/+/readings'
          client.subscribe(readingTopic, { qos: 1 })

          // Subscribe to relay topic
          const relayTopic = meterCode
            ? `meters/${meterCode}/relay`
            : 'meters/+/relay'
          client.subscribe(relayTopic, { qos: 1 })
        },
        onFailure: (err) => {
          if (isUnmounted) return
          setIsConnected(false)
          console.warn('[MQTT Direct] Connection failed:', err.errorMessage)
          reconnectTimer = window.setTimeout(connect, 4000)
        },
      })
    }

    client.onConnectionLost = (response) => {
      setIsConnected(false)
      if (response.errorCode !== 0 && !isUnmounted) {
        console.warn('[MQTT Direct] Connection lost:', response.errorMessage)
        reconnectTimer = window.setTimeout(connect, 3000)
      }
    }

    client.onMessageArrived = (message) => {
      const topic = message.destinationName
      try {
        const data = JSON.parse(message.payloadString)

        if (topic.endsWith('/readings')) {
          const incomingMeterCode =
            data.meter_id || topic.split('/')[1] || meterCode || ''

          let voltage = Number(data.voltage) || 0
          let current = Number(data.current) || 0
          let sourceCurrent = Number(
            data.source_current !== undefined ? data.source_current : current,
          )
          let deltaCurrent = Number(
            data.delta_current !== undefined
              ? data.delta_current
              : Math.max(0, sourceCurrent - current),
          )
          let theftDetected = Boolean(data.theft_detected)

          // Filter noise floor
          if (voltage < 30.0) {
            voltage = 0.0
            current = 0.0
            sourceCurrent = 0.0
            deltaCurrent = 0.0
            theftDetected = false
          } else {
            if (current < 0.02) current = 0.0
            if (sourceCurrent < 0.02) sourceCurrent = 0.0
            deltaCurrent = Math.max(0, sourceCurrent - current)
            if (deltaCurrent >= 0.03) {
              theftDetected = true
            }
          }

          const power = Math.round(voltage * current * 10) / 10

          const reading: Reading = {
            id: `mqtt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            meter_id: incomingMeterCode,
            voltage: Math.round(voltage * 10) / 10,
            current: Math.round(current * 1000) / 1000,
            source_current: Math.round(sourceCurrent * 1000) / 1000,
            delta_current: Math.round(deltaCurrent * 1000) / 1000,
            theft_detected: theftDetected,
            power,
            recorded_at: data.timestamp || new Date().toISOString(),
            created_at: new Date().toISOString(),
            frequency: null,
            power_factor: null,
          }

          onReadingRef.current?.(reading, incomingMeterCode)
        } else if (topic.endsWith('/relay')) {
          const incomingMeterCode =
            data.meter_id || topic.split('/')[1] || meterCode || ''
          const relayState = data.command || data.relay_state
          if (relayState) {
            onRelayUpdateRef.current?.(incomingMeterCode, relayState)
          }
        }
      } catch (err) {
        console.error('[MQTT Direct] Error processing message:', err)
      }
    }

    connect()

    return () => {
      isUnmounted = true
      clearTimeout(reconnectTimer)
      if (clientRef.current?.isConnected()) {
        try {
          clientRef.current.disconnect()
        } catch {}
      }
      clientRef.current = null
    }
  }, [meterCode, enabled])

  function publishRelayCommand(targetMeterCode: string, command: 'connected' | 'disconnected') {
    if (!clientRef.current?.isConnected()) {
      return false
    }
    const topic = `meters/${targetMeterCode}/relay`
    const payload = JSON.stringify({ meter_id: targetMeterCode, command })
    const message = new Paho.Message(payload)
    message.destinationName = topic
    message.qos = 1
    clientRef.current.send(message)
    return true
  }

  return {
    isConnected,
    publishRelayCommand,
  }
}
