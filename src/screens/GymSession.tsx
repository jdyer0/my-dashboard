import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  addExercise,
  addSet,
  deleteSession,
  deleteSet,
  fetchActiveSession,
  finishSession,
  listAllSets,
  listExercises,
} from '../gym/data'
import { adviseProgression } from '../gym/coach'
import { e1rm, prSetIds } from '../gym/e1rm'
import { clockTime, fmtKg } from '../gym/format'
import type { Exercise, GymSession as Session, GymSet } from '../gym/types'

const WEIGHT_STEP_KG = 2.5

function parseWeight(text: string): number | null {
  const n = Number(text.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 && n <= 9999 ? n : null
}

function parseReps(text: string): number | null {
  const n = Number(text)
  return Number.isInteger(n) && n > 0 && n <= 999 ? n : null
}

/** Session sets grouped by exercise in first-logged order. */
function groupSets(sets: GymSet[]): { exerciseId: string; sets: GymSet[] }[] {
  const groups = new Map<string, GymSet[]>()
  for (const set of sets) {
    const group = groups.get(set.exercise_id)
    if (group) group.push(set)
    else groups.set(set.exercise_id, [set])
  }
  return [...groups.entries()].map(([exerciseId, grouped]) => ({ exerciseId, sets: grouped }))
}

export function GymSession() {
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null>(null)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [allSets, setAllSets] = useState<GymSet[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  const [current, setCurrent] = useState<Exercise | null>(null)
  const [search, setSearch] = useState('')
  const [weight, setWeight] = useState('20')
  const [reps, setReps] = useState('8')
  const [saving, setSaving] = useState(false)
  const [finishing, setFinishing] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [active, allExercises, sets] = await Promise.all([
          fetchActiveSession(),
          listExercises(),
          listAllSets(),
        ])
        if (cancelled) return
        if (!active) {
          navigate('/gym', { replace: true })
          return
        }
        setSession(active)
        setExercises(allExercises)
        setAllSets(sets)
        setLoaded(true)
      } catch {
        if (!cancelled) setFailed("Couldn't load the session. Pull back and retry.")
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [navigate])

  const sessionSets = useMemo(
    () => (session ? allSets.filter((s) => s.session_id === session.id) : []),
    [allSets, session],
  )
  const prs = useMemo(() => prSetIds(allSets), [allSets])
  const names = useMemo(() => new Map(exercises.map((e) => [e.id, e.name])), [exercises])

  // Coach hint for the selected exercise, from its most recent set — which
  // includes sets logged moments ago, so the hint moves with the session.
  const hint = useMemo(() => {
    if (!current) return null
    const last = [...allSets].reverse().find((s) => s.exercise_id === current.id)
    if (!last) return null
    const advice = adviseProgression({
      weightKg: last.weight_kg,
      reps: last.reps,
      incrementKg: current.increment_kg,
      repRangeMin: current.rep_range_min,
      repRangeMax: current.rep_range_max,
    })
    const targetReps =
      advice.action === 'hold'
        ? Math.min(last.reps + 1, current.rep_range_max)
        : current.rep_range_min
    return { ...advice, targetReps }
  }, [allSets, current])

  function applyHint() {
    if (!hint) return
    setWeight(String(hint.targetWeightKg))
    setReps(String(hint.targetReps))
  }

  const pickExercise = useCallback(
    (exercise: Exercise) => {
      setCurrent(exercise)
      setSearch('')
      // Prefill from the most recent set of this exercise; allSets is chronological.
      const last = [...allSets].reverse().find((s) => s.exercise_id === exercise.id)
      if (last) {
        setWeight(String(last.weight_kg))
        setReps(String(last.reps))
      }
    },
    [allSets],
  )

  async function createExercise(name: string) {
    try {
      const exercise = await addExercise(name)
      setExercises((prev) => [...prev, exercise].sort((a, b) => a.name.localeCompare(b.name)))
      pickExercise(exercise)
      setFailed(null)
    } catch {
      setFailed("Couldn't add the exercise. Try again.")
    }
  }

  async function logSet() {
    if (!session || !current || saving) return
    const w = parseWeight(weight)
    const r = parseReps(reps)
    if (w === null || r === null) {
      setFailed('Enter a weight in kg and at least one rep.')
      return
    }
    setSaving(true)
    try {
      const set = await addSet(session.id, current.id, w, r)
      setAllSets((prev) => [...prev, set])
      setFailed(null)
    } catch {
      setFailed("Couldn't save the set. Try again.")
    } finally {
      setSaving(false)
    }
  }

  async function removeSet(id: string) {
    try {
      await deleteSet(id)
      setAllSets((prev) => prev.filter((s) => s.id !== id))
      setFailed(null)
    } catch {
      setFailed("Couldn't delete the set. Try again.")
    }
  }

  async function finish() {
    if (!session || finishing) return
    setFinishing(true)
    try {
      // An abandoned empty session is noise, not history.
      if (sessionSets.length === 0) await deleteSession(session.id)
      else await finishSession(session.id)
      navigate('/gym')
    } catch {
      setFinishing(false)
      setFailed("Couldn't finish the session. Try again.")
    }
  }

  function stepWeight(direction: 1 | -1) {
    const w = parseWeight(weight) ?? 0
    setWeight(String(Math.max(0, w + direction * WEIGHT_STEP_KG)))
  }

  function stepReps(direction: 1 | -1) {
    const r = parseReps(reps) ?? 0
    setReps(String(Math.max(1, r + direction)))
  }

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
  const exactMatch = exercises.some((e) => e.name.toLowerCase() === query)
  const groups = groupSets(sessionSets)

  return (
    <div className="mx-auto max-w-md">
      <header className="flex items-center justify-between pb-2 pt-2">
        <div>
          <h1 className="text-screen-title text-ink">Session</h1>
          {session && (
            <p className="mt-0.5 text-label font-mono tabular-nums text-ink-faint">
              started {clockTime.format(new Date(session.started_at))}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void finish()}
          disabled={finishing}
          className="h-11 rounded-ctl border border-line bg-surface-raised px-4 text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98] disabled:text-ink-faint"
        >
          Finish
        </button>
      </header>

      {current ? (
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

          {hint && (
            <button
              type="button"
              onClick={applyHint}
              className="mt-1 flex min-h-[44px] w-full items-center justify-between text-left"
            >
              <span className="text-label text-ink-faint">
                Coach ·{' '}
                {hint.action === 'increase'
                  ? 'increase to'
                  : hint.action === 'decrease'
                    ? 'drop to'
                    : 'stay at'}
              </span>
              <span
                className={`text-label font-mono tabular-nums ${
                  hint.action === 'increase'
                    ? 'text-live'
                    : hint.action === 'decrease'
                      ? 'text-warn'
                      : 'text-ink-dim'
                }`}
              >
                {fmtKg(hint.targetWeightKg)} kg × {hint.targetReps}
              </span>
            </button>
          )}

          <div className="mt-1 grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="weight" className="text-label text-ink-faint">
                Weight kg
              </label>
              <div className="mt-1.5 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => stepWeight(-1)}
                  aria-label="Reduce weight"
                  className="h-11 w-11 shrink-0 rounded-ctl border border-line bg-surface-raised text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98]"
                >
                  −
                </button>
                <input
                  id="weight"
                  inputMode="decimal"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="h-11 w-full min-w-0 rounded-ctl border border-line bg-surface px-1 text-center text-metric-sm font-mono tabular-nums text-ink focus:border-line-bright"
                />
                <button
                  type="button"
                  onClick={() => stepWeight(1)}
                  aria-label="Increase weight"
                  className="h-11 w-11 shrink-0 rounded-ctl border border-line bg-surface-raised text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98]"
                >
                  +
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="reps" className="text-label text-ink-faint">
                Reps
              </label>
              <div className="mt-1.5 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => stepReps(-1)}
                  aria-label="Reduce reps"
                  className="h-11 w-11 shrink-0 rounded-ctl border border-line bg-surface-raised text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98]"
                >
                  −
                </button>
                <input
                  id="reps"
                  inputMode="numeric"
                  value={reps}
                  onChange={(e) => setReps(e.target.value)}
                  className="h-11 w-full min-w-0 rounded-ctl border border-line bg-surface px-1 text-center text-metric-sm font-mono tabular-nums text-ink focus:border-line-bright"
                />
                <button
                  type="button"
                  onClick={() => stepReps(1)}
                  aria-label="Increase reps"
                  className="h-11 w-11 shrink-0 rounded-ctl border border-line bg-surface-raised text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98]"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void logSet()}
            disabled={saving}
            className="mt-3 h-11 w-full rounded-ctl border border-line bg-surface-raised text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98] disabled:text-ink-faint"
          >
            Log set
          </button>
        </section>
      ) : (
        <section className="rounded-card border border-line bg-surface p-3">
          <label htmlFor="exercise-search" className="text-label text-ink-faint">
            Exercise
          </label>
          <input
            id="exercise-search"
            type="text"
            placeholder="Search or add"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-ctl border border-line bg-surface px-3 text-body text-ink placeholder:text-ink-faint focus:border-line-bright"
          />
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
            {query && !exactMatch && (
              <li>
                <button
                  type="button"
                  onClick={() => void createExercise(search.trim())}
                  className="flex min-h-[44px] w-full items-center py-2 text-left text-body text-live"
                >
                  Add "{search.trim()}"
                </button>
              </li>
            )}
          </ul>
        </section>
      )}

      {failed && <p className="mt-2 text-body text-alert">{failed}</p>}

      {groups.length > 0 && (
        <div className="mt-2.5 space-y-2.5">
          {[...groups].reverse().map((group) => (
            <section
              key={group.exerciseId}
              className="rounded-card border border-line bg-surface p-3"
            >
              <h2 className="text-card-title text-ink">
                {names.get(group.exerciseId) ?? 'Unknown exercise'}
              </h2>
              <ul className="mt-1">
                {group.sets.map((set) => {
                  const isPr = prs.has(set.id)
                  return (
                    <li
                      key={set.id}
                      className="flex min-h-[44px] items-center justify-between border-b border-line py-1 last:border-b-0"
                    >
                      <span className="text-metric-sm font-mono tabular-nums text-ink">
                        {fmtKg(set.weight_kg)} kg × {set.reps}
                      </span>
                      <span className="flex items-center gap-2">
                        <span
                          className={`text-label font-mono tabular-nums ${isPr ? 'text-live' : 'text-ink-faint'}`}
                        >
                          {isPr ? 'PR ' : ''}e1RM {fmtKg(e1rm(set.weight_kg, set.reps))}
                        </span>
                        <button
                          type="button"
                          onClick={() => void removeSet(set.id)}
                          aria-label="Delete set"
                          className="flex h-11 w-11 items-center justify-center text-ink-faint transition-transform duration-150 ease-instrument active:scale-[0.98]"
                        >
                          ×
                        </button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
