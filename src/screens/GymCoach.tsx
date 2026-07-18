import { useEffect, useMemo, useState } from 'react'
import { listAllSets, listExercises, updateExerciseSettings } from '../gym/data'
import { adviseProgression } from '../gym/coach'
import { fmtKg, sessionDate } from '../gym/format'
import type { Exercise, GymSet } from '../gym/types'

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
          className="h-11 w-11 shrink-0 rounded-ctl border border-line bg-surface-raised text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98]"
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
          className="h-11 w-11 shrink-0 rounded-ctl border border-line bg-surface-raised text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98]"
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
  const [search, setSearch] = useState('')
  const [weight, setWeight] = useState('20')
  const [reps, setReps] = useState('8')
  const [increment, setIncrement] = useState('2.5')
  const [rangeMin, setRangeMin] = useState('8')
  const [rangeMax, setRangeMax] = useState('12')

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
    setSearch('')
    setIncrement(String(exercise.increment_kg))
    setRangeMin(String(exercise.rep_range_min))
    setRangeMax(String(exercise.rep_range_max))
    const last = [...allSets].reverse().find((s) => s.exercise_id === exercise.id)
    if (last) {
      setWeight(String(last.weight_kg))
      setReps(String(last.reps))
    }
  }

  // Settings persist per exercise, fire-and-forget; the advice below reacts
  // to the local values immediately either way.
  function persistSettings(next: { increment: string; min: string; max: string }) {
    if (!current) return
    const incrementKg = parseWeight(next.increment)
    const min = parseCount(next.min)
    const max = parseCount(next.max)
    if (incrementKg === null || min === null || max === null || max < min) return
    const settings = { increment_kg: incrementKg, rep_range_min: min, rep_range_max: max }
    setExercises((prev) => prev.map((e) => (e.id === current.id ? { ...e, ...settings } : e)))
    updateExerciseSettings(current.id, settings).catch(() =>
      setFailed("Couldn't save the exercise settings. They'll reset next time."),
    )
  }

  const weightNum = parseWeight(weight)
  const repsNum = parseCount(reps)
  const incrementNum = parseWeight(increment)
  const minNum = parseCount(rangeMin)
  const maxNum = parseCount(rangeMax)
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
      <div className="mx-auto max-w-md">
        <p className="py-8 text-body text-alert">{failed}</p>
      </div>
    ) : null
  }

  const query = search.trim().toLowerCase()
  const matches = query
    ? exercises.filter((e) => e.name.toLowerCase().includes(query))
    : exercises

  return (
    <div className="mx-auto max-w-md">
      <header className="pb-2 pt-2">
        <h1 className="text-screen-title text-ink">Coach</h1>
        <p className="mt-0.5 text-label text-ink-faint">
          Double progression: fill the rep range, then add weight
        </p>
      </header>

      {current ? (
        <>
          <section className="rounded-card border border-line bg-surface p-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-card-title text-ink">{current.name}</h2>
              <button
                type="button"
                onClick={() => setCurrent(null)}
                className="min-h-[44px] px-2 text-label text-ink-dim"
              >
                Change exercise
              </button>
            </div>

            <p className="mt-1 text-label text-ink-faint">
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
                  onChange={(e) => {
                    setIncrement(e.target.value)
                    persistSettings({ increment: e.target.value, min: rangeMin, max: rangeMax })
                  }}
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
                  onChange={(e) => {
                    setRangeMin(e.target.value)
                    persistSettings({ increment, min: e.target.value, max: rangeMax })
                  }}
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
                  onChange={(e) => {
                    setRangeMax(e.target.value)
                    persistSettings({ increment, min: rangeMin, max: e.target.value })
                  }}
                  className="mt-1.5 h-11 w-full rounded-ctl border border-line bg-surface px-1 text-center text-body font-mono tabular-nums text-ink focus:border-line-bright"
                />
              </div>
            </div>
          </section>

          {advice && (
            <section className="mt-2.5 rounded-card border border-line bg-surface p-3">
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
        </>
      ) : (
        <section className="rounded-card border border-line bg-surface p-3">
          <label htmlFor="coach-search" className="text-label text-ink-faint">
            Exercise
          </label>
          <input
            id="coach-search"
            type="text"
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-ctl border border-line bg-surface px-3 text-body text-ink placeholder:text-ink-faint focus:border-line-bright"
          />
          {exercises.length === 0 ? (
            <p className="py-6 text-center text-body text-ink-dim">
              Log a workout first — the coach works from your history
            </p>
          ) : (
            <ul className="mt-1">
              {matches.map((exercise) => (
                <li key={exercise.id}>
                  <button
                    type="button"
                    onClick={() => pickExercise(exercise)}
                    className="flex min-h-[44px] w-full items-center border-b border-line py-2 text-left text-body text-ink last:border-b-0"
                  >
                    {exercise.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
