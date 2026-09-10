import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import StatusBadge from '../../components/StatusBadge'
import { useToast } from '../../context/ToastContext'
import type { Bill } from '../../services/billing'
import { downloadBillPdf, generateAllBills, getAllBills, updateBillStatus } from '../../services/billing'

function billStatusVariant(status: Bill['status']) {
  if (status === 'paid') return 'normal' as const
  if (status === 'viewed') return 'reviewed' as const
  return 'flagged' as const
}

function GenerateBillsForm({ onGenerated }: { onGenerated: () => void }) {
  const { showToast } = useToast()
  const [cycleStart, setCycleStart] = useState('')
  const [cycleEnd, setCycleEnd] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!cycleStart || !cycleEnd) return
    setIsSubmitting(true)
    try {
      const result = await generateAllBills(cycleStart, cycleEnd)
      showToast(
        `Generated ${result.generated.length} bill(s), skipped ${result.skipped.length}`,
        'success',
      )
      onGenerated()
    } catch {
      showToast('Failed to generate bills for cycle', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-medium text-slate-700">Generate Bills for Cycle</h2>
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Cycle start</span>
          <input
            type="date"
            required
            value={cycleStart}
            onChange={(e) => setCycleStart(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Cycle end</span>
          <input
            type="date"
            required
            value={cycleEnd}
            onChange={(e) => setCycleEnd(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
        >
          {isSubmitting ? 'Generating…' : 'Generate for All Active Meters'}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Meters that already have a bill for this exact cycle are skipped automatically.
      </p>
    </form>
  )
}

export default function AdminBills() {
  const { showToast } = useToast()
  const [bills, setBills] = useState<Bill[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  async function loadBills() {
    const data = await getAllBills()
    setBills(data)
    setIsLoading(false)
  }

  useEffect(() => {
    loadBills()
  }, [])

  async function handleMarkPaid(bill: Bill) {
    try {
      await updateBillStatus(bill.id, 'paid')
      showToast(`${bill.meter_code} bill marked paid`, 'success')
      loadBills()
    } catch {
      showToast('Failed to update bill status', 'error')
    }
  }

  async function handleDownload(bill: Bill) {
    try {
      await downloadBillPdf(bill.id, `${bill.meter_code}-${bill.cycle_start}.pdf`)
    } catch {
      showToast('Could not download PDF', 'error')
    }
  }

  const filtered = bills.filter(
    (b) =>
      b.meter_code.toLowerCase().includes(search.toLowerCase()) ||
      b.consumer_name.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Bill Management</h1>

      <GenerateBillsForm onGenerated={loadBills} />

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
              <th className="px-4 py-3">Meter</th>
              <th className="px-4 py-3">Consumer</th>
              <th className="px-4 py-3">Cycle</th>
              <th className="px-4 py-3">Units (kWh)</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  No bills match.
                </td>
              </tr>
            ) : (
              filtered.map((bill) => (
                <tr key={bill.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-900">{bill.meter_code}</td>
                  <td className="px-4 py-3 text-slate-600">{bill.consumer_name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {bill.cycle_start} – {bill.cycle_end}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {bill.units_consumed_kwh.toFixed(2)}
                    {bill.has_no_readings && (
                      <p className="mt-0.5 text-xs font-medium text-accent-warning-text">
                        No data — verify meter
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-900">₹{bill.amount.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      variant={billStatusVariant(bill.status)}
                      label={bill.status.charAt(0).toUpperCase() + bill.status.slice(1)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => handleDownload(bill)}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        PDF
                      </button>
                      {bill.status !== 'paid' && (
                        <button
                          type="button"
                          onClick={() => handleMarkPaid(bill)}
                          className="text-sm font-medium text-accent-normal-text hover:underline"
                        >
                          Mark Paid
                        </button>
                      )}
                    </div>
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
