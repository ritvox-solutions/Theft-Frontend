import { useEffect, useState } from 'react'
import StatusBadge from '../components/StatusBadge'
import { useMeter } from '../context/MeterContext'
import { useToast } from '../context/ToastContext'
import type { Bill, CurrentCycleEstimate } from '../services/billing'
import { downloadBillPdf, getBillsForMeter, getCurrentEstimate, payBill } from '../services/billing'

function billStatusVariant(status: Bill['status']) {
  if (status === 'paid') return 'normal' as const
  if (status === 'viewed') return 'reviewed' as const
  return 'flagged' as const
}

export default function Bills() {
  const { meter, isLoading: isMeterLoading } = useMeter()
  const { showToast } = useToast()
  const [bills, setBills] = useState<Bill[]>([])
  const [estimate, setEstimate] = useState<CurrentCycleEstimate | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [payingBillId, setPayingBillId] = useState<string | null>(null)

  useEffect(() => {
    if (!meter) return
    let cancelled = false

    Promise.all([
      getBillsForMeter(meter.id),
      getCurrentEstimate(meter.id).catch(() => null),
    ]).then(([billsData, estimateData]) => {
      if (!cancelled) {
        setBills(billsData)
        setEstimate(estimateData)
        setIsLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [meter])

  async function handleDownload(bill: Bill) {
    try {
      await downloadBillPdf(bill.id, `${bill.meter_code}-${bill.cycle_start}.pdf`)
    } catch {
      showToast('Could not download PDF', 'error')
    }
  }

  async function handlePay(bill: Bill) {
    setPayingBillId(bill.id)
    try {
      const updated = await payBill(bill.id)
      setBills((prev) => prev.map((b) => (b.id === bill.id ? updated : b)))
      showToast(`Bill for ₹${bill.amount.toFixed(2)} paid successfully!`, 'success')
    } catch {
      showToast('Payment processing failed. Please try again.', 'error')
    } finally {
      setPayingBillId(null)
    }
  }

  if (isMeterLoading || (isLoading && meter)) {
    return <p className="text-slate-500">Loading bills…</p>
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
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Electricity Bills</h1>
      </div>

      {/* Live Current Billing Cycle Banner */}
      {estimate && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Current Cycle ({estimate.cycle_start} to {estimate.cycle_end})
              </p>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="font-mono text-2xl font-semibold tracking-tight text-slate-900">
                  ₹{estimate.estimated_amount.toFixed(2)}
                </span>
                <span className="font-mono text-xs text-slate-500">
                  ({estimate.units_consumed_kwh.toFixed(3)} kWh)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono text-slate-600">
              <div>
                <span className="text-slate-400">Fixed: </span>
                <span>₹{estimate.fixed_charge.toFixed(2)}</span>
              </div>
              <div className="text-slate-300">|</div>
              <div>
                <span className="text-slate-400">Usage: </span>
                <span>₹{estimate.energy_charge.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Historical Bills Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Cycle Period</th>
              <th className="px-4 py-3">Units (kWh)</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {bills.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  No generated bills yet. Your running cost for the current cycle is tracked above.
                </td>
              </tr>
            ) : (
              bills.map((bill) => (
                <tr key={bill.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-slate-800 font-medium">
                    {bill.cycle_start} – {bill.cycle_end}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {bill.units_consumed_kwh.toFixed(2)} kWh
                    {bill.has_no_readings && (
                      <p className="mt-0.5 text-xs text-slate-400">
                        No usage recorded — fixed charge only
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">₹{bill.amount.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      variant={billStatusVariant(bill.status)}
                      label={bill.status.charAt(0).toUpperCase() + bill.status.slice(1)}
                    />
                  </td>
                  <td className="px-4 py-3 text-right space-x-3">
                    {bill.status !== 'paid' && (
                      <button
                        type="button"
                        disabled={payingBillId === bill.id}
                        onClick={() => handlePay(bill)}
                        className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
                      >
                        {payingBillId === bill.id ? 'Processing…' : 'Pay Now'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDownload(bill)}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Download PDF
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
