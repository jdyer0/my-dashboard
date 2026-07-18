import { useEffect, useState, type ReactNode } from 'react'
import { BootSequence, BootItem } from '../motion/BootSequence'
import { CountUp } from '../motion/CountUp'
import { Sparkline } from '../motion/Sparkline'
import { Bar } from '../motion/Bar'
import { SyncDot } from '../motion/SyncDot'
import { listAllSets, listExercises, listSessions } from '../gym/data'
import { bestLifts, bestPerSession } from '../gym/e1rm'
import { inLondonWeek } from '../lib/londonDay'

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/London',
})

// Placeholder values — real data replaces these as each module lands.
// Gym (Phase 1) is live; kcal, balance, protein and steps wait for
// Phases 2–4.
const placeholder = {
  kcal: 1842,
  balancePence: 243152,
  proteinG: 121,
  proteinTargetG: 150,
  steps: 8420,
  stepsTarget: 10000,
}

interface Strength {
  sessionsThisWeek: number
  bestName: string | null
  bestE1rmKg: number
  trend: number[]
}

function useStrength(): Strength {
  const [strength, setStrength] = useState<Strength>({
    sessionsThisWeek: 0,
    bestName: null,
    bestE1rmKg: 0,
    trend: [],
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [sessions, sets, exercises] = await Promise.all([
          listSessions(),
          listAllSets(),
          listExercises(),
        ])
        if (cancelled) return
        const now = new Date()
        const sessionsThisWeek = sessions.filter((s) => inLondonWeek(s.started_at, now)).length
        const best = bestLifts(sets)[0]
        setStrength({
          sessionsThisWeek,
          bestName: best
            ? (exercises.find((e) => e.id === best.exerciseId)?.name ?? null)
            : null,
          bestE1rmKg: best?.e1rmKg ?? 0,
          trend: best ? bestPerSession(sets, best.exerciseId).slice(-12) : [],
        })
      } catch {
        // The overview stays quiet on failure — zeros, no error banner.
        // The gym tab is where a load failure gets surfaced and retried.
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return strength
}

function MetricTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <BootItem className="rounded-card border border-line bg-surface px-2 py-2.5">
      <p className="text-label text-ink-faint">{label}</p>
      <p className="mt-1 text-metric-sm text-ink">{children}</p>
    </BootItem>
  )
}

function TargetRow({
  label,
  value,
  max,
  unit,
}: {
  label: string
  value: number
  max: number
  unit: string
}) {
  const onTarget = value >= max
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-label text-ink-faint">{label}</span>
        <span className={`text-label ${onTarget ? 'text-live' : 'text-ink-dim'}`}>
          <CountUp value={value} /> / {max.toLocaleString('en-GB')} {unit}
        </span>
      </div>
      <Bar
        value={value}
        max={max}
        className="mt-1.5"
        fillClassName={onTarget ? 'bg-live' : 'bg-warn'}
      />
    </div>
  )
}

export function Overview() {
  const today = dateFormat.format(new Date())
  const strength = useStrength()

  return (
    <BootSequence>
      <div className="mx-auto max-w-md">
        <BootItem>
          <header className="flex items-center justify-between pb-2 pt-2">
            <h1 className="text-screen-title text-ink">{today}</h1>
            <span className="flex items-center gap-1.5 text-label text-ink-faint">
              <SyncDot state="synced" />
              synced
            </span>
          </header>
        </BootItem>

        <div className="grid grid-cols-3 gap-2">
          <MetricTile label="Sessions">
            <CountUp value={strength.sessionsThisWeek} />
          </MetricTile>
          <MetricTile label="Kcal today">
            <CountUp value={placeholder.kcal} />
          </MetricTile>
          <MetricTile label="Balance">
            <CountUp value={placeholder.balancePence / 100} format={(n) => gbp.format(n)} />
          </MetricTile>
        </div>

        <BootItem className="mt-2.5 rounded-card border border-line bg-surface p-3">
          <h2 className="text-card-title text-ink">Strength</h2>
          {strength.bestName ? (
            <div className="mt-2 flex items-end justify-between">
              <div>
                <p className="text-metric text-ink">
                  <CountUp value={strength.bestE1rmKg} decimals={1} />
                </p>
                <p className="mt-0.5 text-label text-ink-faint">
                  e1RM kg, {strength.bestName.toLowerCase()}
                </p>
              </div>
              {strength.trend.length >= 2 && (
                <Sparkline points={strength.trend} className="text-ink-dim" />
              )}
            </div>
          ) : (
            <p className="mt-2 text-body text-ink-dim">Log your first workout</p>
          )}
        </BootItem>

        <BootItem className="mt-2.5 rounded-card border border-line bg-surface p-3">
          <h2 className="text-card-title text-ink">Today</h2>
          <div className="mt-3 space-y-3">
            <TargetRow
              label="Protein"
              value={placeholder.proteinG}
              max={placeholder.proteinTargetG}
              unit="g"
            />
            <TargetRow
              label="Steps"
              value={placeholder.steps}
              max={placeholder.stepsTarget}
              unit=""
            />
          </div>
        </BootItem>
      </div>
    </BootSequence>
  )
}
