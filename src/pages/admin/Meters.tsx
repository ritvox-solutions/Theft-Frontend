import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import StatusBadge from '../../components/StatusBadge'
import { useToast } from '../../context/ToastContext'
import {
  activateMeter,
  createMeter,
  deactivateMeter,
  getAllMeters,
} from '../../services/meters-admin'
import { getReadings } from '../../services/readings'
import type { Meter } from '../../services/readings'
import { getUsers } from '../../services/users'
import type { UserSummary } from '../../services/users'

interface MeterRow {
  meter: Meter
  ownerName: string
  latestReadingAt: string | null
}

function CreateMeterForm({
  consumers,
  onCreated,
}: {
  consumers: UserSummary[]
  onCreated: (meter: Meter) => void
}) {
  const { showToast } = useToast()
  const [meterCode, setMeterCode] = useState('')
  const [userId, setUserId] = useState('')
  const [deviceKey, setDeviceKey] = useState('')
  const [locationLabel, setLocationLabel] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!userId) {
      setError('Select an owning consumer — every meter must be assigned at creation.')
      return
    }
    setError(null)
    setIsSubmitting(true)
    try {
      const meter = await createMeter({
        meter_code: meterCode,
        user_id: userId,
        device_key: deviceKey,
        location_label: locationLabel || undefined,
      })
      onCreated(meter)
      showToast(`Meter ${meter.meter_code} created`, 'success')
      setMeterCode('')
      setUserId('')
      setDeviceKey('')
      setLocationLabel('')
    } catch {
      setError('Could not create meter — check that meter_code/device_key are unique.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-medium text-slate-700">Create Meter</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Meter code</span>
          <input
            required
            value={meterCode}
            onChange={(e) => setMeterCode(e.target.value)}
            placeholder="MTR-0006"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            Owning consumer <span className="text-accent-critical">*</span>
          </span>
          <select
            required
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            <option value="">Select a consumer…</option>
            {consumers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.email})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Device key</span>
          <input
            required
            value={deviceKey}
            onChange={(e) => setDeviceKey(e.target.value)}
            placeholder="DEVKEY-0006"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Location label</span>
          <input
            value={locationLabel}
            onChange={(e) => setLocationLabel(e.target.value)}
            placeholder="Optional"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-accent-critical">{error}</p>}
      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
      >
        {isSubmitting ? 'Creating…' : 'Create Meter'}
      </button>
    </form>
  )
}

const POLL_INTERVAL_MS = 20000

export default function Meters() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<MeterRow[]>([])
  const [consumers, setConsumers] = useState<UserSummary[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  async function loadRows() {
    try {
      const [meters, consumerUsers] = await Promise.all([
        getAllMeters(),
        getUsers({ role: 'consumer' }),
      ])
      const consumerById = new Map(consumerUsers.map((c) => [c.id, c.name]))

      const withLatest = await Promise.all(
        meters.map(async (meter) => {
          const latest = await getReadings(meter.id, { limit: 1 }).catch(() => [])
          return {
            meter,
            ownerName: consumerById.get(meter.user_id) ?? '—',
            latestReadingAt: latest[0]?.recorded_at ?? null,
          }
        }),
      )

      setRows(withLatest)
      setConsumers(consumerUsers)
      setIsLoading(false)
    } catch {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadRows()
    const interval = setInterval(loadRows, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  async function handleToggleStatus(row: MeterRow) {
    try {
      if (row.meter.status === 'active') {
        await deactivateMeter(row.meter.id)
        showToast(`${row.meter.meter_code} deactivated`, 'success')
      } else {
        await activateMeter(row.meter.id)
        showToast(`${row.meter.meter_code} activated`, 'success')
      }
      loadRows()
    } catch {
      showToast('Failed to update meter status', 'error')
    }
  }

  const filtered = rows.filter(
    (r) =>
      r.meter.meter_code.toLowerCase().includes(search.toLowerCase()) ||
      r.ownerName.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Meters</h1>
        <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 border border-emerald-200">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[11px] font-medium text-emerald-700">Live</span>
        </div>
      </div>

      <CreateMeterForm consumers={consumers} onCreated={() => loadRows()} />

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by meter code or consumer…"
        className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Meter Code</th>
              <th className="px-4 py-3">Consumer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Load</th>
              <th className="px-4 py-3">Latest Reading</th>
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
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  No meters match.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr
                  key={row.meter.id}
                  className={`border-b border-slate-100 last:border-0 ${
                    row.meter.status === 'inactive' ? 'bg-slate-50 text-slate-400' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <Link to={`/admin/meters/${row.meter.id}`} className="hover:underline">
                      {row.meter.meter_code}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.ownerName}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      variant={row.meter.status === 'active' ? 'normal' : 'flagged'}
                      label={row.meter.status === 'active' ? 'Active' : 'Inactive'}
                    />
                  </td>
                  <td className="px-4 py-3">
                    {row.meter.relay_state === 'disconnected' && (
                      <StatusBadge variant="confirmed_theft" label="Disconnected" />
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {row.latestReadingAt
                      ? new Date(row.latestReadingAt).toLocaleString([], {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })
                      : 'No readings yet'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(row)}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {row.meter.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
