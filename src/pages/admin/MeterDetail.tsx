import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import StatusBadge, { anomalyStatusVariant } from '../../components/StatusBadge'
import UsageChart from '../../components/UsageChart'
import { useToast } from '../../context/ToastContext'
import type { Anomaly } from '../../services/anomalies'
import { getAnomalies } from '../../services/anomalies'
import { useMqtt } from '../../hooks/useMqtt'
import { useWebSocket } from '../../hooks/useWebSocket'
import { getMeter, setRelayState } from '../../services/meters-admin'
import type { Meter, Reading } from '../../services/readings'
import { getReadings } from '../../services/readings'

const POLL_INTERVAL_MS = 8000

export default function MeterDetail() {
  const { meterId } = useParams<{ meterId: string }>()
  const { showToast } = useToast()
  const [meter, setMeter] = useState<Meter | null>(null)
  const [readings, setReadings] = useState<Reading[]>([])
  const [alerts, setAlerts] = useState<Anomaly[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [relayBusy, setRelayBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 2000)
    return () => clearInterval(timer)
  }, [])

  // 1. Direct MQTT telemetry listener from broker
  const { isConnected: isMqttConnected, publishRelayCommand } = useMqtt({
    meterCode: meter?.meter_code,
    enabled: Boolean(meter?.meter_code),
    onReading: (incomingReading, incomingMeterCode) => {
      if (incomingMeterCode && meter?.meter_code && incomingMeterCode !== meter.meter_code) return
      setReadings((prev) => {
        if (prev.some((r) => r.recorded_at === incomingReading.recorded_at)) {
          return prev
        }
        return [incomingReading, ...prev.slice(0, 49)]
      })
    },
    onRelayUpdate: (incomingMeterCode, relayState) => {
      if (meter?.meter_code === incomingMeterCode) {
        setMeter((prev) => (prev ? { ...prev, relay_state: relayState as any } : null))
      }
    },
  })

  // 2. Real-time WebSocket streaming fallback
  const { isConnected: isWsConnected } = useWebSocket({
    onReading: (incomingReading, relayState, incomingMeterId) => {
      if (incomingMeterId && incomingMeterId !== meterId) return
      setReadings((prev) => {
        if (prev.some((r) => r.id === incomingReading.id || r.recorded_at === incomingReading.recorded_at)) {
          return prev
        }
        return [incomingReading, ...prev.slice(0, 49)]
      })
      if (relayState) {
        setMeter((prev) => prev ? { ...prev, relay_state: relayState as any } : null)
      }
    },
    onRelayUpdate: (meterCode, relayState) => {
      if (meter?.meter_code === meterCode) {
        setMeter((prev) => prev ? { ...prev, relay_state: relayState as any } : null)
      }
    },
  })

  async function toggleRelay() {
    if (!meter) return
    const next = meter.relay_state === 'connected' ? 'disconnected' : 'connected'
    if (next === 'disconnected' && !window.confirm(`Cut power to ${meter.meter_code}? The meter keeps recording; only the load is disconnected.`)) {
      return
    }
    setRelayBusy(true)
    try {
      publishRelayCommand(meter.meter_code, next)
      const updated = await setRelayState(meter.id, next)
      setMeter(updated)
      showToast(`${meter.meter_code} load ${next}`, 'success')
    } catch {
      showToast('Failed to change relay state', 'error')
    } finally {
      setRelayBusy(false)
    }
  }

  useEffect(() => {
    if (!meterId) return
    let cancelled = false

    async function initialLoad() {
      try {
        const [m, meterReadings, allAlerts] = await Promise.all([
          getMeter(meterId!),
          getReadings(meterId!, { limit: 50 }),
          getAnomalies(),
        ])
        if (cancelled) return
        setMeter(m)
        setReadings((prev) => {
          if (prev.length > 0 && prev[0].id.startsWith('mqtt-')) {
            const liveTimestamps = new Set(prev.map((r) => r.recorded_at))
            const older = meterReadings.filter((r) => !liveTimestamps.has(r.recorded_at))
            return [...prev, ...older].slice(0, 50)
          }
          return meterReadings
        })
        setAlerts(allAlerts.filter((a) => a.meter_id === meterId))
        setIsLoading(false)
      } catch {
        if (!cancelled) setIsLoading(false)
      }
    }

    async function poll() {
      try {
        const [m, allAlerts] = await Promise.all([
          getMeter(meterId!),
          getAnomalies(),
        ])
        if (cancelled) return
        setMeter((prev) => {
          if (!prev) return m
          if (prev.relay_state === m.relay_state && prev.status === m.status) return prev
          return m
        })
        setAlerts(allAlerts.filter((a) => a.meter_id === meterId))
      } catch {
        // best effort polling
      }
    }

    initialLoad()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [meterId])

  if (isLoading) {
    return <p className="text-slate-500">Loading meter…</p>
  }

  if (!meter) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
        Meter not found.
      </div>
    )
  }

  const latestReading = readings[0]
  const currentVoltage = latestReading?.voltage
  const readingAgeMs = latestReading ? now - new Date(latestReading.recorded_at).getTime() : Infinity
  const isDeviceActive = readingAgeMs < 20000

  const isVoltageZero = !isDeviceActive || currentVoltage === undefined || currentVoltage <= 0
  const currentCurrent = isVoltageZero ? 0 : (latestReading?.current ?? 0)
  const currentSourceCurrent = isVoltageZero ? 0 : (latestReading?.source_current ?? currentCurrent)
  const currentDeltaCurrent = isVoltageZero ? 0 : (latestReading?.delta_current ?? Math.max(0, currentSourceCurrent - currentCurrent))
  const isTheftDetected = isDeviceActive && !isVoltageZero && Boolean(latestReading?.theft_detected || currentDeltaCurrent >= 0.030)

  return (
    <div className="space-y-6">
      {/* Offline Alert Banner */}
      {!isDeviceActive && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-4 py-2.5 text-xs text-amber-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Meter is currently offline or disconnected from HiveMQ. Waiting for telemetry...</span>
          </div>
          <span className="font-mono text-amber-700">
            {latestReading ? `Last packet: ${new Date(latestReading.recorded_at).toLocaleTimeString()}` : 'No packets'}
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
                  🚨 ACTIVE LINE TAP / HARDWARE THEFT DETECTED
                </span>
                <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                  Critical Line Tap
                </span>
              </div>
              <p className="mt-1 text-xs text-rose-800 font-medium">
                Incoming current from service drop exceeds junction box current! Line bypass detected.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-4 rounded-lg bg-rose-100/80 px-3 py-2 text-xs font-mono text-rose-950">
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

      <div>
        <Link to="/admin/meters" className="text-sm text-primary hover:underline">
          ← Back to Meters
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-slate-900">{meter.meter_code}</h1>
            <StatusBadge
              variant={meter.status === 'active' ? 'normal' : 'flagged'}
              label={meter.status === 'active' ? 'Active' : 'Inactive'}
            />
            {isDeviceActive ? (
              <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 border border-emerald-200">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[11px] font-medium text-emerald-700">
                  {isMqttConnected ? 'Live • MQTT Direct' : isWsConnected ? 'Live • WebSocket' : 'Live'}
                </span>
                {latestReading && (
                  <span className="text-[11px] font-mono text-slate-500 border-l border-emerald-200 pl-1.5 ml-0.5">
                    {new Date(latestReading.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 border border-amber-200">
                <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                <span className="text-[11px] font-medium text-amber-700">
                  Device Offline
                </span>
                {latestReading && (
                  <span className="text-[11px] font-mono text-slate-500 border-l border-amber-200 pl-1.5 ml-0.5">
                    Last seen {new Date(latestReading.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        {meter.location_label && <p className="text-sm text-slate-500 mt-1">{meter.location_label}</p>}
      </div>

      {/* Real-time Telemetry Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-lg border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Voltage</div>
          <div className="mt-1 text-lg font-bold text-slate-900">
            {currentVoltage !== undefined ? currentVoltage.toFixed(1) : '—'} <span className="text-xs font-normal text-slate-500">V</span>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Incoming Line (I₁)</div>
          <div className="mt-1 text-lg font-bold text-slate-900">
            {currentSourceCurrent !== undefined ? currentSourceCurrent.toFixed(3) : '—'} <span className="text-xs font-normal text-slate-500">A</span>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Metered Load (I₂)</div>
          <div className="mt-1 text-lg font-bold text-slate-900">
            {currentCurrent !== undefined ? currentCurrent.toFixed(3) : '—'} <span className="text-xs font-normal text-slate-500">A</span>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Delta (ΔI)</div>
          <div className={`mt-1 text-lg font-bold ${currentDeltaCurrent >= 0.030 ? 'text-rose-600' : 'text-slate-900'}`}>
            {currentDeltaCurrent > 0 ? `+${currentDeltaCurrent.toFixed(3)}` : '0.000'} <span className="text-xs font-normal text-slate-500">A</span>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3.5">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Power</div>
          <div className="mt-1 text-lg font-bold text-slate-900">
            {latestReading?.power !== undefined ? latestReading.power.toFixed(1) : '—'} <span className="text-xs font-normal text-slate-500">W</span>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium text-slate-700">Load Control</h2>
            <p className="mt-1 text-sm text-slate-500">
              {meter.relay_state === 'connected'
                ? 'Relay closed — power is flowing to the consumer.'
                : 'Relay open — the consumer load is disconnected.'}
              {meter.relay_updated_at && (
                <span className="text-slate-400">
                  {' '}
                  (changed{' '}
                  {new Date(meter.relay_updated_at).toLocaleString([], {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                  )
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge
              variant={meter.relay_state === 'connected' ? 'normal' : 'confirmed_theft'}
              label={meter.relay_state === 'connected' ? 'Connected' : 'Disconnected'}
            />
            <button
              type="button"
              onClick={toggleRelay}
              disabled={relayBusy}
              className={`rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 ${
                meter.relay_state === 'connected'
                  ? 'bg-accent-critical hover:bg-accent-critical/90'
                  : 'bg-accent-normal hover:bg-accent-normal/90'
              }`}
            >
              {relayBusy
                ? 'Working…'
                : meter.relay_state === 'connected'
                  ? 'Disconnect load'
                  : 'Reconnect load'}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-medium text-slate-700">Usage</h2>
        <UsageChart readings={readings} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-medium text-slate-700">Alert History</h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-slate-400">No alerts for this meter.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {alerts.map((a) => (
              <li key={a.id} className="py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">
                    {new Date(a.detected_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-500">score {a.anomaly_score.toFixed(4)}</span>
                    <StatusBadge variant={anomalyStatusVariant(a.status)} />
                  </div>
                </div>
                {a.notes && (
                  <p className="mt-1 text-xs text-rose-700 font-mono bg-rose-50 px-2 py-1 rounded border border-rose-200/60">
                    {a.notes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
