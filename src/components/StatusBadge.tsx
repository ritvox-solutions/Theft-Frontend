export type StatusVariant = 'normal' | 'flagged' | 'confirmed_theft' | 'reviewed' | 'false_positive'

const VARIANTS: Record<StatusVariant, { label: string; classes: string; dotClass: string }> = {
  normal: {
    label: 'Normal',
    classes: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    dotClass: 'bg-emerald-500',
  },
  flagged: {
    label: 'Flagged',
    classes: 'bg-amber-50 text-amber-800 border-amber-200',
    dotClass: 'bg-amber-500',
  },
  confirmed_theft: {
    label: 'Confirmed Theft',
    classes: 'bg-rose-50 text-rose-800 border-rose-200',
    dotClass: 'bg-rose-500',
  },
  reviewed: {
    label: 'Reviewed',
    classes: 'bg-slate-100 text-slate-600 border-slate-200',
    dotClass: 'bg-slate-400',
  },
  false_positive: {
    label: 'False Positive',
    classes: 'bg-slate-50 text-slate-400 border-slate-200',
    dotClass: 'bg-slate-300',
  },
}

export default function StatusBadge({
  variant,
  label,
}: {
  variant: StatusVariant
  label?: string
}) {
  const variantConfig = VARIANTS[variant]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${variantConfig.classes}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${variantConfig.dotClass}`} aria-hidden="true" />
      <span>{label ?? variantConfig.label}</span>
    </span>
  )
}

/** Maps an anomalies.status value to the StatusBadge variant per the UI/UX
 * Brief's row color-coding rule: amber (open), neutral (reviewed), red
 * (confirmed theft), muted (false positive). */
export function anomalyStatusVariant(
  status: 'open' | 'reviewed' | 'confirmed_theft' | 'false_positive',
): StatusVariant {
  return status === 'open' ? 'flagged' : status
}
