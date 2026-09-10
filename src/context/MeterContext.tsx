import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { getMyMeter } from '../services/readings'
import type { Meter } from '../services/readings'

interface MeterContextValue {
  meter: Meter | null
  isLoading: boolean
  refreshMeter: () => Promise<void>
}

const MeterContext = createContext<MeterContextValue | undefined>(undefined)

export function MeterProvider({ children }: { children: ReactNode }) {
  const [meter, setMeter] = useState<Meter | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshMeter = useCallback(async () => {
    try {
      const m = await getMyMeter()
      setMeter((prev) => {
        if (!prev && !m) return null
        if (!prev || !m) return m
        if (
          prev.id === m.id &&
          prev.relay_state === m.relay_state &&
          prev.status === m.status &&
          prev.meter_code === m.meter_code
        ) {
          return prev // return same reference to avoid re-renders
        }
        return m
      })
    } catch {
      // best-effort background sync
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getMyMeter()
      .then((m) => {
        if (!cancelled) setMeter(m)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <MeterContext.Provider value={{ meter, isLoading, refreshMeter }}>
      {children}
    </MeterContext.Provider>
  )
}

export function useMeter(): MeterContextValue {
  const ctx = useContext(MeterContext)
  if (!ctx) throw new Error('useMeter must be used within a MeterProvider')
  return ctx
}
