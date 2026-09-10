import type { ReactNode } from 'react'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { MeterProvider, useMeter } from '../context/MeterContext'
import MenuButton from './MenuButton'
import Sidebar from './Sidebar'

function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const { user } = useAuth()
  const { meter } = useMeter()

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        <MenuButton onClick={onMenuClick} />
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Meter</span>
          <span className="font-mono text-sm font-medium text-slate-900">
            {meter ? meter.meter_code : '—'}
          </span>
        </div>
      </div>
      <div className="text-sm text-slate-500">{user?.name}</div>
    </header>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  return (
    <MeterProvider>
      <div className="flex min-h-screen bg-app-bg">
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header onMenuClick={() => setIsSidebarOpen(true)} />
          <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
        </div>
      </div>
    </MeterProvider>
  )
}
