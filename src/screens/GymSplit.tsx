import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchSplitDays, fetchSplitTemplates, listExercises, setSplitDay } from '../gym/data'
import { FOCUS_LABELS, FOCUS_OPTIONS, TEMPLATE_FOCUSES, WEEKDAY_LABELS } from '../gym/split'
import { londonWeekday } from '../lib/londonDay'
import type { Exercise, SplitFocus, SplitTemplateExercise } from '../gym/types'

export function GymSplit() {
  const [days, setDays] = useState<Map<number, SplitFocus>>(new Map())
  const [templates, setTemplates] = useState<SplitTemplateExercise[]>([])
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [openDay, setOpenDay] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchSplitDays(), fetchSplitTemplates(), listExercises()]).then(
      ([splitDays, splitTemplates, allExercises]) => {
        if (cancelled) return
        setDays(new Map(splitDays.map((d) => [d.weekday, d.focus])))
        setTemplates(splitTemplates)
        setExercises(allExercises)
        setLoaded(true)
      },
      () => {
        if (!cancelled) setFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  async function assign(weekday: number, focus: SplitFocus) {
    setOpenDay(null)
    const previous = days.get(weekday)
    setDays((prev) => new Map(prev).set(weekday, focus))
    try {
      await setSplitDay(weekday, focus)
    } catch {
      setDays((prev) => {
        const next = new Map(prev)
        if (previous === undefined) next.delete(weekday)
        else next.set(weekday, previous)
        return next
      })
      setFailed(true)
    }
  }

  if (failed && !loaded) {
    return (
      <div className="mx-auto w-full max-w-md md:max-w-2xl">
        <p className="py-8 text-body text-alert">Couldn't load your split. Go back and retry.</p>
      </div>
    )
  }

  if (!loaded) return null

  const today = londonWeekday(new Date())
  const names = new Map(exercises.map((e) => [e.id, e.name]))

  return (
    <div className="mx-auto w-full max-w-md md:max-w-2xl">
      <header className="pb-2 pt-2">
        <h1 className="text-screen-title text-ink">Split</h1>
        <p className="mt-0.5 text-label text-ink-faint">Tap a day to set its focus</p>
      </header>

      {failed && <p className="mb-2 text-body text-alert">Couldn't save. Try again.</p>}

      <section className="rounded-card border border-line bg-surface p-3">
        <ul>
          {WEEKDAY_LABELS.map((label, weekday) => {
            const focus = days.get(weekday) ?? 'rest'
            const open = openDay === weekday
            const isToday = weekday === today
            return (
              <li key={label} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  onClick={() => setOpenDay(open ? null : weekday)}
                  aria-expanded={open}
                  className="flex min-h-[44px] w-full items-center justify-between py-2 text-left"
                >
                  <span className={`text-body ${isToday ? 'text-ink' : 'text-ink-dim'}`}>
                    {label}
                    {isToday && <span className="text-label text-ink-faint"> · today</span>}
                  </span>
                  <span
                    className={`text-body ${focus === 'rest' ? 'text-ink-faint' : isToday ? 'text-live' : 'text-ink'}`}
                  >
                    {FOCUS_LABELS[focus]}
                  </span>
                </button>
                {open && (
                  <div className="flex flex-wrap gap-2 pb-3">
                    {FOCUS_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => void assign(weekday, option)}
                        className={`h-11 rounded-ctl border px-3 text-body transition-transform duration-150 ease-instrument active:scale-[0.98] ${
                          option === focus
                            ? 'border-line-bright bg-surface-raised text-ink'
                            : 'border-line bg-surface text-ink-dim'
                        }`}
                      >
                        {FOCUS_LABELS[option]}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="mt-2.5 rounded-card border border-line bg-surface p-3">
        <h2 className="text-card-title text-ink">Day templates</h2>
        <ul className="mt-1">
          {TEMPLATE_FOCUSES.map((focus) => {
            const list = templates.filter((t) => t.focus === focus)
            const preview = list
              .slice(0, 3)
              .map((t) => names.get(t.exercise_id) ?? '')
              .filter(Boolean)
              .join(', ')
            return (
              <li key={focus}>
                <Link
                  to={`/gym/split/${focus}`}
                  className="flex min-h-[44px] items-center justify-between border-b border-line py-2 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 pr-3">
                    <span className="block text-body text-ink">{FOCUS_LABELS[focus]}</span>
                    {preview && (
                      <span className="block truncate text-label text-ink-faint">{preview}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-label font-mono tabular-nums text-ink-faint">
                    {list.length} exercises
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
