import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useToast } from '../../context/ToastContext'
import type { Slab, TariffConfig } from '../../services/billing'
import { createTariffVersion, getTariff } from '../../services/billing'

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

  useEffect(() => {
    getTariff().then((tariff) => {
      setCurrent(tariff)
      setSlabs(tariff.slabs)
      setFixedCharge(tariff.fixed_charge)
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

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Tariff Settings</h1>

      {current && (
        <div className="rounded-lg border border-slate-200 bg-white p-5">
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

      <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-5">
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
  )
}
