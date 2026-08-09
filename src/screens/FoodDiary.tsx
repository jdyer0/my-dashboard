import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BootItem, BootSequence } from '../motion/BootSequence'
import { CountUp } from '../motion/CountUp'
import { Ring } from '../motion/Ring'
import { Bar } from '../motion/Bar'
import { useFoodData } from '../food/useFoodData'
import { saveProgram } from '../food/data'
import { FIBRE_TARGET_G, nutrientTotal } from '../lib/nutrition'
import { litres } from '../lib/hydration'
import { BUTTON, BUTTON_TILE, CARD, LoadFailed, MacroRow, ProfilePrompt } from './FoodParts'
import { COL, SPLIT } from '../shell/PageHeader'
import type { FoodLogEntry } from '../food/types'

const MEALS: { key: FoodLogEntry['meal']; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snacks' },
]

const ORIGIN_CAPTION: Record<'coached' | 'manual' | 'default', string> = {
  coached: 'coached targets',
  manual: 'your targets',
  default: 'guideline targets, until the coach has data',
}

/**
 * The diary. The check-in card is offered rather than applied: once a week the
 * coach has enough new weight and intake data to re-read expenditure and
 * proposes the targets that follow. Accepting is one tap; ignoring it leaves
 * last week's numbers in place, which is the point of a weekly cadence.
 */
export function FoodDiary() {
  const navigate = useNavigate()
  const { data, failed, reload } = useFoodData()
  const [accepting, setAccepting] = useState(false)
  const [acceptFailed, setAcceptFailed] = useState(false)

  if (failed) return <LoadFailed what="your food log" onRetry={reload} />
  if (!data) return null

  const { coach, todayEntries, settings } = data
  const targets = coach.targets

  const loggedFoods = todayEntries.map((e) => ({ nutrients: e.nutrients }))
  const kcal = nutrientTotal(loggedFoods, 'energy_kcal').value
  const protein = nutrientTotal(loggedFoods, 'protein').value
  const carbs = nutrientTotal(loggedFoods, 'carbohydrate').value
  const fat = nutrientTotal(loggedFoods, 'fat').value
  const fibre = nutrientTotal(loggedFoods, 'fibre').value

  const kcalTarget = targets?.kcalTarget ?? null
  const remaining = kcalTarget !== null ? kcalTarget - kcal : null
  // Within 5% either way is "on target" — a diary that only turns teal at the
  // exact number would never turn teal.
  const onTarget =
    kcalTarget !== null && Math.abs(kcal - kcalTarget) <= kcalTarget * 0.05
  const over = kcalTarget !== null && kcal > kcalTarget * 1.05
  const ringTone = onTarget ? 'text-live' : over ? 'text-warn' : 'text-ink-dim'

  const checkInReady = coach.checkInFrom !== null && coach.proposed !== null
  const waterMl = data.todayWaterMl
  const waterTarget = settings.hydration_target_ml

  async function acceptCheckIn() {
    if (!data || !coach.checkInFrom || !coach.proposed || accepting) return
    setAccepting(true)
    setAcceptFailed(false)
    try {
      await saveProgram({
        effective_from: coach.checkInFrom,
        kcal_target: coach.proposed.kcalTarget,
        protein_g_target: coach.proposed.proteinTargetG,
        carb_g_target: coach.proposed.carbTargetG,
        fat_g_target: coach.proposed.fatTargetG,
        expenditure_kcal: coach.expenditure ? Math.round(coach.expenditure.kcal) : null,
        trend_weight_kg: coach.trendWeightKg,
        source: 'coached',
      })
      reload()
    } catch {
      setAcceptFailed(true)
    } finally {
      setAccepting(false)
    }
  }

  return (
    <BootSequence>
      {!targets && (
        <BootItem className="mb-2.5">
          <ProfilePrompt onSaved={reload} />
        </BootItem>
      )}

      {targets && settings.program_mode === 'coached' && checkInReady && coach.proposed && (
        <BootItem className={`mb-2.5 ${CARD}`}>
          <div className="flex items-baseline justify-between">
            <h2 className="text-card-title text-ink">Check-in ready</h2>
            <span className="text-label text-ink-faint">
              {coach.expenditure ? `${Math.round(coach.expenditure.kcal)} kcal burned/day` : ''}
            </span>
          </div>
          <p className="mt-1 text-body text-ink-dim">
            {coach.latestProgram
              ? `Your targets move from ${coach.latestProgram.kcal_target} to ${coach.proposed.kcalTarget} kcal.`
              : `Your first coached targets: ${coach.proposed.kcalTarget} kcal.`}
          </p>
          <div className="mt-2 flex gap-4 text-label font-mono tabular-nums text-ink-dim">
            <span>P {coach.proposed.proteinTargetG}</span>
            <span>C {coach.proposed.carbTargetG}</span>
            <span>F {coach.proposed.fatTargetG}</span>
          </div>
          <button
            type="button"
            onClick={() => void acceptCheckIn()}
            disabled={accepting}
            className={`mt-3 ${BUTTON}`}
          >
            {accepting ? 'Applying' : 'Use these targets'}
          </button>
          {acceptFailed && (
            <p className="mt-2 text-body text-alert">Couldn't apply the check-in. Try again.</p>
          )}
          <Link
            to="/food/program"
            className="mt-2 block text-center text-label text-ink-faint underline decoration-line-bright"
          >
            Adjust the goal first
          </Link>
        </BootItem>
      )}

      <div className={SPLIT}>
      <div className={COL}>
      <BootItem className={CARD}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-card-title text-ink">Today</h2>
          <Link
            to="/food/program"
            className="text-label text-ink-faint underline decoration-line-bright"
          >
            {targets ? ORIGIN_CAPTION[targets.origin] : 'Set up'}
          </Link>
        </div>

        <div className="mt-3 flex items-center gap-4">
          <Ring
            value={kcal}
            max={kcalTarget ?? Math.max(kcal, 1)}
            className={ringTone}
            overshoot={over}
          >
            <span
              className={`text-metric font-mono tabular-nums ${onTarget ? 'glow-live text-live' : 'text-ink'}`}
            >
              <CountUp value={remaining !== null ? Math.abs(remaining) : kcal} />
            </span>
            <span className="mt-0.5 text-label text-ink-faint">
              {remaining === null ? 'kcal in' : remaining >= 0 ? 'kcal left' : 'kcal over'}
            </span>
          </Ring>

          <div className="min-w-0 flex-1 space-y-2.5">
            {targets ? (
              <>
                <MacroRow label="Protein" value={protein} target={targets.proteinTargetG} accent />
                <MacroRow label="Carbohydrate" value={carbs} target={targets.carbTargetG} />
                <MacroRow label="Fat" value={fat} target={targets.fatTargetG} />
                <MacroRow label="Fibre" value={fibre} target={FIBRE_TARGET_G} />
              </>
            ) : (
              <p className="text-body text-ink-dim">
                <CountUp value={Math.round(kcal)} /> kcal logged
              </p>
            )}
          </div>
        </div>

        {kcalTarget !== null && (
          <p className="mt-3 border-t border-line pt-2 text-label font-mono tabular-nums text-ink-faint">
            {Math.round(kcal)} eaten · {kcalTarget} target
            {coach.expenditure ? ` · ${Math.round(coach.expenditure.kcal)} burned` : ''}
          </p>
        )}
      </BootItem>

      <BootItem className={`mt-2.5 ${CARD}`}>
        <Link to="/food/water" className="block">
          <div className="flex items-baseline justify-between">
            <span className="text-card-title text-ink">Water</span>
            <span
              className={`text-metric-sm font-mono tabular-nums ${
                waterMl >= waterTarget ? 'glow-live text-live' : 'text-ink'
              }`}
            >
              <CountUp value={waterMl / 1000} decimals={1} /> / {litres(waterTarget)} L
            </span>
          </div>
          <Bar
            value={waterMl}
            max={waterTarget}
            className="mt-2"
            fillClassName={waterMl >= waterTarget ? 'bg-live shadow-glow-sm' : 'bg-ink-dim'}
            shimmer={waterMl >= waterTarget}
          />
        </Link>
      </BootItem>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <BootItem>
          <button type="button" onClick={() => navigate('/food/chat')} className={BUTTON_TILE}>
            <span className="text-body text-ink">Describe a meal</span>
            <span className="text-label text-ink-faint">
              {todayEntries.length} logged today
            </span>
          </button>
        </BootItem>
        <BootItem>
          <Link to="/food/weight" className={BUTTON_TILE}>
            <span className="text-body text-ink">
              {coach.scaleWeightKg !== null ? `${coach.scaleWeightKg.toFixed(1)} kg` : 'Log weight'}
            </span>
            <span className="text-label text-ink-faint">
              {coach.trendWeightKg !== null
                ? `trend ${coach.trendWeightKg.toFixed(1)}`
                : 'the coach needs this'}
            </span>
          </Link>
        </BootItem>
      </div>

      {/* Second-string, deliberately: describing a meal is the way in, and
          typing a label is what you reach for when the pack already has the
          numbers or the coach has run out of requests for the day. */}
      <BootItem>
        <Link
          to="/food/manual"
          className="mt-2 flex min-h-[44px] items-center justify-center text-label text-ink-faint underline decoration-line-bright"
        >
          Enter the numbers by hand
        </Link>
      </BootItem>
      </div>

      {/* Meals take the second column: the totals stay put while the day's
          entries grow down beside them. */}
      <div className={`${COL} lg:[&>*:first-child]:mt-0`}>
      {todayEntries.length > 0 ? (
        MEALS.map(({ key, label }) => {
          const entries = todayEntries.filter((e) => e.meal === key)
          if (entries.length === 0) return null
          const mealKcal = nutrientTotal(
            entries.map((e) => ({ nutrients: e.nutrients })),
            'energy_kcal',
          ).value
          return (
            <BootItem key={key} className={`mt-2.5 ${CARD}`}>
              <div className="flex items-baseline justify-between">
                <h2 className="text-card-title text-ink">{label}</h2>
                <span className="text-label font-mono tabular-nums text-ink-faint">
                  {Math.round(mealKcal)} kcal
                </span>
              </div>
              <ul className="mt-1">
                {entries.map((entry) => {
                  const entryKcal = entry.nutrients.energy_kcal
                  return (
                    <li key={entry.id}>
                      <Link
                        to={`/food/entry/${entry.id}`}
                        className="flex min-h-[44px] items-center justify-between border-b border-line py-2 last:border-b-0"
                      >
                        <span className="min-w-0 flex-1 truncate pr-3 text-body text-ink-dim">
                          {entry.name}
                        </span>
                        <span className="shrink-0 text-label font-mono tabular-nums text-ink-faint">
                          {Math.round(entry.amount_g)} g
                          {entryKcal && !entryKcal.is_trace
                            ? ` · ${Math.round(entryKcal.value)} kcal`
                            : ''}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </BootItem>
          )
        })
      ) : (
        <BootItem>
          <p className="py-12 text-center text-body text-ink-dim">Log your first meal</p>
        </BootItem>
      )}
      </div>
      </div>
    </BootSequence>
  )
}
