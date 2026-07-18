import type { GymSet } from './types'

/**
 * Estimated one-rep max, Epley formula. A single rep is the lift itself;
 * beyond ~12 reps the estimate is soft but still monotonic, which is all
 * PR detection needs.
 */
export function e1rm(weightKg: number, reps: number): number {
  if (reps <= 1) return weightKg
  return weightKg * (1 + reps / 30)
}

function chronological(sets: GymSet[]): GymSet[] {
  return [...sets].sort(
    (a, b) => a.performed_at.localeCompare(b.performed_at) || a.id.localeCompare(b.id),
  )
}

/**
 * Ids of sets that strictly beat the best prior e1RM for their exercise.
 * The first set ever logged for an exercise is a baseline, not a PR —
 * otherwise every new exercise would light up.
 */
export function prSetIds(sets: GymSet[]): Set<string> {
  const best = new Map<string, number>()
  const prs = new Set<string>()
  for (const set of chronological(sets)) {
    const score = e1rm(set.weight_kg, set.reps)
    const prior = best.get(set.exercise_id)
    if (prior !== undefined && score > prior) prs.add(set.id)
    if (prior === undefined || score > prior) best.set(set.exercise_id, score)
  }
  return prs
}

export interface BestLift {
  exerciseId: string
  e1rmKg: number
  weightKg: number
  reps: number
  performedAt: string
}

/** All-time best e1RM per exercise, highest first. */
export function bestLifts(sets: GymSet[]): BestLift[] {
  const best = new Map<string, BestLift>()
  for (const set of chronological(sets)) {
    const score = e1rm(set.weight_kg, set.reps)
    const prior = best.get(set.exercise_id)
    if (!prior || score > prior.e1rmKg) {
      best.set(set.exercise_id, {
        exerciseId: set.exercise_id,
        e1rmKg: score,
        weightKg: set.weight_kg,
        reps: set.reps,
        performedAt: set.performed_at,
      })
    }
  }
  return [...best.values()].sort((a, b) => b.e1rmKg - a.e1rmKg)
}

/**
 * Best e1RM per session for one exercise, in session order — the strength
 * sparkline feed.
 */
export function bestPerSession(sets: GymSet[], exerciseId: string): number[] {
  const bySession = new Map<string, number>()
  for (const set of chronological(sets)) {
    if (set.exercise_id !== exerciseId) continue
    const score = e1rm(set.weight_kg, set.reps)
    const prior = bySession.get(set.session_id)
    if (prior === undefined || score > prior) bySession.set(set.session_id, score)
  }
  // chronological() ordered the sets, so Map insertion order is session order.
  return [...bySession.values()]
}

/** Σ weight × reps. */
export function totalVolumeKg(sets: GymSet[]): number {
  return sets.reduce((sum, s) => sum + s.weight_kg * s.reps, 0)
}
