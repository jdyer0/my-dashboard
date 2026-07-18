import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BootItem, BootSequence } from '../motion/BootSequence'
import { listAllSets, listExercises, listSessions } from '../gym/data'
import { prSetIds, totalVolumeKg } from '../gym/e1rm'
import { clockTime, fmtKg, sessionDate } from '../gym/format'
import type { Exercise, GymSession, GymSet } from '../gym/types'

const monthFormat = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/London',
})

interface HistoryData {
  sessions: GymSession[]
  sets: GymSet[]
  exercises: Exercise[]
}

function durationMin(session: GymSession): number | null {
  if (!session.ended_at) return null
  const ms = new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()
  return Math.round(ms / 60000)
}

export function GymHistory() {
  const [data, setData] = useState<HistoryData | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([listSessions(), listAllSets(), listExercises()]).then(
      ([sessions, sets, exercises]) => {
        if (!cancelled) setData({ sessions, sets, exercises })
      },
      () => {
        if (!cancelled) setFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  const derived = useMemo(() => {
    if (!data) return null
    const names = new Map(data.exercises.map((e) => [e.id, e.name]))
    const prs = prSetIds(data.sets)
    const setsBySession = new Map<string, GymSet[]>()
    for (const set of data.sets) {
      const group = setsBySession.get(set.session_id)
      if (group) group.push(set)
      else setsBySession.set(set.session_id, [set])
    }

    // Newest first, finished sessions only, grouped by London month.
    const months: { label: string; sessions: GymSession[] }[] = []
    for (const session of data.sessions.filter((s) => s.ended_at !== null)) {
      const label = monthFormat.format(new Date(session.started_at))
      const last = months[months.length - 1]
      if (last && last.label === label) last.sessions.push(session)
      else months.push({ label, sessions: [session] })
    }
    return { names, prs, setsBySession, months }
  }, [data])

  if (failed) {
    return (
      <div className="mx-auto max-w-md">
        <p className="py-8 text-body text-alert">Couldn't load your history. Go back and retry.</p>
      </div>
    )
  }

  if (!derived) return null

  return (
    <BootSequence>
      <div className="mx-auto max-w-md">
        <BootItem>
          <header className="pb-2 pt-2">
            <h1 className="text-screen-title text-ink">History</h1>
            <p className="mt-0.5 text-label font-mono tabular-nums text-ink-faint">
              {derived.months.reduce((n, m) => n + m.sessions.length, 0)} sessions
            </p>
          </header>
        </BootItem>

        {derived.months.length === 0 && (
          <BootItem>
            <p className="py-16 text-center text-body text-ink-dim">Log your first workout</p>
          </BootItem>
        )}

        {derived.months.map((month) => (
          <BootItem key={month.label} className="mb-2.5">
            <h2 className="pb-1.5 pt-1 text-label text-ink-faint">{month.label.toLowerCase()}</h2>
            <div className="rounded-card border border-line bg-surface px-3 py-1">
              <ul>
                {month.sessions.map((session) => {
                  const sets = derived.setsBySession.get(session.id) ?? []
                  const prCount = sets.filter((s) => derived.prs.has(s.id)).length
                  const minutes = durationMin(session)
                  const exerciseNames = [...new Set(sets.map((s) => s.exercise_id))]
                    .map((id) => derived.names.get(id) ?? '')
                    .filter(Boolean)
                  return (
                    <li key={session.id}>
                      <Link
                        to={`/gym/session/${session.id}`}
                        className="block border-b border-line py-2.5 last:border-b-0"
                      >
                        <div className="flex items-baseline justify-between">
                          <span className="text-body text-ink">
                            {sessionDate.format(new Date(session.started_at))}
                          </span>
                          <span className="text-label font-mono tabular-nums text-ink-faint">
                            {clockTime.format(new Date(session.started_at))}
                            {minutes !== null ? ` · ${minutes} min` : ''}
                          </span>
                        </div>
                        {exerciseNames.length > 0 && (
                          <p className="mt-0.5 truncate text-label text-ink-faint">
                            {exerciseNames.join(', ')}
                          </p>
                        )}
                        <div className="mt-1 flex items-baseline justify-between">
                          <span className="text-label font-mono tabular-nums text-ink-dim">
                            {sets.length} sets · {fmtKg(totalVolumeKg(sets))} kg
                          </span>
                          {prCount > 0 && (
                            <span className="glow-live text-label font-mono tabular-nums text-live">
                              {prCount} PR{prCount > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          </BootItem>
        ))}
      </div>
    </BootSequence>
  )
}
