import { useEffect, useState } from 'react'
import { addExercise, listExercises, updateExerciseSettings } from '../gym/data'
import type { Exercise } from '../gym/types'
import { PAGE, PageHeader } from '../shell/PageHeader'

function parseWeight(text: string): number | null {
  const n = Number(text.replace(',', '.'))
  return Number.isFinite(n) && n > 0 && n <= 9999 ? n : null
}

function parseCount(text: string): number | null {
  const n = Number(text)
  return Number.isInteger(n) && n > 0 && n <= 999 ? n : null
}

function ExerciseRow({
  exercise,
  onSaved,
  onFailed,
}: {
  exercise: Exercise
  onSaved: (settings: { increment_kg: number; rep_range_min: number; rep_range_max: number }) => void
  onFailed: () => void
}) {
  const [increment, setIncrement] = useState(String(exercise.increment_kg))
  const [rangeMin, setRangeMin] = useState(String(exercise.rep_range_min))
  const [rangeMax, setRangeMax] = useState(String(exercise.rep_range_max))
  const [saving, setSaving] = useState(false)

  const incrementKg = parseWeight(increment)
  const min = parseCount(rangeMin)
  const max = parseCount(rangeMax)
  const valid = incrementKg !== null && min !== null && max !== null && max >= min
  const dirty =
    increment !== String(exercise.increment_kg) ||
    rangeMin !== String(exercise.rep_range_min) ||
    rangeMax !== String(exercise.rep_range_max)

  // Typed edits are held until Save. Writing on every keystroke sent a request
  // per digit and made a half-typed rep range look like a saved one.
  async function save() {
    if (!valid || !dirty || saving) return
    const settings = { increment_kg: incrementKg, rep_range_min: min, rep_range_max: max }
    setSaving(true)
    try {
      await updateExerciseSettings(exercise.id, settings)
      onSaved(settings)
      // Canonical strings, so "2.50" stops reading as a pending edit.
      setIncrement(String(settings.increment_kg))
      setRangeMin(String(settings.rep_range_min))
      setRangeMax(String(settings.rep_range_max))
    } catch {
      onFailed()
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="border-b border-line py-2.5 last:border-b-0">
      <p className="text-body text-ink">{exercise.name}</p>
      <div className="mt-1.5 grid grid-cols-3 gap-2 sm:grid-cols-4">
        <div>
          <label htmlFor={`inc-${exercise.id}`} className="text-label text-ink-faint">
            Increment kg
          </label>
          <input
            id={`inc-${exercise.id}`}
            inputMode="decimal"
            value={increment}
            onChange={(e) => setIncrement(e.target.value)}
            className="mt-1 h-11 w-full rounded-ctl border border-line bg-surface px-1 text-center text-body font-mono tabular-nums text-ink focus:border-line-bright"
          />
        </div>
        <div>
          <label htmlFor={`min-${exercise.id}`} className="text-label text-ink-faint">
            Reps from
          </label>
          <input
            id={`min-${exercise.id}`}
            inputMode="numeric"
            value={rangeMin}
            onChange={(e) => setRangeMin(e.target.value)}
            className="mt-1 h-11 w-full rounded-ctl border border-line bg-surface px-1 text-center text-body font-mono tabular-nums text-ink focus:border-line-bright"
          />
        </div>
        <div>
          <label htmlFor={`max-${exercise.id}`} className="text-label text-ink-faint">
            Reps to
          </label>
          <input
            id={`max-${exercise.id}`}
            inputMode="numeric"
            value={rangeMax}
            onChange={(e) => setRangeMax(e.target.value)}
            className="mt-1 h-11 w-full rounded-ctl border border-line bg-surface px-1 text-center text-body font-mono tabular-nums text-ink focus:border-line-bright"
          />
        </div>
        <div className="col-span-3 sm:col-span-1 sm:self-end">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!valid || !dirty || saving}
            className="mt-1 h-11 w-full btn-glow rounded-ctl border border-line bg-surface-raised text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98] disabled:border-line disabled:bg-surface disabled:text-ink-faint disabled:shadow-none"
          >
            {dirty ? 'Save' : 'Saved'}
          </button>
        </div>
      </div>
    </li>
  )
}

export function GymExercises() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    let cancelled = false
    listExercises().then(
      (all) => {
        if (!cancelled) {
          setExercises(all)
          setLoaded(true)
        }
      },
      () => {
        if (!cancelled) setFailed("Couldn't load your exercises. Go back and retry.")
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  async function create() {
    const name = newName.trim()
    if (!name || adding) return
    if (exercises.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
      setFailed('That exercise already exists.')
      return
    }
    setAdding(true)
    setFailed(null)
    try {
      const exercise = await addExercise(name)
      setExercises((prev) => [...prev, exercise].sort((a, b) => a.name.localeCompare(b.name)))
      setNewName('')
    } catch {
      setFailed("Couldn't add the exercise. Try again.")
    } finally {
      setAdding(false)
    }
  }

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
        title="Exercises"
        subtitle="Rep range and increment drive the coach's advice"
      />

      <div className="flex gap-2 lg:max-w-xl">
        <input
          type="text"
          placeholder="New exercise"
          aria-label="New exercise name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="h-11 w-full min-w-0 rounded-ctl border border-line bg-surface px-3 text-body text-ink placeholder:text-ink-faint focus:border-line-bright"
        />
        <button
          type="button"
          onClick={() => void create()}
          disabled={adding || !newName.trim()}
          className="h-11 shrink-0 btn-glow rounded-ctl border border-line bg-surface-raised px-4 text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98] disabled:text-ink-faint"
        >
          Add
        </button>
      </div>

      {failed && <p className="mt-2 text-body text-alert">{failed}</p>}

      <section className="mt-2.5 rounded-card border border-line bg-surface px-3 py-1">
        {exercises.length === 0 ? (
          <p className="py-6 text-center text-body text-ink-dim">Add your first exercise</p>
        ) : (
          <ul>
            {exercises.map((exercise) => (
              <ExerciseRow
                key={exercise.id}
                exercise={exercise}
                onSaved={(settings) =>
                  setExercises((prev) =>
                    prev.map((e) => (e.id === exercise.id ? { ...e, ...settings } : e)),
                  )
                }
                onFailed={() =>
                  setFailed("Couldn't save the exercise settings. They'll reset next time.")
                }
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
