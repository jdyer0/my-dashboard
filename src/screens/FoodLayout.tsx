import { NavLink, Outlet } from 'react-router-dom'
import { PAGE } from '../shell/PageHeader'

const SECTIONS = [
  { to: '/food', label: 'Diary', end: true },
  { to: '/food/trends', label: 'Trends', end: false },
  { to: '/food/micros', label: 'Micros', end: false },
  { to: '/food/water', label: 'Water', end: false },
]

/**
 * The food module's four views share a header and a segmented control. The
 * bottom tab bar stays at four tabs — hydration is nutrition, and a fifth
 * bottom tab would cost every other tab its thumb room.
 */
export function FoodLayout() {
  return (
    <div className={PAGE}>
      <header className="pb-2 pt-2">
        <h1 className="text-screen-title text-ink">Food</h1>
      </header>

      {/* Stays a segmented control rather than stretching across a desktop —
          four tabs a metre wide read as a toolbar, not a switch. */}
      <nav className="mb-2.5 grid grid-cols-4 gap-1 rounded-ctl border border-line bg-surface p-1 lg:max-w-lg">
        {SECTIONS.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex min-h-[36px] items-center justify-center rounded-ctl text-label transition-transform duration-150 ease-instrument active:scale-[0.98] ${
                isActive ? 'bg-surface-raised text-ink' : 'text-ink-faint'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}
