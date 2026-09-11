import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import UsageChart from '../components/UsageChart'
import { useMeter } from '../context/MeterContext'
import { getReadings } from '../services/readings'
import type { Reading } from '../services/readings'

type PresetRange = 'today' | '24h' | '7d' | '30d' | 'custom'

export default function UsageHistory() {
  const { meter, isLoading: isMeterLoading } = useMeter()
  const [readings, setReadings] = useState<Reading[]>([])
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [activePreset, setActivePreset] = useState<PresetRange>('24h')
  const [isLoadingReadings, setIsLoadingReadings] = useState(true)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // Load initial preset
  useEffect(() => {
    if (!meter) return
    applyPreset('24h')
  }, [meter])

  async function fetchReadings(startDate?: string, endDate?: string) {
    if (!meter) return
    setIsLoadingReadings(true)
    try {
      const data = await getReadings(meter.id, {
        start: startDate,
        end: endDate,
        limit: 1000,
      })
      setReadings(data)
      setCurrentPage(1)
    } finally {
      setIsLoadingReadings(false)
    }
  }

  function applyPreset(preset: PresetRange) {
    setActivePreset(preset)
    const now = new Date()
    let startDate: Date | undefined
    let endDate: Date | undefined = now

    if (preset === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
    } else if (preset === '24h') {
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    } else if (preset === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    } else if (preset === '30d') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    } else if (preset === 'custom') {
      return
    }

    if (startDate) {
      setStart(toLocalDatetimeString(startDate))
      setEnd(toLocalDatetimeString(endDate))
      fetchReadings(startDate.toISOString(), endDate.toISOString())
    }
  }

  function toLocalDatetimeString(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  async function handleCustomFilter(e: FormEvent) {
    e.preventDefault()
    setActivePreset('custom')
    const startIso = start ? new Date(start).toISOString() : undefined
    const endIso = end ? new Date(end).toISOString() : undefined
    fetchReadings(startIso, endIso)
  }

  // Summary Metrics Computation
  const summary = useMemo(() => {
    if (readings.length === 0) {
      return {
        totalEnergyKwh: 0,
        avgVoltage: 0,
        peakPower: 0,
        avgDelta: 0,
        anomaliesCount: 0,
        totalCount: 0,
      }
    }

    let sumVoltage = 0
    let maxPower = 0
    let sumDelta = 0
    let anomalies = 0
    let totalWattSeconds = 0

    // Chronological order for energy trapezoid
    const sorted = [...readings].sort(
      (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
    )

    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i]
      sumVoltage += r.voltage
      if (r.power > maxPower) maxPower = r.power
      const delta = r.delta_current ?? Math.max(0, (r.source_current ?? r.current) - r.current)
      sumDelta += delta
      if (r.theft_detected || delta >= 0.065) anomalies++

      if (i > 0) {
        const prev = sorted[i - 1]
        const dtSeconds = Math.min(
          120, // clamp max gap to 2 minutes to prevent huge jumps from missing data
          (new Date(r.recorded_at).getTime() - new Date(prev.recorded_at).getTime()) / 1000,
        )
        if (dtSeconds > 0) {
          totalWattSeconds += ((r.power + prev.power) / 2) * dtSeconds
        }
      }
    }

    return {
      totalEnergyKwh: totalWattSeconds / (3600 * 1000),
      avgVoltage: sumVoltage / readings.length,
      peakPower: maxPower,
      avgDelta: sumDelta / readings.length,
      anomaliesCount: anomalies,
      totalCount: readings.length,
    }
  }, [readings])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(readings.length / pageSize))
  const paginatedReadings = useMemo(() => {
    const from = (currentPage - 1) * pageSize
    return readings.slice(from, from + pageSize)
  }, [readings, currentPage, pageSize])

  // CSV Export
  function exportToCsv() {
    if (readings.length === 0) return
    const headers = [
      'Timestamp (ISO)',
      'Local Time',
      'Voltage (V)',
      'Incoming Line Current (A)',
      'Junction Box Current (A)',
      'Differential Delta (A)',
      'Active Power (W)',
      'Theft Alert',
    ]

    const rows = readings.map((r) => {
      const src = r.source_current ?? r.current
      const delta = r.delta_current ?? Math.max(0, src - r.current)
      const isTheft = r.theft_detected || delta >= 0.065
      return [
        `"${r.recorded_at}"`,
        `"${new Date(r.recorded_at).toLocaleString()}"`,
        r.voltage.toFixed(1),
        src.toFixed(3),
        r.current.toFixed(3),
        delta.toFixed(3),
        r.power.toFixed(1),
        isTheft ? 'THEFT_ALERT' : 'NORMAL',
      ].join(',')
    })

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute(
      'download',
      `readings-${meter?.meter_code || 'meter'}-${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (isMeterLoading) {
    return <p className="text-slate-500">Loading…</p>
  }

  if (!meter) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
        No meter is assigned to your account yet.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ─── Header & CSV Action ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Usage History & Telemetry</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Audit-grade electrical telemetry breakdown with dual-CT balance analysis for {meter.meter_code}.
          </p>
        </div>

        <button
          type="button"
          onClick={exportToCsv}
          disabled={readings.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV ({readings.length})
        </button>
      </div>

      {/* ─── Summary KPIs ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Energy Monitored</div>
          <div className="mt-1 text-xl font-bold text-slate-900">
            {summary.totalEnergyKwh.toFixed(3)} <span className="text-xs font-normal text-slate-500">kWh</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Integrated load power</div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Avg Line Voltage</div>
          <div className="mt-1 text-xl font-bold text-slate-900">
            {summary.avgVoltage > 0 ? summary.avgVoltage.toFixed(1) : '—'}{' '}
            <span className="text-xs font-normal text-slate-500">V</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">RMS Grid potential</div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Peak Demand</div>
          <div className="mt-1 text-xl font-bold text-slate-900">
            {summary.peakPower.toFixed(1)} <span className="text-xs font-normal text-slate-500">W</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Max instant draw</div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Line Differential</div>
          <div className="mt-1 text-xl font-bold text-slate-900">
            +{summary.avgDelta.toFixed(3)} <span className="text-xs font-normal text-slate-500">A</span>
          </div>
          <div className={`text-[11px] mt-0.5 ${summary.anomaliesCount > 0 ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>
            {summary.anomaliesCount} alerts triggered
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm col-span-2 sm:col-span-1">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Telemetry Samples</div>
          <div className="mt-1 text-xl font-bold text-slate-900">{summary.totalCount}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Readings in window</div>
        </div>
      </div>

      {/* ─── Timeframe Presets & Filter Form ──────────────────────── */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {(['today', '24h', '7d', '30d'] as PresetRange[]).map((p) => {
              const labels: Record<PresetRange, string> = {
                today: 'Today',
                '24h': 'Last 24 Hours',
                '7d': 'Last 7 Days',
                '30d': 'Last 30 Days',
                custom: 'Custom',
              }
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    activePreset === p
                      ? 'bg-primary text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {labels[p]}
                </button>
              )
            })}
          </div>

          <form onSubmit={handleCustomFilter} className="flex flex-wrap items-center gap-2">
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => {
                setStart(e.target.value)
                setActivePreset('custom')
              }}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs focus:border-primary focus:outline-none"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="datetime-local"
              value={end}
              onChange={(e) => {
                setEnd(e.target.value)
                setActivePreset('custom')
              }}
              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={isLoadingReadings}
              className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60 transition-colors"
            >
              {isLoadingReadings ? 'Loading…' : 'Filter'}
            </button>
          </form>
        </div>
      </div>

      {/* ─── Usage Chart ─────────────────────────────────────────── */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Power Consumption & Line Differential Profile</h2>
        <UsageChart readings={readings} />
      </div>

      {/* ─── Tabular Readings Breakdown ──────────────────────────── */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Telemetry Log Breakdown</h2>
            <p className="text-xs text-slate-500">
              Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, readings.length)} of {readings.length} readings
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setCurrentPage(1)
              }}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-primary focus:outline-none"
            >
              <option value={20}>20</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left uppercase tracking-wider text-slate-400 bg-slate-50">
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Voltage (V)</th>
                <th className="px-4 py-3">Line Current (I₁)</th>
                <th className="px-4 py-3">Meter Load (I₂)</th>
                <th className="px-4 py-3">Bypass Loss (ΔI)</th>
                <th className="px-4 py-3">Power (W)</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingReadings ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Loading readings telemetry…
                  </td>
                </tr>
              ) : paginatedReadings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    No readings found for this time range.
                  </td>
                </tr>
              ) : (
                paginatedReadings.map((r) => {
                  const src = r.source_current ?? r.current
                  const delta = r.delta_current ?? Math.max(0, src - r.current)
                  const isTheft = r.theft_detected || delta >= 0.065
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors ${
                        isTheft ? 'bg-rose-50/50' : ''
                      }`}
                    >
                      <td className="px-4 py-2.5 font-mono text-slate-700">
                        {new Date(r.recorded_at).toLocaleString([], {
                          dateStyle: 'short',
                          timeStyle: 'medium',
                        })}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-slate-800">
                        {r.voltage.toFixed(1)} V
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-700">
                        {src.toFixed(3)} A
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-700">
                        {r.current.toFixed(3)} A
                      </td>
                      <td className="px-4 py-2.5 font-mono">
                        <span
                          className={`font-semibold ${
                            delta >= 0.065 ? 'text-rose-600' : 'text-slate-500'
                          }`}
                        >
                          +{delta.toFixed(3)} A
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-slate-900">
                        {r.power.toFixed(1)} W
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {isTheft ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800">
                            🚨 Bypass Loss
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                            Normal
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ─── Pagination Footer ─────────────────────────────────── */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-slate-200 flex items-center justify-between bg-slate-50/50 text-xs">
            <span className="text-slate-500">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
