import { useState } from 'react'
import { BootItem, BootSequence } from '../motion/BootSequence'
import { CountUp } from '../motion/CountUp'
import { LineChart } from '../motion/LineChart'
import { deleteWeight, saveWeight } from '../food/data'
import { useFoodData } from '../food/useFoodData'
import { daysBetween } from '../lib/adaptive'
import { BUTTON_INLINE, CARD, FoodPush, LoadFailed, StatRow, UnitField } from './FoodParts'
import { COL, SPLIT } from '../shell/PageHeader'
import { signedKg } from '../food/format'

const dayLabel = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

function label(dayKey: string): string {
  return dayLabel.format(new Date(`${dayKey}T12:00:00Z`))
}

export function FoodWeight() {
  const { data, failed, reload } = useFoodData()
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionFailed, setActionFailed] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  if (failed)
    return (
      <FoodPush title="Weight">
        <LoadFailed what="your weigh-ins" onRetry={reload} />
      </FoodPush>
    )
  if (!data) return null

  const { coach, today, weights } = data
  const trend = coach.trend
  const latest = trend[trend.length - 1] ?? null
  const loggedToday = weights.some((w) => w.day === today)

  const kg = Number(input.replace(',', '.'))
  const valid = Number.isFinite(kg) && kg > 20 && kg < 400

  // Change over the last week, measured on the trend rather than the scale —
  // comparing two single readings a week apart is comparing two coin flips.
  const weekAgo = [...trend].reverse().find((p) => daysBetween(p.day, today) >= 7) ?? null
  const weekChange = latest && weekAgo ? latest.trendKg - weekAgo.trendKg : null

  async function log() {
    if (!valid || busy) return
    setBusy(true)
    setActionFailed(null)
    try {
      await saveWeight(today, Math.round(kg * 100) / 100)
      setInput('')
      reload()
    } catch {
      setActionFailed("Couldn't save that weigh-in. Try again.")
    } finally {
      setBusy(false)
    }
  }

  async function remove(day: string) {
    if (busy) return
    if (confirmDelete !== day) {
      setConfirmDelete(day)
      return
    }
    setBusy(true)
    setActionFailed(null)
    try {
      await deleteWeight(day)
      setConfirmDelete(null)
      reload()
    } catch {
      setActionFailed("Couldn't remove that weigh-in. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const recent = [...trend].reverse().slice(0, 30)
  const chartPoints = trend.slice(-60)

  return (
    <FoodPush title="Weight" subtitle="What the coach reads your expenditure from">
      <BootSequence>
      <div className={SPLIT}>
      <div className={COL}>
      {latest && (
        <BootItem className={CARD}>
          <div className="flex items-baseline gap-3">
            <p className="glow-ink text-metric text-ink">
              <CountUp value={latest.trendKg} decimals={1} />
            </p>
            <p className="text-label font-mono tabular-nums text-ink-faint">
              kg trend · {latest.kg.toFixed(1)} on the scale
            </p>
          </div>
          <div className="mt-2">
            <StatRow label="Trend change" hint="last 7 days">
              {weekChange === null ? (
                <span className="text-ink-faint">not enough history</span>
              ) : (
                `${signedKg(weekChange)} kg`
              )}
            </StatRow>
            {coach.expenditure && (
              <StatRow label="Rate" hint={`last ${coach.expenditure.windowDays} days`}>
                {signedKg(coach.expenditure.ratePerWeekKg)} kg/wk
              </StatRow>
            )}
            <StatRow label="Weigh-ins" hint="last 90 days">
              {weights.length}
            </StatRow>
          </div>
          {chartPoints.length >= 2 && (
            <LineChart
              className="mt-2"
              height={80}
              series={[
                {
                  points: chartPoints.map((p) => p.kg),
                  className: 'text-ink-faint',
                  dashed: true,
                },
                {
                  points: chartPoints.map((p) => p.trendKg),
                  className: 'text-live',
                  endpoint: true,
                },
              ]}
              referenceLabel="trend · scale"
            />
          )}
        </BootItem>
      )}

      <BootItem className={latest ? `mt-2.5 ${CARD}` : CARD}>
        <h2 className="text-card-title text-ink">
          {loggedToday ? "Correct today's weigh-in" : "Log today's weight"}
        </h2>
        <div className="mt-2 flex items-center gap-2">
          <UnitField
            id="weight-kg"
            label="Weight in kilograms"
            unit="kg"
            value={input}
            placeholder={latest ? latest.kg.toFixed(1) : '84.0'}
            onChange={setInput}
          />
          <button
            type="button"
            onClick={() => void log()}
            disabled={busy || !valid}
            className={BUTTON_INLINE}
          >
            Save
          </button>
        </div>
        <p className="mt-2 text-label text-ink-faint">
          Weigh in first thing, after the loo, before eating. Day-to-day noise is water, not fat —
          the coach reads the trend.
        </p>
        {actionFailed && <p className="mt-2 text-body text-alert">{actionFailed}</p>}
      </BootItem>
      </div>

      <div className={COL}>
      <BootItem className={`mt-2.5 ${CARD} lg:mt-0`}>
        <h2 className="text-card-title text-ink">History</h2>
        {recent.length === 0 ? (
          <p className="py-8 text-center text-body text-ink-dim">Step on the scale to start</p>
        ) : (
          <>
            {/* Column heads, so the two numbers in each row don't have to
                label themselves. */}
            <div className="mt-2 flex items-center gap-3 border-b border-line pb-1.5">
              <span className="flex-1 text-label text-ink-faint">Day</span>
              <span className="w-12 text-right text-label text-ink-faint">Scale</span>
              <span className="w-12 text-right text-label text-ink-faint">Trend</span>
              <span className="w-11 shrink-0" aria-hidden="true" />
            </div>
            <ul>
              {recent.map((point) => (
                <li
                  key={point.day}
                  className="flex min-h-[44px] items-center gap-3 border-b border-line last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate text-body text-ink-dim">
                    {label(point.day)}
                    {point.day === today && (
                      <span className="ml-2 text-label text-live">today</span>
                    )}
                  </span>
                  <span className="w-12 text-right text-body font-mono tabular-nums text-ink">
                    {point.kg.toFixed(1)}
                  </span>
                  <span className="w-12 text-right text-body font-mono tabular-nums text-ink-faint">
                    {point.trendKg.toFixed(1)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void remove(point.day)}
                    disabled={busy}
                    aria-label={
                      confirmDelete === point.day
                        ? `Confirm removing the weigh-in for ${label(point.day)}`
                        : `Remove weigh-in for ${label(point.day)}`
                    }
                    className={`flex h-11 w-11 shrink-0 items-center justify-center text-body transition-transform duration-150 ease-instrument active:scale-[0.98] ${
                      confirmDelete === point.day ? 'text-alert' : 'text-ink-faint'
                    }`}
                  >
                    {confirmDelete === point.day ? '✓' : '✕'}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </BootItem>
      </div>
      </div>
      </BootSequence>
    </FoodPush>
  )
}
