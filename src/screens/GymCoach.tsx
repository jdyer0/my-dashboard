import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listAllSets, listExercises, updateExerciseSettings } from '../gym/data'
import { adviseProgression } from '../gym/coach'
import { fmtKg, sessionDate } from '../gym/format'
import type { Exercise, GymSet } from '../gym/types'
import { COL, PAGE, PageHeader, SPLIT } from '../shell/PageHeader'

function parseWeight(text: string): number | null {
  const n = Number(text.replace(',', '.'))
  return Number.isFinite(n) && n > 0 && n <= 9999 ? n : null
}

function parseCount(text: string): number | null {
  const n = Number(text)
  return Number.isInteger(n) && n > 0 && n <= 999 ? n : null
}

function Stepper({
  id,
  label,
  value,
  onChange,
  onStep,
  inputMode,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  onStep: (direction: 1 | -1) => void
  inputMode: 'decimal' | 'numeric'
}) {
  return (
    <div>
      <label htmlFor={id} className="text-label text-ink-faint">
        {label}
      </label>
      <div className="mt-1.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onStep(-1)}
          aria-label={`Reduce ${label.toLowerCase()}`}
          className="h-11 w-11 shrink-0 btn-glow rounded-ctl border border-line bg-surface-raised text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98]"
        >
          −
        </button>
        <input
          id={id}
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full min-w-0 rounded-ctl border border-line bg-surface px-1 text-center text-metric-sm font-mono tabular-nums text-ink focus:border-line-bright"
        />
        <button
          type="button"
          onClick={() => onStep(1)}
          aria-label={`Increase ${label.toLowerCase()}`}
          className="h-11 w-11 shrink-0 btn-glow rounded-ctl border border-line bg-surface-raised text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98]"
        >
          +
        </button>
      </div>
    </div>
  )
}

export function GymCoach() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [allSets, setAllSets] = useState<GymSet[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  const [current, setCurrent] = useState<Exercise | null>(null)
  const [weight, setWeight] = useState('20')
  const [reps, setReps] = useState('8')
  const [increment, setIncrement] = useState('2.5')
  const [rangeMin, setRangeMin] = useState('8')
  const [rangeMax, setRangeMax] = useState('12')
  const [savingSettings, setSavingSettings] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([listExercises(), listAllSets()]).then(
      ([allExercises, sets]) => {
        if (cancelled) return
        setExercises(allExercises)
        setAllSets(sets)
        setLoaded(true)
      },
      () => {
        if (!cancelled) setFailed("Couldn't load your exercises. Go back and retry.")
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  // allSets is chronological, so the last match is the most recent set.
  const lastSet = useMemo(() => {
    if (!current) return null
    return [...allSets].reverse().find((s) => s.exercise_id === current.id) ?? null
  }, [allSets, current])

  function pickExercise(exercise: Exercise) {
    setCurrent(exercise)
    setIncrement(String(exercise.increment_kg))
    setRangeMin(String(exercise.rep_range_min))
    setRangeMax(String(exercise.rep_range_max))
    const last = [...allSets].reverse().find((s) => s.exercise_id === exercise.id)
    if (last) {
      setWeight(String(last.weight_kg))
      setReps(String(last.reps))
    }
  }

  // The advice below reacts to the typed values immediately, but they are only
  // written back to the exercise on Save — an in-progress rep range shouldn't
  // become that exercise's setting everywhere else in the app.
  async function saveSettings() {
    if (!current || savingSettings) return
    const incrementKg = parseWeight(increment)
    const min = parseCount(rangeMin)
    const max = parseCount(rangeMax)
    if (incrementKg === null || min === null || max === null || max < min) return
    const settings = { increment_kg: incrementKg, rep_range_min: min, rep_range_max: max }
    setSavingSettings(true)
    try {
      await updateExerciseSettings(current.id, settings)
      setExercises((prev) => prev.map((e) => (e.id === current.id ? { ...e, ...settings } : e)))
      // `current` is its own copy, and settingsDirty compares against it — without
      // this the button would stay on "Save" forever after a successful save.
      setCurrent((prev) => (prev && prev.id === current.id ? { ...prev, ...settings } : prev))
      // Re-render the inputs from the canonical numbers, so "2.50" doesn't read
      // as a pending edit against a stored 2.5.
      setIncrement(String(settings.increment_kg))
      setRangeMin(String(settings.rep_range_min))
      setRangeMax(String(settings.rep_range_max))
    } catch {
      setFailed("Couldn't save the exercise settings. Try again.")
    } finally {
      setSavingSettings(false)
    }
  }

  const weightNum = parseWeight(weight)
  const repsNum = parseCount(reps)
  const incrementNum = parseWeight(increment)
  const minNum = parseCount(rangeMin)
  const maxNum = parseCount(rangeMax)
  const settingsValid =
    incrementNum !== null && minNum !== null && maxNum !== null && maxNum >= minNum
  const settingsDirty =
    current !== null &&
    (increment !== String(current.increment_kg) ||
      rangeMin !== String(current.rep_range_min) ||
      rangeMax !== String(current.rep_range_max))
  const advice =
    weightNum !== null &&
    repsNum !== null &&
    incrementNum !== null &&
    minNum !== null &&
    maxNum !== null &&
    maxNum >= minNum
      ? adviseProgression({
          weightKg: weightNum,
          reps: repsNum,
          incrementKg: incrementNum,
          repRangeMin: minNum,
          repRangeMax: maxNum,
        })
      : null

  if (!loaded) {
    return failed ? (
      <div className={PAGE}>
        <p className="py-8 text-body text-alert">{failed}</p>
      </div>
    ) : null
  }

  return (
    <div className={PAGE}>
      <PageHeader
        back={{ to: '/gym', label: 'Gym' }}
        title="Coach"
        subtitle="Double progression: fill the rep range, then add weight"
      />

      <label htmlFor="coach-select" className="text-label text-ink-faint">
        Exercise
      </label>
      {exercises.length === 0 ? (
        <p className="mt-1.5 text-body text-ink-dim">
          No exercises yet.{' '}
          <Link to="/gym/exercises" className="text-ink underline decoration-line-bright">
            Create them on the exercises screen
          </Link>
        </p>
      ) : (
        <select
          id="coach-select"
          value={current?.id ?? ''}
          onChange={(e) => {
            const exercise = exercises.find((ex) => ex.id === e.target.value)
            if (exercise) pickExercise(exercise)
          }}
          className="mt-1.5 h-11 w-full rounded-ctl border border-line bg-surface px-3 text-body text-ink focus:border-line-bright lg:max-w-md"
        >
          <option value="" disabled>
            Choose exercise
          </option>
          {exercises.map((exercise) => (
            <option key={exercise.id} value={exercise.id}>
              {exercise.name}
            </option>
          ))}
        </select>
      )}

      {current && (
        <div className={`mt-2.5 ${SPLIT}`}>
          <section className={`${COL} rounded-card border border-line bg-surface p-3`}>
            <p className="text-label text-ink-faint">
              Last set:{' '}
              {lastSet ? (
                <span className="font-mono tabular-nums text-ink-dim">
                  {fmtKg(lastSet.weight_kg)} kg × {lastSet.reps} ·{' '}
                  {sessionDate.format(new Date(lastSet.performed_at))}
                </span>
              ) : (
                'none logged yet'
              )}
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Stepper
                id="coach-weight"
                label="Weight kg"
                value={weight}
                onChange={setWeight}
                inputMode="decimal"
                onStep={(dir) => {
                  const w = parseWeight(weight) ?? 0
                  const step = incrementNum ?? 2.5
                  setWeight(String(Math.max(0, Math.round((w + dir * step) * 100) / 100)))
                }}
              />
              <Stepper
                id="coach-reps"
                label="Reps"
                value={reps}
                onChange={setReps}
                inputMode="numeric"
                onStep={(dir) => {
                  const r = parseCount(reps) ?? 0
                  setReps(String(Math.max(1, r + dir)))
                }}
              />
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2">
              <div>
                <label htmlFor="coach-increment" className="text-label text-ink-faint">
                  Increment kg
                </label>
                <input
                  id="coach-increment"
                  inputMode="decimal"
                  value={increment}
                  onChange={(e) => setIncrement(e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-ctl border border-line bg-surface px-1 text-center text-body font-mono tabular-nums text-ink focus:border-line-bright"
                />
              </div>
              <div>
                <label htmlFor="coach-range-min" className="text-label text-ink-faint">
                  Reps from
                </label>
                <input
                  id="coach-range-min"
                  inputMode="numeric"
                  value={rangeMin}
                  onChange={(e) => setRangeMin(e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-ctl border border-line bg-surface px-1 text-center text-body font-mono tabular-nums text-ink focus:border-line-bright"
                />
              </div>
              <div>
                <label htmlFor="coach-range-max" className="text-label text-ink-faint">
                  Reps to
                </label>
                <input
                  id="coach-range-max"
                  inputMode="numeric"
                  value={rangeMax}
                  onChange={(e) => setRangeMax(e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-ctl border border-line bg-surface px-1 text-center text-body font-mono tabular-nums text-ink focus:border-line-bright"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => void saveSettings()}
              disabled={savingSettings || !settingsDirty || !settingsValid}
              className="mt-3 h-11 w-full btn-glow rounded-ctl border border-line bg-surface-raised text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98] disabled:border-line disabled:bg-surface disabled:text-ink-faint disabled:shadow-none"
            >
              {settingsDirty ? 'Save exercise settings' : 'Exercise settings saved'}
            </button>
          </section>

          <div className={COL}>
          {advice && (
            <section className="mt-2.5 rounded-card border border-line bg-surface p-3 lg:mt-0">
              <h2 className="text-card-title text-ink">Advice</h2>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-body text-ink-dim">
                  {advice.action === 'increase'
                    ? 'Increase to'
                    : advice.action === 'decrease'
                      ? 'Drop to'
                      : 'Stay at'}
                </span>
                <span
                  className={`text-metric font-mono tabular-nums ${
                    advice.action === 'increase'
                      ? 'text-live'
                      : advice.action === 'decrease'
                        ? 'text-warn'
                        : 'text-ink'
                  }`}
                >
                  {fmtKg(advice.targetWeightKg)} <span className="text-label text-ink-faint">kg</span>
                </span>
              </div>
              <p className="mt-2 text-body text-ink-dim">{advice.reason}</p>
              {advice.predictedReps !== null && advice.action !== 'hold' && (
                <p className="mt-1 text-label font-mono tabular-nums text-ink-faint">
                  predicted {advice.predictedReps} reps at {fmtKg(advice.targetWeightKg)} kg
                </p>
              )}
            </section>
          )}

          {failed && <p className="mt-2 text-body text-alert">{failed}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
