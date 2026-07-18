interface IconProps {
  className?: string
}

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

export function OverviewIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="11" y="3" width="6" height="6" rx="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1.5" />
      <rect x="11" y="11" width="6" height="6" rx="1.5" />
    </svg>
  )
}

export function GymIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6.5 10h7" />
      <rect x="3.5" y="6.5" width="3" height="7" rx="1" />
      <rect x="13.5" y="6.5" width="3" height="7" rx="1" />
    </svg>
  )
}

export function FoodIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3.5 9.5h13" />
      <path d="M4 9.5a6 6 0 0 1 12 0" />
      <path d="M6 13h8" />
    </svg>
  )
}

export function MoneyIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="2.5" y="5.5" width="15" height="9" rx="1.5" />
      <circle cx="10" cy="10" r="2" />
    </svg>
  )
}
