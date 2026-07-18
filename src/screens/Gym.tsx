import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BootItem, BootSequence } from '../motion/BootSequence'
import { fetchSplitDays, listAllSets, listExercises, listSessions, startSession } from '../gym/data'
import { bestLifts, totalVolumeKg } from '../gym/e1rm'
import { clockTime, fmtKg, sessionDate } from '../gym/format'
import { FOCUS_LABELS, WEEKDAY_LABELS } from '../gym/split'
import { inLondonWeek, londonWeekday } from '../lib/londonDay'
import type { Exercise, GymSession, GymSet, SplitDay } from '../gym/types'

interface GymData {
  sessions: GymSession[]
  sets: GymSet[]
  exercises: Exercise[]
  splitDays: SplitDay[]
}

export function Gym() {
  const navigate = useNavigate()
  const [data, setData] = useState<GymData | null>(null)
  const [failed, setFailed] = useState(false)
  const [starting, setStarting] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const [sessions, sets, exercises, splitDays] = await Promise.all([
        listSessions(),
        listAllSets(),
        listExercises(),
        fetchSplitDays(),
      ])
      setData({ sessions, sets, exercises, splitDays })
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function start() {
    if (starting) return
    setStarting(true)
    try {
      await startSession()
      navigate('/gym/session')
    } catch {
      setStarting(false)
      setFailed(true)
    }
  }

  if (failed) {
    return (
      <div className="mx-auto max-w-md">
        <header className="pb-1 pt-2">
          <h1 className="text-screen-title text-ink">Gym</h1>
        </header>
        <p className="py-8 text-body text-alert">Couldn't load your workouts. Try again.</p>
        <button
          type="button"
          onClick={() => void load()}
          className="h-11 w-full rounded-ctl border border-line bg-surface-raised text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98]"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data) return null

  const active = data.sessions.find((s) => s.ended_at === null)
  const finished = data.sessions.filter((s) => s.ended_at !== null)
  const names = new Map(data.exercises.map((e) => [e.id, e.name]))
  const bests = bestLifts(data.sets).slice(0, 5)
  const setsBySession = new Map<string, GymSet[]>()
  for (const set of data.sets) {
    const group = setsBySession.get(set.session_id)
    if (group) group.push(set)
    else setsBySession.set(set.session_id, [set])
  }
  const now = new Date()
  const todayFocus = data.splitDays.find((d) => d.weekday === londonWeekday(now))?.focus

  return (
    <BootSequence>
      <div className="mx-auto max-w-md">
        <BootItem>
          <header className="flex items-baseline justify-between pb-2 pt-2">
            <h1 className="text-screen-title text-ink">Gym</h1>
            <span className="text-label text-ink-dim">
              {WEEKDAY_LABELS[londonWeekday(now)]}
              {todayFocus ? ` · ${FOCUS_LABELS[todayFocus]}` : ''}
            </span>
          </header>
        </BootItem>

        <BootItem>
          {active ? (
            <Link
              to="/gym/session"
              className="flex min-h-[44px] items-center justify-between rounded-card border border-line bg-surface p-3 transition-transform duration-150 ease-instrument active:scale-[0.98]"
            >
              <span className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-live" aria-hidden="true" />
                <span className="text-body text-ink">Session in progress</span>
              </span>
              <span className="text-label font-mono tabular-nums text-ink-faint">
                started {clockTime.format(new Date(active.started_at))}
              </span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void start()}
              disabled={starting}
              className="h-11 w-full rounded-ctl border border-line bg-surface-raised text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98] disabled:text-ink-faint"
            >
              Start session
            </button>
          )}
        </BootItem>

        <BootItem className="mt-2.5">
          <div className="grid grid-cols-3 gap-2">
            <Link
              to="/gym/coach"
              className="rounded-card border border-line bg-surface px-2.5 py-2.5 transition-transform duration-150 ease-instrument active:scale-[0.98]"
            >
              <span className="block text-body text-ink">Coach</span>
              <span className="block text-label text-ink-faint">Progression</span>
            </Link>
            <Link
              to="/gym/split"
              className="rounded-card border border-line bg-surface px-2.5 py-2.5 transition-transform duration-150 ease-instrument active:scale-[0.98]"
            >
              <span className="block text-body text-ink">Split</span>
              <span className="block text-label text-ink-faint">Weekly plan</span>
            </Link>
            <Link
              to="/gym/exercises"
              className="rounded-card border border-line bg-surface px-2.5 py-2.5 transition-transform duration-150 ease-instrument active:scale-[0.98]"
            >
              <span className="block text-body text-ink">Exercises</span>
              <span className="block text-label text-ink-faint">Ranges, increments</span>
            </Link>
          </div>
        </BootItem>

        {bests.length > 0 && (
          <BootItem className="mt-2.5 rounded-card border border-line bg-surface p-3">
            <h2 className="text-card-title text-ink">Best lifts</h2>
            <ul className="mt-2 space-y-2">
              {bests.map((lift) => {
                const recent = inLondonWeek(lift.performedAt, now)
                return (
                  <li key={lift.exerciseId} className="flex items-baseline justify-between">
                    <span className="text-body text-ink-dim">
                      {names.get(lift.exerciseId) ?? 'Unknown exercise'}
                    </span>
                    <span
                      className={`text-metric-sm font-mono tabular-nums ${recent ? 'text-live' : 'text-ink'}`}
                    >
                      {fmtKg(lift.e1rmKg)} <span className="text-label text-ink-faint">kg e1RM</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </BootItem>
        )}

        {finished.length > 0 && (
          <BootItem className="mt-2.5 rounded-card border border-line bg-surface p-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-card-title text-ink">History</h2>
              <Link to="/gym/history" className="flex min-h-[44px] items-center px-2 text-label text-ink-dim">
                All sessions
              </Link>
            </div>
            <ul className="mt-1">
              {finished.slice(0, 5).map((session) => {
                const sets = setsBySession.get(session.id) ?? []
                return (
                  <li key={session.id}>
                    <Link
                      to={`/gym/session/${session.id}`}
                      className="flex min-h-[44px] items-center justify-between border-b border-line py-2 last:border-b-0"
                    >
                      <span className="text-body text-ink-dim">
                        {sessionDate.format(new Date(session.started_at))}
                      </span>
                      <span className="text-label font-mono tabular-nums text-ink-faint">
                        {sets.length} sets · {fmtKg(totalVolumeKg(sets))} kg
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </BootItem>
        )}

        {!active && finished.length === 0 && (
          <BootItem>
            <p className="py-16 text-center text-body text-ink-dim">Log your first workout</p>
          </BootItem>
        )}
      </div>
    </BootSequence>
  )
}
