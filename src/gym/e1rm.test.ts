import { describe, expect, it } from 'vitest'
import { bestLifts, bestPerSession, e1rm, prSetIds, totalVolumeKg } from './e1rm'
import type { GymSet } from './types'

function set(partial: Partial<GymSet> & Pick<GymSet, 'id' | 'weight_kg' | 'reps'>): GymSet {
  return {
    session_id: 's1',
    exercise_id: 'bench',
    performed_at: `2026-07-01T10:00:0${partial.id.slice(-1)}Z`,
    ...partial,
  }
}

describe('e1rm', () => {
  it('returns the weight itself for a single', () => {
    expect(e1rm(100, 1)).toBe(100)
  })

  it('applies Epley above one rep', () => {
    expect(e1rm(100, 5)).toBeCloseTo(116.667, 3)
    expect(e1rm(60, 10)).toBeCloseTo(80, 5)
  })

  it('is monotonic in weight and reps', () => {
    expect(e1rm(102.5, 3)).toBeGreaterThan(e1rm(100, 3))
    expect(e1rm(100, 4)).toBeGreaterThan(e1rm(100, 3))
  })
})

describe('prSetIds', () => {
  it('never marks the first set of an exercise', () => {
    expect(prSetIds([set({ id: 'a1', weight_kg: 100, reps: 5 })])).toEqual(new Set())
  })

  it('marks strict improvements only, tracked per exercise', () => {
    const sets = [
      set({ id: 'a1', weight_kg: 100, reps: 5 }), // baseline bench: 116.7
      set({ id: 'a2', weight_kg: 100, reps: 5 }), // equal — not a PR
      set({ id: 'a3', weight_kg: 105, reps: 5 }), // beats it — PR
      set({ id: 'a4', weight_kg: 60, reps: 5, exercise_id: 'squat' }), // baseline squat
      set({ id: 'a5', weight_kg: 62.5, reps: 5, exercise_id: 'squat' }), // squat PR
      set({ id: 'a6', weight_kg: 90, reps: 5 }), // below bench best
    ]
    expect(prSetIds(sets)).toEqual(new Set(['a3', 'a5']))
  })

  it('orders by performed_at, not array order', () => {
    const early = set({ id: 'a2', weight_kg: 110, reps: 5 })
    const late = set({ id: 'a9', weight_kg: 100, reps: 5 })
    // Passed reversed: the heavier, earlier set is the baseline.
    expect(prSetIds([late, early])).toEqual(new Set())
  })
})

describe('bestLifts', () => {
  it('keeps the best per exercise, highest first', () => {
    const lifts = bestLifts([
      set({ id: 'a1', weight_kg: 100, reps: 5 }),
      set({ id: 'a2', weight_kg: 105, reps: 3 }),
      set({ id: 'a3', weight_kg: 140, reps: 5, exercise_id: 'deadlift' }),
    ])
    expect(lifts.map((l) => l.exerciseId)).toEqual(['deadlift', 'bench'])
    expect(lifts[1]?.e1rmKg).toBeCloseTo(e1rm(100, 5), 5)
    expect(lifts[1]?.weightKg).toBe(100)
    expect(lifts[1]?.reps).toBe(5)
  })
})

describe('bestPerSession', () => {
  it('takes the session best, in session order, one exercise only', () => {
    const sets = [
      set({ id: 'a1', weight_kg: 100, reps: 5, session_id: 's1' }),
      set({ id: 'a2', weight_kg: 100, reps: 8, session_id: 's1' }),
      set({ id: 'a3', weight_kg: 180, reps: 1, exercise_id: 'deadlift', session_id: 's1' }),
      set({
        id: 'a4',
        weight_kg: 102.5,
        reps: 5,
        session_id: 's2',
        performed_at: '2026-07-03T10:00:00Z',
      }),
    ]
    expect(bestPerSession(sets, 'bench')).toEqual([e1rm(100, 8), e1rm(102.5, 5)])
  })
})

describe('totalVolumeKg', () => {
  it('sums weight × reps', () => {
    expect(
      totalVolumeKg([
        set({ id: 'a1', weight_kg: 100, reps: 5 }),
        set({ id: 'a2', weight_kg: 60, reps: 10 }),
      ]),
    ).toBe(1100)
  })
})
