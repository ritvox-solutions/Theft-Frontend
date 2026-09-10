import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

// Narrower than the full Reading type so this can plot aggregate/synthetic
// points too (e.g. the Admin Dashboard's grid-wide trend) — Reading[] already
// structurally satisfies this.
export interface UsageChartPoint {
  recorded_at: string
  power: number
}


export default function UsageChart({
  readings,
  emptyMessage = 'No data yet — waiting for first reading',
}: {
  readings: UsageChartPoint[]
  emptyMessage?: string
}) {
  if (readings.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-200 text-slate-400">
        <svg className="h-6 w-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
        <p className="text-xs text-slate-400">{emptyMessage}</p>
      </div>
    )
  }

  // Sort chronologically and extract precise timestamps
  const chartData = [...readings]
    .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
    .map((r) => {
      const d = new Date(r.recorded_at)
      const p = Number(r.power)
      return {
        key: r.recorded_at,
        time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        power: Number.isFinite(p) ? Math.max(0, Math.round(p * 10) / 10) : 0,
      }
    })

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            stroke="#cbd5e1"
            tickFormatter={(val: string) => {
              // Convert "HH:MM:SS" or "HH:MM:SS AM" to "HH:MM"
              return val.replace(/:\d{2}(?=\s|[a-zA-Z]|$)/, '')
            }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            stroke="#cbd5e1"
            tickFormatter={(val) => `${val}W`}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload
                const powerVal = typeof payload[0].value === 'number'
                  ? payload[0].value
                  : Number(item?.power ?? 0)
                return (
                  <div className="rounded border border-slate-200 bg-white px-2.5 py-1.5 shadow-xs">
                    <p className="font-mono text-[10px] text-slate-400">{item?.time ?? ''}</p>
                    <p className="font-mono text-xs font-semibold text-slate-900 mt-0.5">
                      {powerVal.toFixed(1)} W
                    </p>
                  </div>
                )
              }
              return null
            }}
          />
          <Line
            type="monotone"
            dataKey="power"
            stroke="#0f172a"
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
            activeDot={{ r: 4, stroke: '#0f172a', strokeWidth: 2, fill: '#ffffff' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
