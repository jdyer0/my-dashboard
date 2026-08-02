import { Outlet, useLocation } from 'react-router-dom'
import { TabBar } from './TabBar'

export function AppShell() {
  const location = useLocation()

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      {/* Blueprint grid under everything, fading out towards the tab bar. */}
      <div aria-hidden="true" className="bg-grid pointer-events-none fixed inset-0" />
      {/* Ambient teal wash bleeding down from the top edge, breathing slowly. */}
      <div
        aria-hidden="true"
        className="bg-ambient pointer-events-none fixed inset-x-0 top-0 h-80 animate-breathe"
      />
      {/* A glint sweeps the top hairline every few seconds — the shell's one
          perpetual motion besides the sync dot. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-px overflow-hidden"
      >
        <div className="h-px w-32 animate-scan bg-gradient-to-r from-transparent via-live/60 to-transparent" />
      </div>
      {/* Keyed on pathname so each route change re-enters with the 200ms fade.
          Past `lg` the tab bar is a 14rem rail, so main clears it on the left
          and drops the thumb-room padding at the bottom. */}
      <main
        key={location.pathname}
        className="relative animate-fade-in px-4 pt-safe pb-28 lg:pb-10 lg:pl-[15.5rem] lg:pr-6"
      >
        <Outlet />
      </main>
      <TabBar />
    </div>
  )
}
