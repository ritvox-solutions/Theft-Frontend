import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import StatusBadge, { anomalyStatusVariant } from '../../components/StatusBadge'
import UsageChart from '../../components/UsageChart'
import type { UsageChartPoint } from '../../components/UsageChart'
import { getAdminStats } from '../../services/admin'
import type { Anomaly } from '../../services/anomalies'
import { getAnomalies } from '../../services/anomalies'
import { getAllBills } from '../../services/billing'
import { getAllMeters } from '../../services/meters-admin'
import type { Meter } from '../../services/readings'
import { getReadings } from '../../services/readings'

const GRID_TREND_METER_SAMPLE = 6
const BUCKET_MINUTES = 5

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

function bucketStart(iso: string): string {
  const d = new Date(iso)
  const ms = BUCKET_MINUTES * 60 * 1000
  return new Date(Math.floor(d.getTime() / ms) * ms).toISOString()
}

/** A lightweight grid-wide trend: sum power across a sample of meters' recent
 * readings, bucketed to 5-minute intervals. Not a true whole-grid total (only
 * samples up to GRID_TREND_METER_SAMPLE meters) — deliberately simple per
 * the Phase 5 brief's "don't over-build this" guidance. */
async function buildGridTrend(meters: Meter[]): Promise<UsageChartPoint[]> {
  const sample = meters.slice(0, GRID_TREND_METER_SAMPLE)
  const perMeterReadings = await Promise.all(
    sample.map((m) => getReadings(m.id, { limit: 50 }).catch(() => [])),
  )

  const buckets = new Map<string, number>()
  for (const readings of perMeterReadings) {
    for (const r of readings) {
      const key = bucketStart(r.recorded_at)
      buckets.set(key, (buckets.get(key) ?? 0) + r.power)
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([recorded_at, power]) => ({ recorded_at, power }))
}

const POLL_INTERVAL_MS = 6000

export default function AdminDashboard() {
  const [totalMeters, setTotalMeters] = useState<number | null>(null)
  const [activeAlerts, setActiveAlerts] = useState<Anomaly[]>([])
  const [energyToday, setEnergyToday] = useState<number | null>(null)
  const [billsThisCycle, setBillsThisCycle] = useState<number | null>(null)
  const [gridTrend, setGridTrend] = useState<UsageChartPoint[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    let tickCount = 0

    async function initialLoad() {
      try {
        const [meters, openAlerts, stats, allBills] = await Promise.all([
          getAllMeters(),
          getAnomalies({ status: 'open' }),
          getAdminStats(),
          getAllBills(),
        ])
        if (cancelled) return
        setTotalMeters(meters.length)
        setActiveAlerts(openAlerts)
        setEnergyToday(stats.energy_today_kwh)

        const now = new Date()
        const billsThisMonth = allBills.filter((b) => {
          const generated = new Date(b.generated_at)
          return (
            generated.getFullYear() === now.getFullYear() &&
            generated.getMonth() === now.getMonth()
          )
        })
        setBillsThisCycle(billsThisMonth.length)
        setIsLoading(false)

        const trend = await buildGridTrend(meters)
        if (!cancelled) setGridTrend(trend)
      } catch {
        if (!cancelled) setIsLoading(false)
      }
    }

    async function pollLightweight() {
      tickCount += 1
      try {
        const [openAlerts, stats] = await Promise.all([
          getAnomalies({ status: 'open' }),
          getAdminStats(),
        ])
        if (cancelled) return
        setActiveAlerts(openAlerts)
        setEnergyToday(stats.energy_today_kwh)

        // Refresh grid trend only once every 4 ticks (~24s) to prevent request storms
        if (tickCount % 4 === 0) {
          const meters = await getAllMeters()
          if (!cancelled) {
            setTotalMeters(meters.length)
            const trend = await buildGridTrend(meters)
            if (!cancelled) setGridTrend(trend)
          }
        }
      } catch {
        // best effort background update
      }
    }

    initialLoad()
    const interval = setInterval(pollLightweight, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  if (isLoading) {
    return <p className="text-slate-500">Loading admin dashboard…</p>
  }

  const recentAlerts = activeAlerts.slice(0, 5)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Admin Dashboard</h1>
        <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 border border-emerald-200">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[11px] font-medium text-emerald-700">Live</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Meters" value={String(totalMeters ?? 0)} />
        <KpiCard label="Active Alerts" value={String(activeAlerts.length)} />
        <KpiCard
          label="Energy Monitored Today"
          value={energyToday !== null ? `${energyToday.toFixed(2)} kWh` : '—'}
        />
        <KpiCard
          label="Bills This Cycle"
          value={String(billsThisCycle ?? 0)}
          hint="Bills generated this calendar month"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-medium text-slate-700">Grid-wide Usage Trend</h2>
          <UsageChart readings={gridTrend} emptyMessage="No usage data across meters yet" />
        </div>

        <div className="rounded-lg border-2 border-accent-warning/40 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-700">Theft Alerts</h2>
            <StatusBadge variant="flagged" label={`${activeAlerts.length} open`} />
          </div>

          {recentAlerts.length === 0 ? (
            <p className="text-sm text-slate-400">No open alerts.</p>
          ) : (
            <ul className="space-y-3">
              {recentAlerts.map((a) => (
                <li key={a.id} className="border-b border-slate-100 pb-2 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-900">{a.meter_code}</span>
                    <StatusBadge variant={anomalyStatusVariant(a.status)} />
                  </div>
                  <p className="text-xs text-slate-400">{a.consumer_name}</p>
                </li>
              ))}
            </ul>
          )}

          <Link
            to="/admin/alerts"
            className="mt-4 block rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-white hover:bg-primary/90"
          >
            View All Alerts
          </Link>
        </div>
      </div>
    </div>
  )
}
