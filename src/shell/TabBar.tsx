import { NavLink } from 'react-router-dom'
import { OverviewIcon, GymIcon, FoodIcon, MoneyIcon } from './icons'

const tabs = [
  { to: '/', label: 'Overview', Icon: OverviewIcon },
  { to: '/gym', label: 'Gym', Icon: GymIcon },
  { to: '/food', label: 'Food', Icon: FoodIcon },
  { to: '/money', label: 'Money', Icon: MoneyIcon },
]

export function TabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-canvas pb-safe">
      <div className="mx-auto flex max-w-md">
        {tabs.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-transform duration-150 ease-instrument active:scale-[0.98] ${
                isActive ? 'text-ink' : 'text-ink-faint'
              }`
            }
          >
            <Icon />
            <span className="text-label">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
