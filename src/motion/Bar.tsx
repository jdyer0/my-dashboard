import { useLayoutEffect, useRef } from 'react'
import { useBootAnimate, useBootDelay } from './BootSequence'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

interface BarProps {
  value: number
  max: number
  className?: string
  /** Fill colour — bg-live when on-target, bg-warn below, bg-ink-dim neutral. */
  fillClassName?: string
  /** Periodic energy pass along the filled region — on-target bars only. */
  shimmer?: boolean
}

const SWEEP_MS = 500
const TWEEN_MS = 300
const BAR_STAGGER_MS = 40

export function Bar({
  value,
  max,
  className = '',
  fillClassName = 'bg-ink-dim',
  shimmer = false,
}: BarProps) {
  const animate = useBootAnimate()
  const delay = useBootDelay()
  const reduced = usePrefersReducedMotion()
  const boot = animate && !reduced

  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  const fillRef = useRef<HTMLDivElement>(null)
  const isFirst = useRef(true)

  useLayoutEffect(() => {
    const el = fillRef.current
    if (!el) return
    const first = isFirst.current
    isFirst.current = false

    if (reduced) {
      el.style.transition = 'none'
      el.style.transform = `scaleX(${ratio})`
      return
    }

    if (first) {
      if (boot) {
        el.style.transition = 'none'
        el.style.transform = 'scaleX(0)'
        el.getBoundingClientRect() // flush so the sweep starts from zero
        el.style.transition = `transform ${SWEEP_MS}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay + BAR_STAGGER_MS}ms`
      } else {
        el.style.transition = 'none'
      }
    } else {
      el.style.transition = `transform ${TWEEN_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`
    }
    el.style.transform = `scaleX(${ratio})`
  }, [ratio, boot, delay, reduced])

  return (
    <div className={`relative h-1 overflow-hidden rounded-full bg-line ${className}`}>
      <div
        ref={fillRef}
        className={`h-full origin-left rounded-full ${fillClassName}`}
        style={{ transform: boot ? 'scaleX(0)' : `scaleX(${ratio})` }}
      />
      {/* Clipped to the filled region so the pass never runs past the value. */}
      {shimmer && !reduced && ratio > 0 && (
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 overflow-hidden rounded-full"
          style={{ width: `${ratio * 100}%` }}
        >
          <div className="h-full w-8 animate-shimmer bg-gradient-to-r from-transparent via-ink/50 to-transparent" />
        </div>
      )}
    </div>
  )
}
