import { describe, expect, it } from 'vitest'
import { adviseProgression, predictedRepsAt } from './coach'
import { e1rm } from './e1rm'

const range = { incrementKg: 2.5, repRangeMin: 8, repRangeMax: 12 }

describe('predictedRepsAt', () => {
  it('inverts Epley', () => {
    // 100 kg × 10 reps -> e1RM 133.3; back at 100 kg that predicts 10 reps.
    const score = e1rm(100, 10)
    expect(predictedRepsAt(score, 100)).toBe(10)
  })

  it('is a single at or above the e1RM', () => {
    expect(predictedRepsAt(120, 125)).toBe(1)
  })
})

describe('adviseProgression', () => {
  it('moves up one increment at the top of the range', () => {
    const advice = adviseProgression({ weightKg: 100, reps: 12, ...range })
    expect(advice.action).toBe('increase')
    expect(advice.targetWeightKg).toBe(102.5)
    expect(advice.predictedReps).toBeGreaterThanOrEqual(8)
  })

  it('jumps more than one increment after a big overshoot', () => {
    const advice = adviseProgression({ weightKg: 100, reps: 16, ...range })
    expect(advice.action).toBe('increase')
    expect(advice.targetWeightKg).toBeGreaterThan(102.5)
    // Never lands below the bottom of the range.
    expect(advice.predictedReps).toBeGreaterThanOrEqual(8)
  })

  it('holds inside the range', () => {
    const advice = adviseProgression({ weightKg: 100, reps: 10, ...range })
    expect(advice.action).toBe('hold')
    expect(advice.targetWeightKg).toBe(100)
  })

  it('holds at the bottom edge of the range', () => {
    expect(adviseProgression({ weightKg: 100, reps: 8, ...range }).action).toBe('hold')
  })

  it('drops back below the range', () => {
    const advice = adviseProgression({ weightKg: 100, reps: 5, ...range })
    expect(advice.action).toBe('decrease')
    expect(advice.targetWeightKg).toBeLessThan(100)
    expect(advice.targetWeightKg).toBeGreaterThan(0)
  })

  it('never recommends a non-positive weight', () => {
    const advice = adviseProgression({
      weightKg: 2.5,
      reps: 5,
      incrementKg: 2.5,
      repRangeMin: 8,
      repRangeMax: 12,
    })
    expect(advice.action).toBe('hold')
    expect(advice.targetWeightKg).toBe(2.5)
  })

  it('respects custom increments and ranges', () => {
    const advice = adviseProgression({
      weightKg: 20,
      reps: 6,
      incrementKg: 2,
      repRangeMin: 4,
      repRangeMax: 6,
    })
    expect(advice.action).toBe('increase')
    expect(advice.targetWeightKg % 2).toBeCloseTo(0, 5)
  })
})
