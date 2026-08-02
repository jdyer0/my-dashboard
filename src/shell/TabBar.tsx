import { NavLink } from 'react-router-dom'
import { OverviewIcon, GymIcon, FoodIcon, MoneyIcon } from './icons'

const tabs = [
  { to: '/', label: 'Overview', Icon: OverviewIcon },
  { to: '/gym', label: 'Gym', Icon: GymIcon },
  { to: '/food', label: 'Food', Icon: FoodIcon },
  { to: '/money', label: 'Money', Icon: MoneyIcon },
]

/**
 * Four tabs, two shapes. Thumb-height bar along the bottom of a phone; past
 * `lg` the same four links stand up into a left rail, which is what frees the
 * full width for content. One DOM, CSS decides — nothing here re-mounts on
 * resize, so a route stays put when the layout changes.
 */
export function TabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas pb-safe lg:inset-y-0 lg:right-auto lg:w-56 lg:border-r lg:border-t-0 lg:pb-0">
      <div className="mx-auto flex w-full max-w-md md:max-w-2xl lg:max-w-none lg:flex-col lg:gap-1 lg:px-3 lg:pt-6">
        {tabs.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-transform duration-150 ease-instrument active:scale-[0.98] lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:rounded-ctl lg:px-3 ${
                isActive
                  ? 'glow-icon text-live lg:bg-surface'
                  : 'text-ink-faint lg:hover:text-ink-dim'
              }`
            }
          >
            <Icon />
            <span className="text-label lg:text-body">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
