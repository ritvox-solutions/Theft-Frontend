import type { ReactNode } from 'react'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import MenuButton from './MenuButton'
import Sidebar from './Sidebar'

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-app-bg">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <MenuButton onClick={() => setIsSidebarOpen(true)} />
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-white">
                Admin
              </span>
              <span className="hidden text-sm text-slate-500 sm:inline">Utility control room</span>
            </div>
          </div>
          <div className="text-sm text-slate-500">{user?.name}</div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  )
}
