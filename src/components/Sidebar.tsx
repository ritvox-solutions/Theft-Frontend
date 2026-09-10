import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const CONSUMER_NAV_ITEMS = [
  { to: '/', label: 'Dashboard' },
  { to: '/usage-history', label: 'Usage History' },
  { to: '/bills', label: 'Bills' },
]

const ADMIN_NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard' },
  { to: '/admin/meters', label: 'Meters' },
  { to: '/admin/alerts', label: 'Theft Alerts' },
  { to: '/admin/bills', label: 'Bills' },
  { to: '/admin/settings', label: 'Settings' },
]

/** Static on tablet/desktop (lg+); below that it's an off-canvas panel
 * toggled from the header hamburger button (UI/UX Brief §5: "Tablet: ...
 * sidebar collapses"). `isOpen`/`onClose` are only meaningful below lg. */
export default function Sidebar({
  isOpen = false,
  onClose,
}: {
  isOpen?: boolean
  onClose?: () => void
}) {
  const { user, logout } = useAuth()
  const navItems = user?.role === 'admin' ? ADMIN_NAV_ITEMS : CONSUMER_NAV_ITEMS

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-56 flex-shrink-0 flex-col border-r border-slate-200 bg-white transition-transform duration-200 ease-in-out lg:static lg:z-auto lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-slate-900 text-white text-xs font-bold font-mono">
            G
          </div>
          <span className="font-semibold text-slate-900 tracking-tight">Grid Watch</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/' || item.to === '/admin'}
              onClick={onClose}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 px-3 py-3">
          <button
            type="button"
            onClick={logout}
            className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Logout
          </button>
        </div>
      </aside>
    </>
  )
}
