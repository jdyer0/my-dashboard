import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  addExercise,
  addSplitTemplateExercise,
  fetchSplitTemplates,
  listExercises,
  removeSplitTemplateExercise,
} from '../gym/data'
import { FOCUS_LABELS, isTemplateFocus } from '../gym/split'
import type { Exercise, SplitTemplateExercise } from '../gym/types'

export function GymSplitTemplate() {
  const { focus: focusParam } = useParams()
  const navigate = useNavigate()
  const focus = focusParam && isTemplateFocus(focusParam) ? focusParam : null

  const [exercises, setExercises] = useState<Exercise[]>([])
  const [templates, setTemplates] = useState<SplitTemplateExercise[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (!focus) {
      navigate('/gym/split', { replace: true })
      return
    }
    let cancelled = false
    Promise.all([listExercises(), fetchSplitTemplates()]).then(
      ([allExercises, allTemplates]) => {
        if (cancelled) return
        setExercises(allExercises)
        setTemplates(allTemplates)
        setLoaded(true)
      },
      () => {
        if (!cancelled) setFailed("Couldn't load the template. Go back and retry.")
      },
    )
    return () => {
      cancelled = true
    }
  }, [focus, navigate])

  if (!focus) return null

  if (!loaded) {
    return failed ? (
      <div className="mx-auto max-w-md">
        <p className="py-8 text-body text-alert">{failed}</p>
      </div>
    ) : null
  }

  const names = new Map(exercises.map((e) => [e.id, e.name]))
  const inTemplate = templates.filter((t) => t.focus === focus)
  const templateExerciseIds = new Set(inTemplate.map((t) => t.exercise_id))

  async function add(exercise: Exercise) {
    if (adding || templateExerciseIds.has(exercise.id)) return
    setAdding(true)
    setFailed(null)
    try {
      const position = Math.max(0, ...inTemplate.map((t) => t.position)) + 1
      const row = await addSplitTemplateExercise(focus as typeof inTemplate[number]['focus'], exercise.id, position)
      setTemplates((prev) => [...prev, row])
      setSearch('')
    } catch {
      setFailed("Couldn't add the exercise. Try again.")
    } finally {
      setAdding(false)
    }
  }

  async function createAndAdd(name: string) {
    if (adding) return
    setAdding(true)
    setFailed(null)
    try {
      const exercise = await addExercise(name)
      setExercises((prev) => [...prev, exercise].sort((a, b) => a.name.localeCompare(b.name)))
      const position = Math.max(0, ...inTemplate.map((t) => t.position)) + 1
      const row = await addSplitTemplateExercise(focus as typeof inTemplate[number]['focus'], exercise.id, position)
      setTemplates((prev) => [...prev, row])
      setSearch('')
    } catch {
      setFailed("Couldn't add the exercise. Try again.")
    } finally {
      setAdding(false)
    }
  }

  async function remove(id: string) {
    try {
      await removeSplitTemplateExercise(id)
      setTemplates((prev) => prev.filter((t) => t.id !== id))
      setFailed(null)
    } catch {
      setFailed("Couldn't remove the exercise. Try again.")
    }
  }

  const query = search.trim().toLowerCase()
  const matches = query
    ? exercises.filter(
        (e) => e.name.toLowerCase().includes(query) && !templateExerciseIds.has(e.id),
      )
    : []
  const exactMatch = exercises.some((e) => e.name.toLowerCase() === query)

  return (
    <div className="mx-auto max-w-md">
      <header className="pb-2 pt-2">
        <h1 className="text-screen-title text-ink">{FOCUS_LABELS[focus]} day</h1>
        <p className="mt-0.5 text-label text-ink-faint">
          These exercises apply to every {FOCUS_LABELS[focus].toLowerCase()} day
        </p>
      </header>

      <section className="rounded-card border border-line bg-surface p-3">
        {inTemplate.length === 0 ? (
          <p className="py-4 text-center text-body text-ink-dim">Add your first exercise</p>
        ) : (
          <ul>
            {inTemplate.map((t) => (
              <li
                key={t.id}
                className="flex min-h-[44px] items-center justify-between border-b border-line py-1 last:border-b-0"
              >
                <span className="text-body text-ink">{names.get(t.exercise_id) ?? 'Unknown exercise'}</span>
                <button
                  type="button"
                  onClick={() => void remove(t.id)}
                  aria-label={`Remove ${names.get(t.exercise_id) ?? 'exercise'}`}
                  className="flex h-11 w-11 items-center justify-center text-ink-faint transition-transform duration-150 ease-instrument active:scale-[0.98]"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-2.5 rounded-card border border-line bg-surface p-3">
        <label htmlFor="template-search" className="text-label text-ink-faint">
          Add exercise
        </label>
        <input
          id="template-search"
          type="text"
          placeholder="Search or add"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-1.5 h-11 w-full rounded-ctl border border-line bg-surface px-3 text-body text-ink placeholder:text-ink-faint focus:border-line-bright"
        />
        {query && (
          <ul className="mt-1">
            {matches.map((exercise) => (
              <li key={exercise.id}>
                <button
                  type="button"
                  onClick={() => void add(exercise)}
                  disabled={adding}
                  className="flex min-h-[44px] w-full items-center border-b border-line py-2 text-left text-body text-ink last:border-b-0 disabled:text-ink-faint"
                >
                  {exercise.name}
                </button>
              </li>
            ))}
            {!exactMatch && (
              <li>
                <button
                  type="button"
                  onClick={() => void createAndAdd(search.trim())}
                  disabled={adding}
                  className="flex min-h-[44px] w-full items-center py-2 text-left text-body text-live disabled:text-ink-faint"
                >
                  Add "{search.trim()}"
                </button>
              </li>
            )}
          </ul>
        )}
      </section>

      {failed && <p className="mt-2 text-body text-alert">{failed}</p>}
    </div>
  )
}
