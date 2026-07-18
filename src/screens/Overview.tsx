import type { ReactNode } from 'react'
import { BootSequence, BootItem } from '../motion/BootSequence'
import { CountUp } from '../motion/CountUp'
import { Sparkline } from '../motion/Sparkline'
import { Bar } from '../motion/Bar'
import { SyncDot } from '../motion/SyncDot'

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/London',
})

// Placeholder values — Phase 0 proves the layout and motion; real data
// replaces these as each module lands.
const placeholder = {
  sessions: 3,
  kcal: 1842,
  balancePence: 243152,
  strengthTrend: [92.5, 94, 93.5, 95, 96.5, 96, 97.5, 99, 98.5, 100, 101.5, 102.5],
  proteinG: 121,
  proteinTargetG: 150,
  steps: 8420,
  stepsTarget: 10000,
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
            <CountUp value={placeholder.sessions} />
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
          <div className="mt-2 flex items-end justify-between">
            <div>
              <p className="text-metric text-ink">
                <CountUp value={102.5} decimals={1} />
              </p>
              <p className="mt-0.5 text-label text-ink-faint">e1RM kg, best lift</p>
            </div>
            <Sparkline points={placeholder.strengthTrend} className="text-ink-dim" />
          </div>
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
