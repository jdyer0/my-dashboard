import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { deleteSession, fetchSession, listAllSets, listExercises } from '../gym/data'
import { e1rm, prSetIds, totalVolumeKg } from '../gym/e1rm'
import { clockTime, fmtKg, sessionDate } from '../gym/format'
import type { Exercise, GymSession as Session, GymSet } from '../gym/types'

export function GymSessionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null>(null)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [allSets, setAllSets] = useState<GymSet[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    async function load(sessionId: string) {
      try {
        const [found, allExercises, sets] = await Promise.all([
          fetchSession(sessionId),
          listExercises(),
          listAllSets(),
        ])
        if (cancelled) return
        if (!found) {
          navigate('/gym', { replace: true })
          return
        }
        setSession(found)
        setExercises(allExercises)
        setAllSets(sets)
        setLoaded(true)
      } catch {
        if (!cancelled) setFailed(true)
      }
    }
    void load(id)
    return () => {
      cancelled = true
    }
  }, [id, navigate])

  const sessionSets = useMemo(
    () => allSets.filter((s) => s.session_id === id),
    [allSets, id],
  )
  const prs = useMemo(() => prSetIds(allSets), [allSets])
  const names = useMemo(() => new Map(exercises.map((e) => [e.id, e.name])), [exercises])

  const groups = useMemo(() => {
    const byExercise = new Map<string, GymSet[]>()
    for (const set of sessionSets) {
      const group = byExercise.get(set.exercise_id)
      if (group) group.push(set)
      else byExercise.set(set.exercise_id, [set])
    }
    return [...byExercise.entries()].map(([exerciseId, sets]) => ({ exerciseId, sets }))
  }, [sessionSets])

  async function remove() {
    if (!id || deleting) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    try {
      await deleteSession(id)
      navigate('/gym', { replace: true })
    } catch {
      setDeleting(false)
      setConfirmDelete(false)
      setFailed(true)
    }
  }

  if (failed) {
    return (
      <div className="mx-auto w-full max-w-md md:max-w-2xl">
        <p className="py-8 text-body text-alert">Couldn't load the session. Go back and retry.</p>
      </div>
    )
  }

  if (!loaded || !session) return null

  const started = new Date(session.started_at)

  return (
    <div className="mx-auto w-full max-w-md md:max-w-2xl">
      <header className="pb-2 pt-2">
        <h1 className="text-screen-title text-ink">{sessionDate.format(started)}</h1>
        <p className="mt-0.5 text-label font-mono tabular-nums text-ink-faint">
          {clockTime.format(started)}
          {session.ended_at ? `–${clockTime.format(new Date(session.ended_at))}` : ''} ·{' '}
          {sessionSets.length} sets · {fmtKg(totalVolumeKg(sessionSets))} kg
        </p>
      </header>

      <div className="space-y-2.5">
        {groups.map((group) => (
          <section key={group.exerciseId} className="rounded-card border border-line bg-surface p-3">
            <h2 className="text-card-title text-ink">
              {names.get(group.exerciseId) ?? 'Unknown exercise'}
            </h2>
            <ul className="mt-1">
              {group.sets.map((set) => {
                const isPr = prs.has(set.id)
                return (
                  <li
                    key={set.id}
                    className="flex min-h-[36px] items-center justify-between border-b border-line py-1 last:border-b-0"
                  >
                    <span className="text-metric-sm font-mono tabular-nums text-ink">
                      {fmtKg(set.weight_kg)} kg × {set.reps}
                    </span>
                    <span
                      className={`text-label font-mono tabular-nums ${isPr ? 'glow-live text-live' : 'text-ink-faint'}`}
                    >
                      {isPr ? 'PR ' : ''}e1RM {fmtKg(e1rm(set.weight_kg, set.reps))}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void remove()}
        disabled={deleting}
        className="mt-6 h-11 w-full rounded-ctl border border-line text-body text-alert transition-transform duration-150 ease-instrument active:scale-[0.98] disabled:text-ink-faint"
      >
        {confirmDelete ? 'Tap again to delete' : 'Delete session'}
      </button>
    </div>
  )
}
