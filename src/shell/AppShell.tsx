import { Outlet, useLocation } from 'react-router-dom'
import { TabBar } from './TabBar'

export function AppShell() {
  const location = useLocation()

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      {/* Keyed on pathname so each route change re-enters with the 200ms fade. */}
      <main key={location.pathname} className="animate-fade-in px-4 pt-safe pb-28">
        <Outlet />
      </main>
      <TabBar />
    </div>
  )
}
