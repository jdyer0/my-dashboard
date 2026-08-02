import { useId, useLayoutEffect, useMemo, useState } from 'react'
import { useBootAnimate, useBootDelay } from './BootSequence'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

export interface Series {
  /** Null leaves a gap rather than drawing through missing data. */
  points: (number | null)[]
  /** Stroke colour class, e.g. 'text-live'. */
  className?: string
  /** Dotted, for a secondary reading like the raw scale weight. */
  dashed?: boolean
  /** Draw the endpoint dot. */
  endpoint?: boolean
}

interface LineChartProps {
  series: Series[]
  /** Labels under the axis; only the first and last are drawn. */
  labels?: [string, string]
  height?: number
  /** Horizontal reference line, e.g. a target. */
  reference?: number
  referenceLabel?: string
  className?: string
}

const DRAW_MS = 700
const PAD_X = 4
const PAD_Y = 8
const VIEW_W = 300

/**
 * A small multi-series line chart: 0.5px gridlines, 1.5px strokes, no fills,
 * no legend, no tooltips (CLAUDE.md §5). Rendered in a fixed viewBox and
 * scaled by CSS so it stays sharp at any card width without a resize observer.
 */
export function LineChart({
  series,
  labels,
  height = 96,
  reference,
  referenceLabel,
  className = '',
}: LineChartProps) {
  const animate = useBootAnimate()
  const delay = useBootDelay()
  const reduced = usePrefersReducedMotion()
  const draw = animate && !reduced
  const [drawn, setDrawn] = useState(!draw)
  const clipId = useId()

  const { paths, scaleY, count } = useMemo(() => {
    const all = series.flatMap((s) => s.points).filter((p): p is number => p !== null)
    const n = Math.max(...series.map((s) => s.points.length), 0)
    if (all.length === 0 || n < 2) return { paths: [], scaleY: () => 0, count: n }

    let min = Math.min(...all)
    let max = Math.max(...all)
    if (reference !== undefined) {
      min = Math.min(min, reference)
      max = Math.max(max, reference)
    }
    // A flat series would divide by zero; give it a band to sit in the middle of.
    const range = max - min || Math.max(1, Math.abs(max) * 0.02)
    const y = (v: number) => PAD_Y + (1 - (v - min) / range) * (height - PAD_Y * 2)
    const x = (i: number) => PAD_X + (i / (n - 1)) * (VIEW_W - PAD_X * 2)

    const built = series.map((s) => {
      // Split on nulls so a gap in the data is a gap in the line.
      const segments: string[] = []
      let current: string[] = []
      s.points.forEach((p, i) => {
        if (p === null) {
          if (current.length > 1) segments.push(current.join(' '))
          current = []
          return
        }
        current.push(`${current.length === 0 ? 'M' : 'L'}${x(i).toFixed(2)} ${y(p).toFixed(2)}`)
      })
      if (current.length > 1) segments.push(current.join(' '))

      const lastIndex = s.points.reduce<number>((acc, p, i) => (p !== null ? i : acc), -1)
      const lastValue = lastIndex >= 0 ? (s.points[lastIndex] ?? null) : null
      return {
        d: segments.join(' '),
        className: s.className ?? 'text-ink-dim',
        dashed: s.dashed ?? false,
        end:
          s.endpoint && lastValue !== null && lastValue !== undefined
            ? ([x(lastIndex), y(lastValue)] as const)
            : null,
      }
    })

    return { paths: built, scaleY: y, count: n }
  }, [series, height, reference])

  // One clip sweeping left to right draws every series together, which keeps
  // the lines comparable as they arrive — staggering them would imply an
  // ordering the data doesn't have. The flip happens a frame after mount so
  // the browser has a zero-width rect to transition away from.
  useLayoutEffect(() => {
    if (!draw) return
    const raf = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(raf)
  }, [draw])

  if (paths.length === 0 || count < 2) {
    return (
      <p className={`py-6 text-center text-label text-ink-faint ${className}`}>Not enough data yet</p>
    )
  }

  const refY = reference !== undefined ? scaleY(reference) : null

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        aria-hidden="true"
      >
        <defs>
          <clipPath id={clipId}>
            <rect
              x="0"
              y="0"
              height={height}
              width={VIEW_W}
              style={
                draw
                  ? {
                      transform: drawn ? 'scaleX(1)' : 'scaleX(0)',
                      transformOrigin: 'left',
                      transition: `transform ${DRAW_MS}ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
                    }
                  : undefined
              }
            />
          </clipPath>
        </defs>

        {refY !== null && (
          <line
            x1={PAD_X}
            y1={refY}
            x2={VIEW_W - PAD_X}
            y2={refY}
            stroke="#2A3A3D"
            strokeWidth={0.5}
            strokeDasharray="3 3"
          />
        )}

        <g clipPath={`url(#${clipId})`}>
          {paths.map((p, i) => (
            <g key={i} className={p.className}>
              <path
                d={p.d}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={p.dashed ? '2 3' : undefined}
                vectorEffect="non-scaling-stroke"
              />
              {p.end && <circle cx={p.end[0]} cy={p.end[1]} r={2.5} fill="currentColor" />}
            </g>
          ))}
        </g>
      </svg>

      {(labels || referenceLabel) && (
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-label font-mono tabular-nums text-ink-faint">{labels?.[0]}</span>
          {referenceLabel && <span className="text-label text-ink-faint">{referenceLabel}</span>}
          <span className="text-label font-mono tabular-nums text-ink-faint">{labels?.[1]}</span>
        </div>
      )}
    </div>
  )
}
