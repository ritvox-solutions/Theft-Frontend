import { useEffect, useRef, useState } from 'react'
import UsageChart from '../components/UsageChart'
import { useMeter } from '../context/MeterContext'
import { useMqtt } from '../hooks/useMqtt'
import { useWebSocket } from '../hooks/useWebSocket'
import type { CurrentCycleEstimate } from '../services/billing'
import { getCurrentEstimate } from '../services/billing'
import { getReadings } from '../services/readings'
import type { Reading } from '../services/readings'

const RECENT_READINGS_LIMIT = 30

function formatAgo(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return 'never'
  if (seconds <= 1) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

interface MinimalCardProps {
  label: string
  value: string
  unit: string
}

function MinimalCard({ label, value, unit }: MinimalCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-mono text-2xl font-semibold tracking-tight text-slate-900">
          {value}
        </span>
        {unit && <span className="text-xs font-medium text-slate-400">{unit}</span>}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { meter, isLoading: isMeterLoading, refreshMeter } = useMeter()
  const [readings, setReadings] = useState<Reading[]>([])
  const [estimate, setEstimate] = useState<CurrentCycleEstimate | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [lastPacketTime, setLastPacketTime] = useState<number | null>(null)

  useEffect(() => {
    // 1-second continuous ticking timer
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const refreshMeterRef = useRef(refreshMeter)
  refreshMeterRef.current = refreshMeter

  // 1. Direct MQTT telemetry listener from broker
  const { isConnected: isMqttConnected } = useMqtt({
    meterCode: meter?.meter_code,
    enabled: Boolean(meter?.meter_code),
    onReading: (incomingReading, incomingMeterCode) => {
      if (incomingMeterCode && incomingMeterCode !== meter?.meter_code) return
      setLastPacketTime(Date.now())
      setReadings((prev) => {
        if (prev.some((r) => r.recorded_at === incomingReading.recorded_at)) {
          return prev
        }
        return [incomingReading, ...prev.slice(0, RECENT_READINGS_LIMIT - 1)]
      })
    },
    onRelayUpdate: (incomingMeterCode, relayState) => {
      if (meter?.meter_code === incomingMeterCode && relayState !== meter.relay_state) {
        refreshMeterRef.current()
      }
    },
  })

  // 2. WebSocket stream fallback
  const { isConnected: isWsConnected } = useWebSocket({
    onReading: (incomingReading, relayState, incomingMeterId) => {
      if (!meter || (incomingMeterId && incomingMeterId !== meter.id)) return
      setLastPacketTime(Date.now())
      setReadings((prev) => {
        if (prev.some((r) => r.id === incomingReading.id || r.recorded_at === incomingReading.recorded_at)) {
          return prev
        }
        return [incomingReading, ...prev.slice(0, RECENT_READINGS_LIMIT - 1)]
      })
      if (relayState && relayState !== meter.relay_state) {
        refreshMeterRef.current()
      }
    },
    onRelayUpdate: (meterCode) => {
      if (meter?.meter_code === meterCode) {
        refreshMeterRef.current()
      }
    },
  })

  // 3. Database is loaded for initial history, keeping DB only for history
  useEffect(() => {
    if (!meter?.id) return
    const meterId = meter.id
    let cancelled = false

    async function loadHistory() {
      try {
        const [readingsData, estimateData] = await Promise.all([
          getReadings(meterId, { limit: RECENT_READINGS_LIMIT }),
          getCurrentEstimate(meterId).catch(() => null),
        ])
        if (!cancelled) {
          if (readingsData.length > 0) {
            const recordedEpoch = new Date(readingsData[0].recorded_at).getTime()
            if (Date.now() - recordedEpoch < 8000) {
              setLastPacketTime(recordedEpoch)
            }
          }
          setReadings((prev) => {
            // Keep recent direct MQTT readings if any arrived before DB load
            if (prev.length > 0 && prev[0].id.startsWith('mqtt-')) {
              const liveTimestamps = new Set(prev.map((r) => r.recorded_at))
              const older = readingsData.filter((r) => !liveTimestamps.has(r.recorded_at))
              return [...prev, ...older].slice(0, RECENT_READINGS_LIMIT)
            }
            return readingsData
          })
          if (estimateData) setEstimate(estimateData)
        }
        await refreshMeterRef.current()
      } catch {
        // best effort load
      }
    }

    loadHistory()

    // Periodically update bill estimate only (every 30s) — never overwrite live readings
    const estimateInterval = setInterval(async () => {
      try {
        const estimateData = await getCurrentEstimate(meterId)
        if (!cancelled && estimateData) setEstimate(estimateData)
      } catch {}
    }, 30000)

    return () => {
      cancelled = true
      clearInterval(estimateInterval)
    }
  }, [meter?.id])

  if (isMeterLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-xs text-slate-400 font-mono">
        Loading…
      </div>
    )
  }

  if (!meter) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 p-10 text-center">
        <p className="text-sm font-medium text-slate-700">No meter assigned</p>
      </div>
    )
  }

  const latestReading = readings[0]
  const currentVoltage = latestReading?.voltage

  // Continuous live packet age tracking:
  const secondsSincePacket = lastPacketTime
    ? Math.max(0, Math.floor((now - lastPacketTime) / 1000))
    : latestReading
    ? Math.max(0, Math.floor((now - new Date(latestReading.recorded_at).getTime()) / 1000))
    : Infinity

  // Mark offline if no packet received within 6s (ESP32 transmits every 2s)
  const isDeviceActive = secondsSincePacket < 6

  const isVoltageZero = !isDeviceActive || currentVoltage === undefined || currentVoltage <= 0
  const currentCurrent = isVoltageZero ? 0 : (latestReading?.current ?? 0)
  const currentSourceCurrent = isVoltageZero ? 0 : (latestReading?.source_current ?? currentCurrent)
  const currentDeltaCurrent = isVoltageZero ? 0 : (latestReading?.delta_current ?? Math.max(0, currentSourceCurrent - currentCurrent))
  // Suppress sensor noise false alarms: require deltaCurrent >= 0.065A (65mA) AND confirmation
  const isTheftDetected = isDeviceActive && !isVoltageZero && currentDeltaCurrent >= 0.065 && Boolean(latestReading?.theft_detected || currentDeltaCurrent >= 0.080)
  const currentPower = isVoltageZero ? 0 : (latestReading?.power ?? 0)

  const isRelayConnected = meter.relay_state === 'connected'

  return (
    <div className="space-y-5">
      {/* Offline Alert Banner */}
      {!isDeviceActive && meter && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-4 py-2.5 text-xs text-amber-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Hardware is currently offline or disconnected. Waiting for telemetry...</span>
          </div>
          <span className="font-mono text-amber-800 font-semibold">
            {latestReading
              ? `Last packet: ${new Date(latestReading.recorded_at).toLocaleTimeString()} (${formatAgo(secondsSincePacket)})`
              : 'No packets'}
          </span>
        </div>
      )}

      {/* Real-time Theft Alert Banner */}
      {isTheftDetected && (
        <div className="rounded-xl border-2 border-rose-500 bg-rose-50/95 p-4.5 shadow-md animate-pulse">
          <div className="flex items-start gap-3.5">
            <div className="rounded-lg bg-rose-600 p-2.5 text-white shadow-sm">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-rose-950 text-sm tracking-wide">
                  🚨 HARDWARE ELECTRICITY THEFT DETECTED
                </span>
                <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                  Critical Line Tap
                </span>
              </div>
              <p className="mt-1 text-xs text-rose-800 font-medium">
                Physical line tap/bypass active! Incoming current from pole exceeds junction box metered load.
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-4 rounded-lg bg-rose-100/80 px-3 py-2 text-xs font-mono text-rose-950">
                <span>Incoming Line (I₁): <strong className="text-rose-900">{currentSourceCurrent !== undefined ? currentSourceCurrent.toFixed(3) : '—'} A</strong></span>
                <span>•</span>
                <span>Junction Box (I₂): <strong className="text-slate-800">{currentCurrent !== undefined ? currentCurrent.toFixed(3) : '—'} A</strong></span>
                <span>•</span>
                <span>Bypass Loss (ΔI): <strong className="text-rose-600 font-bold">+{currentDeltaCurrent.toFixed(3)} A</strong></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold text-slate-900">Dashboard</h1>
          {isDeviceActive ? (
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 border border-emerald-200">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[11px] font-semibold text-emerald-700">
                {isMqttConnected ? 'Live • Realtime' : isWsConnected ? 'Live • WebSocket' : 'Live'}
              </span>
              {latestReading && (
                <span className="text-[11px] font-mono text-slate-600 border-l border-emerald-200 pl-1.5 ml-0.5">
                  {new Date(latestReading.recorded_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                  <span className="text-emerald-600 font-semibold ml-1.5">
                    ({formatAgo(secondsSincePacket)})
                  </span>
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 border border-amber-200">
              <span className="h-2 w-2 rounded-full bg-amber-500"></span>
              <span className="text-[11px] font-semibold text-amber-700">
                Device Offline
              </span>
              {latestReading ? (
                <span className="text-[11px] font-mono text-slate-500 border-l border-amber-200 pl-1.5 ml-0.5">
                  Last seen {new Date(latestReading.recorded_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                  <span className="text-amber-700 font-semibold ml-1.5">
                    ({formatAgo(secondsSincePacket)})
                  </span>
                </span>
              ) : (
                <span className="text-[11px] font-mono text-slate-400 border-l border-amber-200 pl-1.5 ml-0.5">
                  No packets received
                </span>
              )}
            </div>
          )}
        </div>
        <div
          className={`inline-flex items-center rounded border px-2.5 py-1 text-xs font-medium ${
            isRelayConnected
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {isRelayConnected ? 'Relay: Connected' : 'Relay: Disconnected'}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <MinimalCard
          label="Voltage"
          value={currentVoltage !== undefined ? currentVoltage.toFixed(1) : '—'}
          unit="V"
        />
        <MinimalCard
          label="Source Current (I₁)"
          value={currentSourceCurrent !== undefined ? currentSourceCurrent.toFixed(3) : '—'}
          unit="A"
        />
        <MinimalCard
          label="Meter Current (I₂)"
          value={currentCurrent !== undefined ? currentCurrent.toFixed(3) : '—'}
          unit="A"
        />
        <MinimalCard
          label="Power"
          value={currentPower !== undefined ? currentPower.toFixed(1) : '—'}
          unit="W"
        />
        <MinimalCard
          label="Energy"
          value={estimate ? estimate.units_consumed_kwh.toFixed(3) : '0.000'}
          unit="kWh"
        />
        <MinimalCard
          label="Estimated Bill"
          value={estimate ? `₹${estimate.estimated_amount.toFixed(2)}` : '₹50.00'}
          unit=""
        />
      </div>

      {/* Usage Trend Section */}
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-xs font-semibold text-slate-800 uppercase tracking-wider">
          Power Usage (W)
        </h2>
        <UsageChart readings={readings} />
      </div>
    </div>
  )
}
