import { e1rm } from './e1rm'

// Double progression, the science-based lifting default: work a fixed rep
// range at a weight; once the top of the range falls, add the smallest
// increment the kit allows and rebuild reps from lower in the range. The
// Epley inverse predicts where reps land after a jump, so a big overshoot
// (15 reps on an 8–12 exercise) earns a bigger jump than one increment.

export interface CoachInput {
  weightKg: number
  reps: number
  incrementKg: number
  repRangeMin: number
  repRangeMax: number
}

export interface CoachAdvice {
  action: 'increase' | 'hold' | 'decrease'
  targetWeightKg: number
  /** Predicted reps at the target weight, from current e1RM. */
  predictedReps: number | null
  reason: string
}

/** Epley inverted: reps a lifter should manage at `weightKg` given an e1RM. */
export function predictedRepsAt(e1rmKg: number, weightKg: number): number {
  if (weightKg <= 0) return 0
  if (weightKg >= e1rmKg) return 1
  // Epsilon guards the floor against float error (9.999… must count as 10).
  return Math.floor(30 * (e1rmKg / weightKg - 1) + 1e-9)
}

export function adviseProgression(input: CoachInput): CoachAdvice {
  const { weightKg, reps, incrementKg, repRangeMin, repRangeMax } = input
  const score = e1rm(weightKg, reps)

  if (reps >= repRangeMax) {
    // Smallest jump that lands predicted reps back inside the range. If even
    // one increment leaves the predicted reps at or above the top, keep
    // adding increments — but never jump below the bottom of the range.
    let steps = 1
    while (
      predictedRepsAt(score, weightKg + (steps + 1) * incrementKg) >= repRangeMax &&
      predictedRepsAt(score, weightKg + (steps + 1) * incrementKg) >= repRangeMin
    ) {
      steps++
    }
    // Step back if the jump overshoots past the bottom of the range and a
    // smaller jump is available.
    while (steps > 1 && predictedRepsAt(score, weightKg + steps * incrementKg) < repRangeMin) {
      steps--
    }
    const target = weightKg + steps * incrementKg
    return {
      action: 'increase',
      targetWeightKg: target,
      predictedReps: predictedRepsAt(score, target),
      reason: `${reps} reps is the top of your ${repRangeMin}–${repRangeMax} range. Move up and rebuild.`,
    }
  }

  if (reps >= repRangeMin) {
    return {
      action: 'hold',
      targetWeightKg: weightKg,
      predictedReps: null,
      reason: `Stay at this weight and add reps. Increase when you hit ${repRangeMax}.`,
    }
  }

  // Below the range: the weight is ahead of the rep target. Drop the smallest
  // number of increments that brings the predicted reps back to the bottom.
  let steps = 1
  while (
    weightKg - (steps + 1) * incrementKg > 0 &&
    predictedRepsAt(score, weightKg - steps * incrementKg) < repRangeMin
  ) {
    steps++
  }
  const target = weightKg - steps * incrementKg
  if (target <= 0) {
    return {
      action: 'hold',
      targetWeightKg: weightKg,
      predictedReps: null,
      reason: `Below your ${repRangeMin}–${repRangeMax} range. Build reps here before moving up.`,
    }
  }
  return {
    action: 'decrease',
    targetWeightKg: target,
    predictedReps: predictedRepsAt(score, target),
    reason: `${reps} reps is under your ${repRangeMin}–${repRangeMax} range. Drop back and own the range first.`,
  }
}
