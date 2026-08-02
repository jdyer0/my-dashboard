import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { useBootAnimate, useBootDelay } from './BootSequence'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

interface RingProps {
  value: number
  max: number
  size?: number
  /** Stroke colour comes from CSS `color` — set text-live, text-warn, etc. */
  className?: string
  /** Centred content: the number and its caption. */
  children?: ReactNode
  /** Marks where the target sits when the value has run past it. */
  overshoot?: boolean
}

const SWEEP_MS = 700
const TWEEN_MS = 300
const STROKE = 3

/**
 * A single progress arc. Hand-rolled SVG like every other chart here (§5) —
 * it draws itself by stroke-dashoffset, the same device the sparklines use, so
 * it arrives as part of the boot cascade rather than as a separate effect.
 *
 * The arc starts at twelve o'clock and runs clockwise. Past 100% it holds a
 * full circle and the overshoot is reported by colour, not by a second lap:
 * a ring that wraps around itself is unreadable at a glance, which is the only
 * thing a ring is good for.
 */
export function Ring({
  value,
  max,
  size = 132,
  className = '',
  children,
  overshoot = false,
}: RingProps) {
  const animate = useBootAnimate()
  const delay = useBootDelay()
  const reduced = usePrefersReducedMotion()
  const boot = animate && !reduced

  const radius = (size - STROKE) / 2
  const circumference = 2 * Math.PI * radius
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  const offset = circumference * (1 - ratio)

  const arcRef = useRef<SVGCircleElement>(null)
  const isFirst = useRef(true)

  useLayoutEffect(() => {
    const el = arcRef.current
    if (!el) return
    const first = isFirst.current
    isFirst.current = false

    if (reduced) {
      el.style.transition = 'none'
      el.style.strokeDashoffset = `${offset}`
      return
    }

    if (first) {
      if (boot) {
        el.style.transition = 'none'
        el.style.strokeDashoffset = `${circumference}`
        el.getBoundingClientRect() // flush so the sweep starts from empty
        el.style.transition = `stroke-dashoffset ${SWEEP_MS}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`
      } else {
        el.style.transition = 'none'
      }
    } else {
      el.style.transition = `stroke-dashoffset ${TWEEN_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`
    }
    el.style.strokeDashoffset = `${offset}`
  }, [offset, circumference, boot, delay, reduced])

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={className}
        aria-hidden="true"
      >
        {/* Track. Full circle in the hairline colour, like a chart gridline. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1E2A2C"
          strokeWidth={STROKE}
        />
        <circle
          ref={arcRef}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={boot ? circumference : offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        {/* A tick at twelve o'clock once the value has overrun the target, so
            "full ring" and "over target" are never the same picture. */}
        {overshoot && (
          <line
            x1={size / 2}
            y1={STROKE / 2}
            x2={size / 2}
            y2={STROKE * 2.5}
            stroke="#0B0F10"
            strokeWidth={1.5}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}
