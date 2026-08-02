import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BackIcon } from './icons'

/**
 * Every screen's outer container. A phone gets the readable column it always
 * had; past `lg` the clamp comes off and the screen takes the width it actually
 * has, because the tab bar has become a sidebar by then and the canvas would
 * otherwise sit empty either side of a phone-shaped ribbon.
 */
export const PAGE = 'mx-auto w-full max-w-md md:max-w-3xl lg:max-w-none'

/**
 * A stack of cards that becomes two columns once there is room for them.
 * Wrap the stack in SPLIT and each half in COL. Cards keep their own `mt-*`
 * rhythm inside a column, so only the first card of the second column needs
 * `lg:mt-0`.
 */
export const SPLIT = 'lg:flex lg:items-start lg:gap-2.5'
export const COL = 'lg:min-w-0 lg:flex-1'

/** Explicit destination, never `navigate(-1)`: this is a home-screen PWA, so a
    deep link or a cold start can leave no history to go back through. */
export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="-ml-0.5 inline-flex min-h-[44px] items-center gap-1 pr-3 text-label text-ink-faint transition-transform duration-150 ease-instrument active:scale-[0.98]"
    >
      <BackIcon />
      {label}
    </Link>
  )
}

/** Screen title, with the back control above it and an optional action beside. */
export function PageHeader({
  back,
  title,
  subtitle,
  actions,
}: {
  back?: { to: string; label: string }
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <header className={back ? 'pb-2' : 'pb-2 pt-2'}>
      {back && <BackLink to={back.to} label={back.label} />}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-screen-title text-ink">{title}</h1>
        {actions}
      </div>
      {subtitle && <p className="mt-0.5 text-label text-ink-faint">{subtitle}</p>}
    </header>
  )
}
