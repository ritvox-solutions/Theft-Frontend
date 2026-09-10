import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import UsageChart from '../components/UsageChart'
import { useMeter } from '../context/MeterContext'
import { getReadings } from '../services/readings'
import type { Reading } from '../services/readings'

function toIsoOrUndefined(dateInputValue: string): string | undefined {
  if (!dateInputValue) return undefined
  return new Date(dateInputValue).toISOString()
}

export default function UsageHistory() {
  const { meter, isLoading: isMeterLoading } = useMeter()
  const [readings, setReadings] = useState<Reading[]>([])
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [isLoadingReadings, setIsLoadingReadings] = useState(true)

  useEffect(() => {
    if (!meter) return
    let cancelled = false
    getReadings(meter.id, { limit: 200 }).then((data) => {
      if (!cancelled) {
        setReadings(data)
        setIsLoadingReadings(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [meter])

  async function handleFilter(e: FormEvent) {
    e.preventDefault()
    if (!meter) return
    setIsLoadingReadings(true)
    try {
      const data = await getReadings(meter.id, {
        start: toIsoOrUndefined(start),
        end: toIsoOrUndefined(end),
        limit: 500,
      })
      setReadings(data)
    } finally {
      setIsLoadingReadings(false)
    }
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
      <h1 className="text-lg font-semibold text-slate-900">Usage History</h1>

      <form onSubmit={handleFilter} className="flex flex-wrap items-end gap-4">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">From</span>
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">To</span>
          <input
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={isLoadingReadings}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
        >
          {isLoadingReadings ? 'Loading…' : 'Apply'}
        </button>
      </form>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <UsageChart readings={readings} />
      </div>
    </div>
  )
}
