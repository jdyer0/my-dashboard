import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BootItem, BootSequence } from '../motion/BootSequence'
import { CountUp } from '../motion/CountUp'
import { LineChart } from '../motion/LineChart'
import { useFoodData } from '../food/useFoodData'
import { dailyEnergy, EXPENDITURE_WINDOW_DAYS } from '../food/targets'
import { MIN_LOGGED_DAYS, MIN_WEIGH_INS, type GoalStatus } from '../lib/adaptive'
import { nutrientTotal } from '../lib/nutrition'
import { londonDayKey } from '../lib/londonDay'
import { CARD, LoadFailed, StatRow } from './FoodParts'
import { signedKg } from '../food/format'

const RANGES = [
  { days: 30, label: '30d' },
  { days: 60, label: '60d' },
  { days: 90, label: '90d' },
] as const

const STATUS_COPY: Record<GoalStatus, string> = {
  'on-track': 'on track',
  faster: 'moving faster than the goal',
  slower: 'moving slower than the goal',
  unknown: 'not enough data yet',
}

const STATUS_TONE: Record<GoalStatus, string> = {
  'on-track': 'text-live',
  faster: 'text-warn',
  slower: 'text-warn',
  unknown: 'text-ink-faint',
}

/** Short day label, e.g. '3 Jul'. */
const shortDay = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

function labelFor(dayKey: string): string {
  return shortDay.format(new Date(`${dayKey}T12:00:00Z`))
}

export function FoodTrends() {
  const { data, failed, reload } = useFoodData()
  const [rangeDays, setRangeDays] = useState<number>(30)

  if (failed) return <LoadFailed what="your trends" onRetry={reload} />
  if (!data) return null

  const { coach, dayKeys, log, hydrationDays, settings } = data
  const windowKeys = dayKeys.slice(-rangeDays)
  const first = windowKeys[0]
  const last = windowKeys[windowKeys.length - 1]

  // Weight: the trend is the signal, the scale readings are the scatter it was
  // drawn through. Both are plotted so the smoothing is visible rather than
  // asked to be trusted.
  const trendByDay = new Map(coach.trend.map((p) => [p.day, p]))
  const trendPoints = windowKeys.map((d) => trendByDay.get(d)?.trendKg ?? null)
  const scalePoints = windowKeys.map((d) => trendByDay.get(d)?.kg ?? null)

  const energy = dailyEnergy(log, windowKeys)
  const intakePoints = energy.map((d) => d.kcal)
  const loggedDays = energy.filter((d) => d.kcal !== null).length
  const meanIntake =
    loggedDays > 0
      ? energy.reduce((s, d) => s + (d.kcal ?? 0), 0) / loggedDays
      : null

  const waterPoints = hydrationDays.slice(-rangeDays).map((d) => d.totalMl / 1000)

  // Macro averages over the logged days in the window. Dividing by logged days
  // rather than by the range means an unlogged day doesn't drag the average
  // down as though nothing was eaten (CLAUDE.md §7).
  const windowSet = new Set(windowKeys)
  const windowEntries = log
    .filter((e) => windowSet.has(londonDayKey(new Date(e.logged_at))))
    .map((e) => ({ nutrients: e.nutrients }))
  const macroAvg = (key: string) =>
    loggedDays > 0 ? nutrientTotal(windowEntries, key).value / loggedDays : null

  const exp = coach.expenditure
  const targets = coach.targets

  return (
    <BootSequence>
      <BootItem className="mb-2.5">
        <div className="grid grid-cols-3 gap-2">
          {RANGES.map(({ days, label }) => (
            <button
              key={days}
              type="button"
              onClick={() => setRangeDays(days)}
              className={`h-11 rounded-ctl border text-label transition-transform duration-150 ease-instrument active:scale-[0.98] ${
                rangeDays === days
                  ? 'border-line-bright bg-surface-raised text-ink'
                  : 'border-line bg-surface text-ink-dim'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </BootItem>

      {/* Expenditure — the number the whole engine exists to produce. */}
      <BootItem className={CARD}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-card-title text-ink">Expenditure</h2>
          <span className="text-label text-ink-faint">
            {EXPENDITURE_WINDOW_DAYS}-day energy balance
          </span>
        </div>
        {exp ? (
          <>
            <div className="mt-2 flex items-baseline gap-2">
              <p className="glow-ink text-metric text-ink">
                <CountUp value={Math.round(exp.kcal)} />
              </p>
              <p className="text-label font-mono tabular-nums text-ink-faint">
                kcal/day ± {Math.round(exp.errorKcal)}
              </p>
            </div>
            <p className="mt-1 text-body text-ink-dim">
              From {exp.loggedDays} logged days and {exp.weighIns} weigh-ins over {exp.windowDays}{' '}
              days.
            </p>
            <div className="mt-2 border-t border-line pt-1">
              <StatRow label="Trend change" hint="per week">
                <span className={STATUS_TONE[coach.status]}>
                  {signedKg(exp.ratePerWeekKg)} kg
                </span>
              </StatRow>
              <StatRow label="Goal" hint={`${signedKg(Number(settings.goal_rate_kg_per_week))} kg/wk`}>
                <span className={`text-body ${STATUS_TONE[coach.status]}`}>
                  {STATUS_COPY[coach.status]}
                </span>
              </StatRow>
            </div>
          </>
        ) : (
          <p className="mt-2 text-body text-ink-dim">
            The coach needs {MIN_LOGGED_DAYS} logged days and {MIN_WEIGH_INS} weigh-ins spread over
            a fortnight before it can read your expenditure.{' '}
            <Link to="/food/weight" className="text-ink underline decoration-line-bright">
              Log today's weight
            </Link>
          </p>
        )}
      </BootItem>

      {/* Weight: trend against scale. */}
      <BootItem className={`mt-2.5 ${CARD}`}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-card-title text-ink">Weight</h2>
          <Link
            to="/food/weight"
            className="text-label text-ink-faint underline decoration-line-bright"
          >
            Log
          </Link>
        </div>
        <div className="mt-2 flex items-baseline gap-3">
          <p className="glow-ink text-metric text-ink">
            <CountUp value={coach.trendWeightKg ?? 0} decimals={1} />
          </p>
          <p className="text-label font-mono tabular-nums text-ink-faint">
            kg trend
            {coach.scaleWeightKg !== null && ` · ${coach.scaleWeightKg.toFixed(1)} on the scale`}
          </p>
        </div>
        <LineChart
          className="mt-2"
          series={[
            { points: scalePoints, className: 'text-ink-faint', dashed: true },
            { points: trendPoints, className: 'text-live', endpoint: true },
          ]}
          labels={first && last ? [labelFor(first), labelFor(last)] : undefined}
          referenceLabel="trend · scale"
        />
      </BootItem>

      {/* Intake against the target the user is actually eating to. */}
      <BootItem className={`mt-2.5 ${CARD}`}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-card-title text-ink">Intake</h2>
          <span className="text-label font-mono tabular-nums text-ink-faint">
            {loggedDays}/{rangeDays} days logged
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-3">
          <p className="glow-ink text-metric text-ink">
            <CountUp value={meanIntake !== null ? Math.round(meanIntake) : 0} />
          </p>
          <p className="text-label font-mono tabular-nums text-ink-faint">
            kcal/day average{targets ? ` · ${targets.kcalTarget} target` : ''}
          </p>
        </div>
        <LineChart
          className="mt-2"
          series={[{ points: intakePoints, className: 'text-ink-dim', endpoint: true }]}
          reference={targets?.kcalTarget}
          labels={first && last ? [labelFor(first), labelFor(last)] : undefined}
          referenceLabel={targets ? 'dashed: target' : undefined}
        />
        <div className="mt-2 border-t border-line pt-1">
          {(
            [
              ['Protein', 'protein', 'g'],
              ['Carbohydrate', 'carbohydrate', 'g'],
              ['Fat', 'fat', 'g'],
              ['Fibre', 'fibre', 'g'],
            ] as const
          ).map(([label, key, unit]) => {
            const avg = macroAvg(key)
            return (
              <StatRow key={key} label={label} hint="daily average">
                {avg === null ? (
                  <span className="text-ink-faint">no data</span>
                ) : (
                  `${Math.round(avg)} ${unit}`
                )}
              </StatRow>
            )
          })}
        </div>
      </BootItem>

      {/* Water gets a trend line too — it's the habit most improved by seeing it. */}
      <BootItem className={`mt-2.5 ${CARD}`}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-card-title text-ink">Water</h2>
          <Link
            to="/food/water"
            className="text-label text-ink-faint underline decoration-line-bright"
          >
            Log
          </Link>
        </div>
        <LineChart
          className="mt-2"
          height={72}
          series={[{ points: waterPoints, className: 'text-ink-dim', endpoint: true }]}
          reference={settings.hydration_target_ml / 1000}
          labels={first && last ? [labelFor(first), labelFor(last)] : undefined}
          referenceLabel="dashed: target"
        />
      </BootItem>
    </BootSequence>
  )
}
