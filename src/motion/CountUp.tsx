import { useEffect, useRef, useState } from 'react'
import { useBootAnimate, useBootDelay } from './BootSequence'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

interface CountUpProps {
  value: number
  /** Decimal places when no format is given. */
  decimals?: number
  /** Full control over rendering, e.g. currency: (n) => gbp.format(n) */
  format?: (n: number) => string
  className?: string
}

const BOOT_MS = 600
const TWEEN_MS = 300
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

export function CountUp({ value, decimals = 0, format, className = '' }: CountUpProps) {
  const animate = useBootAnimate()
  const delay = useBootDelay()
  const reduced = usePrefersReducedMotion()

  const boot = animate && !reduced
  const [display, setDisplay] = useState(() => (boot ? 0 : value))
  const shown = useRef(boot ? 0 : value)
  const isFirst = useRef(true)

  useEffect(() => {
    const first = isFirst.current
    isFirst.current = false

    const from = shown.current
    if (reduced || from === value || (first && !boot)) {
      shown.current = value
      setDisplay(value)
      return
    }

    const duration = first ? BOOT_MS : TWEEN_MS
    const startDelay = first ? delay : 0
    let raf = 0
    let start: number | null = null

    const tick = (now: number) => {
      if (start === null) start = now + startDelay
      const t = Math.min(1, Math.max(0, (now - start) / duration))
      const v = from + (value - from) * easeOutCubic(t)
      shown.current = v
      setDisplay(v)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot/delay are fixed at mount
  }, [value, reduced])

  const text = format
    ? format(display)
    : display.toLocaleString('en-GB', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })

  return <span className={`font-mono tabular-nums ${className}`}>{text}</span>
}
