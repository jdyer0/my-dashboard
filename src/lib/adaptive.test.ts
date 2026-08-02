import { describe, expect, it } from 'vitest'
import {
  checkInDue,
  daysBetween,
  estimateExpenditure,
  goalStatus,
  KCAL_PER_KG,
  linearFit,
  macroEnergy,
  programTargets,
  trendWeights,
  type DailyIntake,
  type WeighIn,
} from './adaptive'

/** A day key moved by n calendar days. */
function shift(start: string, n: number): string {
  const [y, m, d] = start.split('-').map(Number)
  const date = new Date(Date.UTC(y as number, (m as number) - 1, d as number, 12))
  date.setUTCDate(date.getUTCDate() + n)
  return date.toISOString().slice(0, 10)
}

/** n consecutive day keys from a start day. */
function days(start: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shift(start, i))
}

describe('daysBetween', () => {
  it('counts calendar days', () => {
    expect(daysBetween('2026-07-01', '2026-07-08')).toBe(7)
    expect(daysBetween('2026-07-08', '2026-07-01')).toBe(-7)
    expect(daysBetween('2026-07-01', '2026-07-01')).toBe(0)
  })

  it('spans a month and a year boundary', () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1)
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1)
  })

  it('is unaffected by the BST transition', () => {
    // Clocks go forward 2026-03-29 and back 2026-10-25. A naive local-midnight
    // subtraction would give 0.958 and 1.041 days across these.
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
  })
})

describe('trendWeights', () => {
  it('starts the trend at the first reading', () => {
    const trend = trendWeights([{ day: '2026-07-01', kg: 84 }])
    expect(trend[0]?.trendKg).toBe(84)
  })

  it('lags the scale, damping a single spike', () => {
    const weighIns: WeighIn[] = days('2026-07-01', 5).map((day, i) => ({
      day,
      // A 2 kg salt spike on day three.
      kg: i === 2 ? 86 : 84,
    }))
    const trend = trendWeights(weighIns)
    const spike = trend[2]
    expect(spike?.kg).toBe(86)
    // The trend absorbs at most the smoothing constant's share of the jump.
    expect(spike?.trendKg).toBeLessThan(84.4)
    expect(spike?.trendKg).toBeGreaterThan(84)
    // And it settles back toward the true weight afterwards.
    expect(trend[4]?.trendKg).toBeLessThan(spike?.trendKg as number)
  })

  it('converges on a sustained change', () => {
    const weighIns: WeighIn[] = days('2026-07-01', 60).map((day) => ({ day, kg: 80 }))
    weighIns[0] = { day: weighIns[0]?.day as string, kg: 90 }
    const trend = trendWeights(weighIns)
    expect(trend[trend.length - 1]?.trendKg).toBeCloseTo(80, 1)
  })

  it('treats a weigh-in after a gap as new information, not as yesterday', () => {
    const gapped = trendWeights([
      { day: '2026-07-01', kg: 84 },
      { day: '2026-07-21', kg: 88 },
    ])
    const adjacent = trendWeights([
      { day: '2026-07-01', kg: 84 },
      { day: '2026-07-02', kg: 88 },
    ])
    // Twenty days of compounded decay moves the trend far further than one.
    expect(gapped[1]?.trendKg as number).toBeGreaterThan(adjacent[1]?.trendKg as number)
    expect(gapped[1]?.trendKg).toBeGreaterThan(87)
  })

  it('sorts unordered weigh-ins before smoothing', () => {
    const ordered = trendWeights([
      { day: '2026-07-01', kg: 84 },
      { day: '2026-07-02', kg: 85 },
      { day: '2026-07-03', kg: 86 },
    ])
    const shuffled = trendWeights([
      { day: '2026-07-03', kg: 86 },
      { day: '2026-07-01', kg: 84 },
      { day: '2026-07-02', kg: 85 },
    ])
    expect(shuffled).toEqual(ordered)
  })

  it('returns nothing for no weigh-ins', () => {
    expect(trendWeights([])).toEqual([])
  })
})

describe('linearFit', () => {
  it('recovers a known slope exactly', () => {
    const fit = linearFit([
      { x: 0, y: 10 },
      { x: 1, y: 12 },
      { x: 2, y: 14 },
    ])
    expect(fit?.perDay).toBeCloseTo(2, 10)
    expect(fit?.fittedLast).toBeCloseTo(14, 10)
    expect(fit?.standardError).toBeCloseTo(0, 10)
  })

  it('reports a wider standard error on scattered points', () => {
    const tight = linearFit([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3.05 },
    ])
    const loose = linearFit([
      { x: 0, y: 0 },
      { x: 1, y: 3 },
      { x: 2, y: -1 },
      { x: 3, y: 4 },
    ])
    expect(loose?.standardError as number).toBeGreaterThan(tight?.standardError as number)
  })

  it('refuses a fit it cannot make', () => {
    expect(linearFit([])).toBeNull()
    expect(linearFit([{ x: 1, y: 1 }])).toBeNull()
    // No spread in x — a vertical fit has no slope to report.
    expect(
      linearFit([
        { x: 3, y: 1 },
        { x: 3, y: 9 },
      ]),
    ).toBeNull()
  })
})

describe('estimateExpenditure', () => {
  const today = '2026-07-28'

  /**
   * Logging at a fixed intake with a fixed weight drift, ending today.
   * `runUp` days of history precede the 28-day window: the smoother needs a
   * run-up to shed its cold start, and clipping the trend to the window
   * afterwards is exactly what estimateExpenditure does.
   */
  function scenario(kcalPerDay: number, kgPerDay: number, runUp = 40, startKg = 84) {
    const keys = days(shift(today, -(27 + runUp)), 28 + runUp)
    const weighIns: WeighIn[] = keys.map((day, i) => ({ day, kg: startKg + kgPerDay * i }))
    const intake: DailyIntake[] = keys.map((day) => ({ day, kcal: kcalPerDay }))
    return { weighIns, intake, windowKeys: keys.slice(runUp) }
  }

  it('returns maintenance intake when the trend is flat', () => {
    const { weighIns, intake } = scenario(2500, 0)
    const est = estimateExpenditure(weighIns, intake, 28, today)
    expect(est?.kcal).toBeCloseTo(2500, 0)
    expect(est?.ratePerWeekKg).toBeCloseTo(0, 6)
  })

  it('reads expenditure above intake when weight is falling', () => {
    // Losing 0.5 kg/week on 2,000 kcal implies burning ~2,550.
    const { weighIns, intake } = scenario(2000, -0.5 / 7)
    const est = estimateExpenditure(weighIns, intake, 28, today)
    expect(est?.kcal).toBeGreaterThan(2000)
    expect(est?.kcal).toBeCloseTo(2000 + (0.5 * KCAL_PER_KG) / 7, -1)
    expect(est?.ratePerWeekKg).toBeCloseTo(-0.5, 1)
  })

  it('under-reads the rate when the smoother has no run-up', () => {
    // The trend lags a steady ramp, so a window that starts at the very first
    // weigh-in reads a shallower slope than the truth. Real use always has
    // history behind the window; this pins the cold-start behaviour so it
    // can't drift into the run-up case unnoticed.
    const cold = scenario(2000, -0.5 / 7, 0)
    const est = estimateExpenditure(cold.weighIns, cold.intake, 28, today)
    expect(est?.ratePerWeekKg as number).toBeGreaterThan(-0.5)
    expect(est?.kcal as number).toBeLessThan(2000 + (0.5 * KCAL_PER_KG) / 7)
  })

  it('reads expenditure below intake when weight is rising', () => {
    const { weighIns, intake } = scenario(3000, 0.25 / 7)
    const est = estimateExpenditure(weighIns, intake, 28, today)
    expect(est?.kcal).toBeLessThan(3000)
    expect(est?.kcal).toBeCloseTo(3000 - (0.25 * KCAL_PER_KG) / 7, -1)
    expect(est?.ratePerWeekKg).toBeCloseTo(0.25, 1)
  })

  it('never averages an unlogged day as a zero-calorie day', () => {
    const { weighIns, intake, windowKeys } = scenario(2500, 0)
    // Blank the first week inside the window. Mean intake must stay 2,500,
    // not fall toward 1,875 as it would if a blank day counted as zero.
    const blanked = new Set(windowKeys.slice(0, 7))
    const withGaps = intake.map((d) => (blanked.has(d.day) ? { day: d.day, kcal: null } : d))
    const est = estimateExpenditure(weighIns, withGaps, 28, today)
    expect(est?.kcal).toBeCloseTo(2500, 0)
    expect(est?.loggedDays).toBe(21)
  })

  it('widens the error band when intake swings', () => {
    const keys = days('2026-07-01', 28)
    const weighIns: WeighIn[] = keys.map((day) => ({ day, kg: 84 }))
    const steady = estimateExpenditure(
      weighIns,
      keys.map((day) => ({ day, kcal: 2500 })),
      28,
      today,
    )
    const swinging = estimateExpenditure(
      weighIns,
      keys.map((day, i) => ({ day, kcal: i % 2 === 0 ? 1500 : 3500 })),
      28,
      today,
    )
    expect(swinging?.errorKcal as number).toBeGreaterThan(steady?.errorKcal as number)
  })

  it('refuses to guess from too few logged days', () => {
    const { weighIns, intake, windowKeys } = scenario(2500, 0)
    // Nine logged days inside the window, one short of the minimum.
    const kept = new Set(windowKeys.slice(0, 9))
    const sparse = intake.map((d) => (kept.has(d.day) ? d : { day: d.day, kcal: null }))
    expect(estimateExpenditure(weighIns, sparse, 28, today)).toBeNull()
  })

  it('refuses to guess from too few weigh-ins', () => {
    const { weighIns, intake, windowKeys } = scenario(2500, 0)
    // Three weigh-ins inside the window; the run-up ones don't count.
    const kept = new Set(windowKeys.filter((_, i) => i % 12 === 0))
    expect(
      estimateExpenditure(
        weighIns.filter((w) => kept.has(w.day)),
        intake,
        28,
        today,
      ),
    ).toBeNull()
  })

  it('refuses when the weigh-ins are bunched into too short a span', () => {
    const { intake } = scenario(2500, 0)
    // Six weigh-ins, but all inside five days — no lever arm for a slope.
    const bunched: WeighIn[] = days('2026-07-24', 5).map((day, i) => ({ day, kg: 84 + i * 0.1 }))
    expect(estimateExpenditure(bunched, intake, 28, today)).toBeNull()
  })

  it('ignores data outside the window', () => {
    const keys = days('2026-06-01', 58)
    const weighIns: WeighIn[] = keys.map((day) => ({ day, kg: 84 }))
    // Ancient history at a wildly different intake must not drag the estimate.
    const intake: DailyIntake[] = keys.map((day, i) => ({ day, kcal: i < 30 ? 5000 : 2200 }))
    const est = estimateExpenditure(weighIns, intake, 28, today)
    expect(est?.kcal).toBeCloseTo(2200, 0)
  })
})

describe('programTargets', () => {
  const base = {
    expenditureKcal: 2700,
    goalRateKgPerWeek: 0,
    trendWeightKg: 84,
    proteinGPerKg: 1.8,
    fatPctEnergy: 0.3,
  }

  it('eats at expenditure to maintain', () => {
    expect(programTargets(base).kcal).toBe(2700)
  })

  it('subtracts the energy cost of the goal rate', () => {
    const cut = programTargets({ ...base, goalRateKgPerWeek: -0.5 })
    expect(cut.kcal).toBe(Math.round(2700 - (0.5 * KCAL_PER_KG) / 7))
  })

  it('adds it for a gaining goal', () => {
    const bulk = programTargets({ ...base, goalRateKgPerWeek: 0.25 })
    expect(bulk.kcal).toBeGreaterThan(2700)
  })

  it('scales protein from bodyweight, not from calories', () => {
    expect(programTargets(base).proteinG).toBe(Math.round(84 * 1.8))
    expect(programTargets({ ...base, goalRateKgPerWeek: -1 }).proteinG).toBe(Math.round(84 * 1.8))
  })

  it('makes the macros add up to the calorie target', () => {
    for (const rate of [-1, -0.5, 0, 0.5]) {
      const t = programTargets({ ...base, goalRateKgPerWeek: rate })
      // Rounding to whole grams costs a few kcal, no more.
      expect(Math.abs(macroEnergy(t) - t.kcal)).toBeLessThanOrEqual(10)
    }
  })

  it('refuses a crash deficit however aggressive the goal', () => {
    const t = programTargets({ ...base, goalRateKgPerWeek: -1.5 })
    expect(t.kcal).toBeGreaterThanOrEqual(Math.round(2700 * 0.65))
  })

  it('holds a calorie floor for a small person on a deep cut', () => {
    const t = programTargets({
      ...base,
      expenditureKcal: 1500,
      goalRateKgPerWeek: -1.5,
      trendWeightKg: 50,
    })
    expect(t.kcal).toBeGreaterThanOrEqual(1200)
  })

  it('gives energy back from fat rather than letting carbs go negative', () => {
    // Very high protein against a small budget: protein alone nearly fills it.
    const t = programTargets({
      expenditureKcal: 1600,
      goalRateKgPerWeek: -1,
      trendWeightKg: 95,
      proteinGPerKg: 3.5,
      fatPctEnergy: 0.4,
    })
    expect(t.carbG).toBeGreaterThanOrEqual(0)
    // Fat is squeezed but never below the essential floor.
    expect(t.fatG).toBeGreaterThanOrEqual(Math.round(95 * 0.5) - 1)
  })

  it('honours the fat share when there is room for it', () => {
    const t = programTargets({ ...base, fatPctEnergy: 0.35 })
    expect(t.fatG).toBe(Math.round((t.kcal * 0.35) / 9))
  })
})

describe('checkInDue', () => {
  it('is due immediately when no program has ever been issued', () => {
    expect(checkInDue(null, '2026-07-27')).toBe('2026-07-27')
  })

  it('is due once the week rolls over', () => {
    expect(checkInDue('2026-07-20', '2026-07-27')).toBe('2026-07-27')
  })

  it('is not due again inside the same week', () => {
    expect(checkInDue('2026-07-27', '2026-07-27')).toBeNull()
  })

  it('is not due when the stored program somehow leads the week', () => {
    expect(checkInDue('2026-08-03', '2026-07-27')).toBeNull()
  })
})

describe('goalStatus', () => {
  it('is unknown without a measured rate', () => {
    expect(goalStatus(null, -0.5)).toBe('unknown')
  })

  it('calls a rate inside the tolerance on track', () => {
    expect(goalStatus(-0.45, -0.5)).toBe('on-track')
    expect(goalStatus(-0.7, -0.5)).toBe('on-track')
  })

  it('flags losing faster than intended', () => {
    expect(goalStatus(-1.2, -0.5)).toBe('faster')
  })

  it('flags losing slower than intended', () => {
    expect(goalStatus(0.1, -0.5)).toBe('slower')
  })

  it('flags gaining faster than intended', () => {
    expect(goalStatus(1.0, 0.25)).toBe('faster')
  })

  it('treats any drift as movement on a maintenance goal', () => {
    expect(goalStatus(0.05, 0)).toBe('on-track')
    expect(goalStatus(0.6, 0)).toBe('faster')
    expect(goalStatus(-0.6, 0)).toBe('faster')
  })
})
