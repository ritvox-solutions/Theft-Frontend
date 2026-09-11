import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useToast } from '../../context/ToastContext'
import type { Slab, TariffConfig } from '../../services/billing'
import { createTariffVersion, getTariff } from '../../services/billing'
import type { MlStatus } from '../../services/ml'
import { getMlStatus, retrainModel } from '../../services/ml'

function emptySlabRow(): Slab {
  return { upto_kwh: 0, rate: 0 }
}

export default function Settings() {
  const { showToast } = useToast()
  const [current, setCurrent] = useState<TariffConfig | null>(null)
  const [slabs, setSlabs] = useState<Slab[]>([emptySlabRow()])
  const [fixedCharge, setFixedCharge] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Machine Learning Model State
  const [mlStatus, setMlStatus] = useState<MlStatus | null>(null)
  const [isRetraining, setIsRetraining] = useState(false)

  useEffect(() => {
    Promise.all([
      getTariff(),
      getMlStatus().catch(() => null),
    ]).then(([tariff, ml]) => {
      setCurrent(tariff)
      setSlabs(tariff.slabs)
      setFixedCharge(tariff.fixed_charge)
      if (ml) setMlStatus(ml)
      setIsLoading(false)
    })
  }, [])

  function updateSlab(index: number, field: keyof Slab, value: string) {
    setSlabs((prev) =>
      prev.map((slab, i) =>
        i === index
          ? { ...slab, [field]: field === 'upto_kwh' && value === '' ? null : Number(value) }
          : slab,
      ),
    )
  }

  function addSlab() {
    setSlabs((prev) => [...prev, emptySlabRow()])
  }

  function removeSlab(index: number) {
    setSlabs((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const tariff = await createTariffVersion({ slabs, fixed_charge: fixedCharge })
      setCurrent(tariff)
      showToast('New tariff version created', 'success')
    } catch {
      showToast('Failed to create tariff version', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return <p className="text-slate-500">Loading settings…</p>
  }

  async function handleRetrain() {
    setIsRetraining(true)
    try {
      const res = await retrainModel()
      showToast(
        `ML Model retrained successfully with ${res.samples_trained ?? 'all'} windows!`,
        'success',
      )
      const updated = await getMlStatus()
      setMlStatus(updated)
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to retrain ML model'
      showToast(msg, 'error')
    } finally {
      setIsRetraining(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* ─── Tariff Settings ─────────────────────────────────────── */}
      <div className="space-y-6">
        <h1 className="text-lg font-semibold text-slate-900">Tariff Settings</h1>

        {current && (
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-sm font-medium text-slate-700">
              Current tariff (effective {current.effective_from})
            </h2>
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              {current.slabs.map((slab, i) => {
                const lower = i === 0 ? 0 : current.slabs[i - 1].upto_kwh ?? 0
                return (
                  <li key={i}>
                    {lower}–{slab.upto_kwh ?? 'no limit'} kWh: ₹{slab.rate.toFixed(2)}/kWh
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 text-sm text-slate-600">
              Fixed charge: ₹{current.fixed_charge.toFixed(2)}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-sm font-medium text-slate-700">Submit New Tariff Version</h2>
          <p className="mb-4 text-xs text-slate-400">
            This creates a new version — it never overwrites the current one, so past bills stay
            explainable against the rate that was actually in effect.
          </p>

          <div className="space-y-2">
            {slabs.map((slab, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-16 text-xs text-slate-500">Slab {i + 1}</span>
                <label className="text-sm">
                  <span className="sr-only">Upto kWh</span>
                  <input
                    type="number"
                    placeholder="upto kWh (blank = no limit)"
                    value={slab.upto_kwh ?? ''}
                    onChange={(e) => updateSlab(i, 'upto_kwh', e.target.value)}
                    className="w-48 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                  />
                </label>
                <label className="text-sm">
                  <span className="sr-only">Rate</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="rate per kWh"
                    value={slab.rate}
                    onChange={(e) => updateSlab(i, 'rate', e.target.value)}
                    className="w-36 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                  />
                </label>
                {slabs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSlab(i)}
                    className="text-xs text-accent-critical hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addSlab}
              className="text-sm font-medium text-primary hover:underline"
            >
              + Add slab
            </button>
          </div>

          <label className="mt-4 block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Fixed charge</span>
            <input
              type="number"
              step="0.01"
              required
              value={fixedCharge}
              onChange={(e) => setFixedCharge(Number(e.target.value))}
              className="w-36 rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {isSubmitting ? 'Submitting…' : 'Submit New Version'}
          </button>
        </form>
      </div>

      {/* ─── Machine Learning & Anomaly Engine Card ──────────────── */}
      <div className="space-y-4 pt-2 border-t border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Machine Learning & Anomaly Engine</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              IsolationForest statistical outlier model evaluating 15-minute consumption windows for abnormal usage patterns.
            </p>
          </div>
          {mlStatus?.status === 'active' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Active & Inference Ready
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 border border-amber-200">
              <span className="h-2 w-2 rounded-full bg-amber-500"></span>
              Model Untrained
            </span>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-4 border-b border-slate-100">
            <div>
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Algorithm</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                {mlStatus?.algorithm ? 'Isolation Forest' : '—'}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Scikit-Learn Ensemble</div>
            </div>

            <div>
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Dataset Windows</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                {mlStatus?.total_windows_available ?? 0} <span className="text-xs font-normal text-slate-500">windows</span>
              </div>
              <div className="text-[11px] text-rose-600 mt-0.5">
                {mlStatus?.anomaly_windows_count ?? 0} flagged anomalies
              </div>
            </div>

            <div>
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Last Retrained</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                {mlStatus?.last_trained_at
                  ? new Date(mlStatus.last_trained_at).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Never'}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {mlStatus?.file_size_bytes ? `${Math.round(mlStatus.file_size_bytes / 1024)} KB on disk` : 'No file'}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Feature Vector</div>
              <div className="mt-1 text-xs font-mono text-slate-700">
                {mlStatus?.features?.length ?? 4} dimensions
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">P_avg, Var(P), N, kWh</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-slate-500 max-w-xl">
              Retraining fits the model against all aggregated 15-minute consumption windows in the database and hot-reloads it into memory without backend downtime.
            </p>
            <button
              type="button"
              onClick={handleRetrain}
              disabled={isRetraining}
              className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 transition-colors shadow-sm"
            >
              {isRetraining ? (
                <>
                  <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Retraining Model…</span>
                </>
              ) : (
                <>
                  <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Retrain ML Model</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
