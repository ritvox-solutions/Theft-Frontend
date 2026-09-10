import { useEffect, useState } from 'react'
import StatusBadge, { anomalyStatusVariant } from '../../components/StatusBadge'
import UsageChart from '../../components/UsageChart'
import { useToast } from '../../context/ToastContext'
import type { Anomaly, AnomalyStatus } from '../../services/anomalies'
import { getAnomalies, updateAnomalyStatus } from '../../services/anomalies'
import type { Reading } from '../../services/readings'
import { getReadings } from '../../services/readings'

const STATUS_FILTERS: { value: AnomalyStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'confirmed_theft', label: 'Confirmed Theft' },
  { value: 'false_positive', label: 'False Positive' },
]

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

/** Row tint per the UI/UX Brief §3.3 row color-coding rule. Kept faint (5%
 * opacity) and paired with the StatusBadge's icon+text in every row, so the
 * color is reinforcement, not the only signal — and cell text stays slate,
 * not accent-colored, so row-level contrast is unaffected. */
function alertRowClasses(status: AnomalyStatus): string {
  if (status === 'open') return 'bg-accent-warning/5'
  if (status === 'confirmed_theft') return 'bg-accent-critical/5'
  return ''
}

function AlertDetailDrawer({
  alert,
  onClose,
  onStatusChanged,
}: {
  alert: Anomaly
  onClose: () => void
  onStatusChanged: (updated: Anomaly) => void
}) {
  const { showToast } = useToast()
  const [windowReadings, setWindowReadings] = useState<Reading[]>([])
  const [notes, setNotes] = useState(alert.notes ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    getReadings(alert.meter_id, {
      start: alert.reading_window.window_start,
      end: alert.reading_window.window_end,
    }).then((data) => {
      if (!cancelled) setWindowReadings(data)
    })
    return () => {
      cancelled = true
    }
  }, [alert])

  async function handleAction(status: Exclude<AnomalyStatus, 'open'>) {
    setIsSubmitting(true)
    try {
      const updated = await updateAnomalyStatus(alert.id, { status, notes })
      onStatusChanged(updated)
      showToast(`Alert marked as ${status.replace('_', ' ')}`, 'success')
      onClose()
    } catch {
      showToast('Failed to update alert status', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{alert.meter_code}</h2>
            <p className="text-sm text-slate-500">{alert.consumer_name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <StatusBadge variant={anomalyStatusVariant(alert.status)} />
          <span className="text-sm text-slate-500">
            score {alert.anomaly_score.toFixed(4)}
          </span>
        </div>

        <dl className="mb-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-slate-400">Detected</dt>
            <dd className="text-slate-800">{formatDateTime(alert.detected_at)}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Window</dt>
            <dd className="text-slate-800">
              {formatDateTime(alert.reading_window.window_start)} –{' '}
              {new Date(alert.reading_window.window_end).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Avg voltage</dt>
            <dd className="text-slate-800">{alert.reading_window.avg_voltage.toFixed(1)} V</dd>
          </div>
          <div>
            <dt className="text-slate-400">Avg current</dt>
            <dd className="text-slate-800">{alert.reading_window.avg_current.toFixed(1)} A</dd>
          </div>
        </dl>

        <h3 className="mb-2 text-sm font-medium text-slate-700">Triggering usage window</h3>
        <div className="mb-6 rounded-lg border border-slate-200 p-3">
          <UsageChart readings={windowReadings} emptyMessage="No raw readings for this window" />
        </div>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            placeholder="Investigation notes…"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleAction('reviewed')}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Mark Reviewed
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleAction('confirmed_theft')}
            className="rounded-md bg-accent-critical px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            Confirm Theft
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleAction('false_positive')}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-60"
          >
            Mark False Positive
          </button>
        </div>
      </div>
    </div>
  )
}

const POLL_INTERVAL_MS = 8000

export default function AlertsPanel() {
  const [alerts, setAlerts] = useState<Anomaly[]>([])
  const [statusFilter, setStatusFilter] = useState<AnomalyStatus | 'all'>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [selected, setSelected] = useState<Anomaly | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchAlerts(isFirstLoad = false) {
      if (isFirstLoad) setIsLoading(true)
      try {
        const data = await getAnomalies(statusFilter === 'all' ? {} : { status: statusFilter })
        if (!cancelled) {
          setAlerts(data)
          setIsLoading(false)
        }
      } catch {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchAlerts(true)
    const interval = setInterval(() => fetchAlerts(false), POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [statusFilter])

  function handleStatusChanged(updated: Anomaly) {
    setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Theft Alerts</h1>
        <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 border border-emerald-200">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[11px] font-medium text-emerald-700">Live</span>
        </div>
      </div>

      <div className="flex gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStatusFilter(f.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              statusFilter === f.value
                ? 'bg-primary text-white'
                : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Meter</th>
              <th className="px-4 py-3">Consumer</th>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Anomaly Score</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : alerts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  No alerts match this filter.
                </td>
              </tr>
            ) : (
              alerts.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => setSelected(a)}
                  className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-100 ${alertRowClasses(a.status)}`}
                >
                  <td className="px-4 py-3 font-medium text-slate-900">{a.meter_code}</td>
                  <td className="px-4 py-3 text-slate-600">{a.consumer_name}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(a.detected_at)}</td>
                  <td className="px-4 py-3 text-slate-600">{a.anomaly_score.toFixed(4)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge variant={anomalyStatusVariant(a.status)} />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelected(a)
                      }}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <AlertDetailDrawer
          alert={selected}
          onClose={() => setSelected(null)}
          onStatusChanged={handleStatusChanged}
        />
      )}
    </div>
  )
}
