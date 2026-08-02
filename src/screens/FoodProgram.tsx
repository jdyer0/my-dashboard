import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BootItem, BootSequence } from '../motion/BootSequence'
import { CountUp } from '../motion/CountUp'
import { saveProgram, saveSettings } from '../food/data'
import { useFoodData } from '../food/useFoodData'
import { KCAL_PER_KG, macroEnergy, programTargets } from '../lib/adaptive'
import { londonWeekStartKey } from '../lib/londonDay'
import { BUTTON, CARD, FoodPush, LoadFailed, ProfilePrompt, StatRow } from './FoodParts'
import { signedKg } from '../food/format'
import type { ProgramMode } from '../food/types'

/** Goal rates the coach offers, kg per week. Faster than a kilo a week isn't a
    diet, and faster than half a kilo on the way up is mostly fat, so the list
    stops at both ends rather than letting the arithmetic run. */
const RATES = [
  { kg: -1, tick: '−1.0', word: 'fast', sentence: 'Lose fast' },
  { kg: -0.75, tick: '−0.75', word: 'quick', sentence: 'Lose quickly' },
  { kg: -0.5, tick: '−0.5', word: 'steady', sentence: 'Lose steadily' },
  { kg: -0.25, tick: '−0.25', word: 'slow', sentence: 'Lose slowly' },
  { kg: 0, tick: '0', word: 'hold', sentence: 'Maintain' },
  { kg: 0.25, tick: '+0.25', word: 'lean', sentence: 'Gain slowly' },
  { kg: 0.5, tick: '+0.5', word: 'gain', sentence: 'Gain' },
] as const

const MANUAL_FIELDS = [
  { key: 'kcal', label: 'Calories', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carb', label: 'Carbohydrate', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
] as const

type FieldKey = (typeof MANUAL_FIELDS)[number]['key']

const longDay = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

function dayLabel(key: string): string {
  return longDay.format(new Date(`${key}T12:00:00Z`))
}

export function FoodProgram() {
  const { data, failed, reload } = useFoodData()
  const [busy, setBusy] = useState(false)
  const [actionFailed, setActionFailed] = useState<string | null>(null)
  const [manual, setManual] = useState<Record<FieldKey, string> | null>(null)

  // Seed the manual fields from whatever the user is currently eating to, so
  // switching to manual starts from the coached numbers rather than blank.
  useEffect(() => {
    if (!data?.coach.targets || manual !== null) return
    const t = data.coach.targets
    setManual({
      kcal: String(Math.round(t.kcalTarget)),
      protein: String(Math.round(t.proteinTargetG)),
      carb: String(Math.round(t.carbTargetG)),
      fat: String(Math.round(t.fatTargetG)),
    })
  }, [data, manual])

  if (failed)
    return (
      <FoodPush title="Program">
        <LoadFailed what="your program" onRetry={reload} />
      </FoodPush>
    )
  if (!data) return null

  const { settings, coach, programs } = data

  if (!coach.targets) {
    return (
      <FoodPush title="Program">
        <ProfilePrompt onSaved={reload} />
      </FoodPush>
    )
  }

  const mode = settings.program_mode
  const goalRate = Number(settings.goal_rate_kg_per_week)
  const proteinPerKg = Number(settings.protein_g_per_kg)
  const fatPct = Number(settings.fat_pct_energy)

  // Live preview: what the current settings would issue right now.
  const preview =
    coach.expenditure && coach.trendWeightKg !== null
      ? programTargets({
          expenditureKcal: coach.expenditure.kcal,
          goalRateKgPerWeek: goalRate,
          trendWeightKg: coach.trendWeightKg,
          proteinGPerKg: proteinPerKg,
          fatPctEnergy: fatPct,
        })
      : null

  async function patch(fields: Parameters<typeof saveSettings>[0]) {
    if (busy) return
    setBusy(true)
    setActionFailed(null)
    try {
      await saveSettings(fields)
      reload()
    } catch {
      setActionFailed("Couldn't save that. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const parsedManual = manual
    ? {
        kcal: Number(manual.kcal.replace(',', '.')),
        protein: Number(manual.protein.replace(',', '.')),
        carb: Number(manual.carb.replace(',', '.')),
        fat: Number(manual.fat.replace(',', '.')),
      }
    : null
  const manualValid =
    parsedManual !== null &&
    Number.isFinite(parsedManual.kcal) &&
    parsedManual.kcal > 0 &&
    Number.isFinite(parsedManual.protein) &&
    parsedManual.protein > 0 &&
    Number.isFinite(parsedManual.carb) &&
    parsedManual.carb >= 0 &&
    Number.isFinite(parsedManual.fat) &&
    parsedManual.fat > 0

  const manualEnergy = parsedManual
    ? macroEnergy({
        proteinG: parsedManual.protein,
        carbG: parsedManual.carb,
        fatG: parsedManual.fat,
      })
    : 0

  async function saveManual() {
    if (!parsedManual || !manualValid || busy) return
    setBusy(true)
    setActionFailed(null)
    try {
      await saveSettings({
        program_mode: 'manual',
        kcal_target: Math.round(parsedManual.kcal),
        protein_g_target: parsedManual.protein,
        carb_g_target: parsedManual.carb,
        fat_g_target: parsedManual.fat,
      })
      // Recorded as a check-in too, so the history reads as one timeline
      // whether the coach or the user set the numbers.
      await saveProgram({
        effective_from: londonWeekStartKey(new Date()),
        kcal_target: Math.round(parsedManual.kcal),
        protein_g_target: parsedManual.protein,
        carb_g_target: parsedManual.carb,
        fat_g_target: parsedManual.fat,
        expenditure_kcal: null,
        trend_weight_kg: null,
        source: 'manual',
      })
      reload()
    } catch {
      setActionFailed("Couldn't save your targets. Check the numbers and try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <FoodPush title="Program" subtitle="Goal, macro split and check-in history">
      <BootSequence>
      <BootItem className={CARD}>
        <h2 className="text-card-title text-ink">How targets are set</h2>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(
            [
              ['coached', 'Coached'],
              ['manual', 'Manual'],
            ] as [ProgramMode, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => void patch({ program_mode: value })}
              disabled={busy}
              className={`h-11 rounded-ctl border text-body transition-transform duration-150 ease-instrument active:scale-[0.98] ${
                mode === value
                  ? 'border-line-bright bg-surface-raised text-ink'
                  : 'border-line bg-surface text-ink-dim'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-body text-ink-dim">
          {mode === 'coached'
            ? 'Your expenditure is measured from weight and intake each week, and targets follow from it.'
            : 'You set the numbers. The coach still measures your expenditure, but leaves the targets alone.'}
        </p>
        {actionFailed && <p className="mt-2 text-body text-alert">{actionFailed}</p>}
      </BootItem>

      {mode === 'coached' ? (
        <>
          <BootItem className={`mt-2.5 ${CARD}`}>
            <h2 className="text-card-title text-ink">Goal</h2>
            <p className="mt-0.5 text-label text-ink-faint">Weight change per week</p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {RATES.map((rate) => (
                <button
                  key={rate.kg}
                  type="button"
                  onClick={() => void patch({ goal_rate_kg_per_week: rate.kg })}
                  disabled={busy}
                  className={`flex min-h-[52px] flex-col items-center justify-center rounded-ctl border px-1 transition-transform duration-150 ease-instrument active:scale-[0.98] ${
                    goalRate === rate.kg
                      ? 'border-line-bright bg-surface-raised text-ink'
                      : 'border-line bg-surface text-ink-dim'
                  }`}
                >
                  <span className="text-body font-mono tabular-nums">{rate.tick}</span>
                  <span className="text-label text-ink-faint">{rate.word}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-body text-ink-dim">
              {RATES.find((r) => r.kg === goalRate)?.sentence ?? 'Custom'} —{' '}
              {signedKg(goalRate, 2)} kg per week
              {goalRate !== 0 &&
                `, about ${Math.abs(Math.round((goalRate * KCAL_PER_KG) / 7))} kcal a day`}
              .
            </p>
          </BootItem>

          <BootItem className={`mt-2.5 ${CARD}`}>
            <h2 className="text-card-title text-ink">Macro split</h2>
            <div className="mt-2">
              <div className="flex items-baseline justify-between">
                <label htmlFor="protein-per-kg" className="text-body text-ink-dim">
                  Protein
                </label>
                <span className="text-label font-mono tabular-nums text-ink">
                  {proteinPerKg.toFixed(1)} g per kg
                </span>
              </div>
              <input
                id="protein-per-kg"
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={proteinPerKg}
                onChange={(e) => void patch({ protein_g_per_kg: Number(e.target.value) })}
                disabled={busy}
                className="mt-2 h-11 w-full accent-live"
              />
            </div>
            <div className="mt-1">
              <div className="flex items-baseline justify-between">
                <label htmlFor="fat-pct" className="text-body text-ink-dim">
                  Fat
                </label>
                <span className="text-label font-mono tabular-nums text-ink">
                  {Math.round(fatPct * 100)}% of energy
                </span>
              </div>
              <input
                id="fat-pct"
                type="range"
                min={0.2}
                max={0.45}
                step={0.01}
                value={fatPct}
                onChange={(e) => void patch({ fat_pct_energy: Number(e.target.value) })}
                disabled={busy}
                className="mt-2 h-11 w-full accent-live"
              />
            </div>
            <p className="mt-1 text-body text-ink-dim">
              Carbohydrate takes whatever calories are left, so it's the macro that moves when the
              target changes.
            </p>
          </BootItem>

          <BootItem className={`mt-2.5 ${CARD}`}>
            <h2 className="text-card-title text-ink">What that gives you</h2>
            {preview && coach.expenditure ? (
              <>
                <div className="mt-2 flex items-baseline gap-2">
                  <p className="glow-ink text-metric text-ink">
                    <CountUp value={preview.kcal} />
                  </p>
                  <p className="text-label font-mono tabular-nums text-ink-faint">kcal/day</p>
                </div>
                <div className="mt-2">
                  <StatRow label="Protein">{preview.proteinG} g</StatRow>
                  <StatRow label="Carbohydrate">{preview.carbG} g</StatRow>
                  <StatRow label="Fat">{preview.fatG} g</StatRow>
                  <StatRow label="Expenditure" hint="measured">
                    {Math.round(coach.expenditure.kcal)} kcal
                  </StatRow>
                </div>
                <p className="mt-2 text-label text-ink-faint">
                  {coach.checkInFrom
                    ? `Applies from ${dayLabel(coach.checkInFrom)} — accept it on the diary.`
                    : 'Already applied. The next check-in lands on Monday.'}
                </p>
              </>
            ) : (
              <p className="mt-2 text-body text-ink-dim">
                The coach can't read your expenditure yet. Keep logging meals and{' '}
                <Link to="/food/weight" className="text-ink underline decoration-line-bright">
                  weigh in
                </Link>{' '}
                — it needs about a fortnight of both.
              </p>
            )}
          </BootItem>
        </>
      ) : (
        <BootItem className={`mt-2.5 ${CARD}`}>
          <h2 className="text-card-title text-ink">Your targets</h2>
          {manual && (
            <div className="mt-2 space-y-2">
              {MANUAL_FIELDS.map((field) => (
                <div key={field.key} className="flex items-center justify-between gap-3">
                  <label htmlFor={`goal-${field.key}`} className="text-body text-ink-dim">
                    {field.label}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id={`goal-${field.key}`}
                      inputMode="numeric"
                      value={manual[field.key]}
                      onChange={(e) =>
                        setManual((prev) =>
                          prev ? { ...prev, [field.key]: e.target.value } : prev,
                        )
                      }
                      className="h-11 w-24 rounded-ctl border border-line bg-surface px-2 text-right text-body font-mono tabular-nums text-ink focus:border-line-bright"
                    />
                    <span className="w-9 text-label text-ink-faint">{field.unit}</span>
                  </div>
                </div>
              ))}
              {parsedManual && manualValid && (
                <p className="text-label font-mono tabular-nums text-ink-faint">
                  Macros account for {Math.round(manualEnergy)} kcal of the{' '}
                  {Math.round(parsedManual.kcal)} target.
                </p>
              )}
              <button
                type="button"
                onClick={() => void saveManual()}
                disabled={busy || !manualValid}
                className={BUTTON}
              >
                Save targets
              </button>
            </div>
          )}
        </BootItem>
      )}

      {programs.length > 0 && (
        <BootItem className={`mt-2.5 ${CARD}`}>
          <h2 className="text-card-title text-ink">Check-in history</h2>
          <ul className="mt-1">
            {programs.map((p) => (
              <li
                key={p.id}
                className="flex items-baseline justify-between border-b border-line py-2 last:border-b-0"
              >
                <span className="text-body text-ink-dim">
                  {dayLabel(p.effective_from)}
                  <span className="ml-2 text-label text-ink-faint">
                    {p.source === 'manual' ? 'set by hand' : `${p.expenditure_kcal ?? '—'} burned`}
                  </span>
                </span>
                <span className="shrink-0 text-label font-mono tabular-nums text-ink">
                  {p.kcal_target} kcal · {Math.round(Number(p.protein_g_target))}P{' '}
                  {Math.round(Number(p.carb_g_target))}C {Math.round(Number(p.fat_g_target))}F
                </span>
              </li>
            ))}
          </ul>
        </BootItem>
      )}
      </BootSequence>
    </FoodPush>
  )
}
