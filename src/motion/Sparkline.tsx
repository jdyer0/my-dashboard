import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useBootAnimate, useBootDelay } from './BootSequence'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

interface SparklineProps {
  points: number[]
  width?: number
  height?: number
  /** Colour comes from CSS `color` — set text-ink-dim, text-live, etc. */
  className?: string
}

const DRAW_MS = 700
const PAD = 3

export function Sparkline({ points, width = 120, height = 32, className = '' }: SparklineProps) {
  const animate = useBootAnimate()
  const delay = useBootDelay()
  const reduced = usePrefersReducedMotion()
  const draw = animate && !reduced

  const pathRef = useRef<SVGPathElement>(null)
  const [settled, setSettled] = useState(!draw)

  const coords = useMemo(() => {
    if (points.length < 2) return []
    const min = Math.min(...points)
    const max = Math.max(...points)
    const range = max - min || 1
    const step = (width - PAD * 2) / (points.length - 1)
    return points.map(
      (p, i) => [PAD + i * step, height - PAD - ((p - min) / range) * (height - PAD * 2)] as const,
    )
  }, [points, width, height])

  const d = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ')

  useLayoutEffect(() => {
    const el = pathRef.current
    if (!el || !draw) return
    const len = el.getTotalLength()
    el.style.transition = 'none'
    el.style.strokeDasharray = `${len}`
    el.style.strokeDashoffset = `${len}`
    el.getBoundingClientRect() // flush so the transition starts from fully hidden
    el.style.transition = `stroke-dashoffset ${DRAW_MS}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`
    el.style.strokeDashoffset = '0'
    const timer = window.setTimeout(() => setSettled(true), delay + DRAW_MS)
    return () => window.clearTimeout(timer)
  }, [draw, delay, d])

  const last = coords[coords.length - 1]
  if (!last) return null

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
    >
      <path
        ref={pathRef}
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={last[0]}
        cy={last[1]}
        r={2}
        fill="currentColor"
        style={{ opacity: settled ? 1 : 0, transition: 'opacity 200ms ease-out' }}
      />
    </svg>
  )
}
