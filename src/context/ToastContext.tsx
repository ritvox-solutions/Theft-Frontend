import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'

interface ToastMessage {
  id: number
  text: string
  variant: 'success' | 'error'
}

interface ToastContextValue {
  showToast: (text: string, variant?: 'success' | 'error') => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

let nextToastId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const showToast = useCallback((text: string, variant: 'success' | 'error' = 'success') => {
    const id = nextToastId++
    setToasts((prev) => [...prev, { id, text, variant }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`rounded-md px-4 py-2 text-sm text-white shadow-lg ${
              t.variant === 'success' ? 'bg-accent-normal' : 'bg-accent-critical'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
