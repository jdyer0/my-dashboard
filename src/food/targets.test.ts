import { describe, expect, it } from 'vitest'
import { dailyEnergy, EXPENDITURE_WINDOW_DAYS, resolveCoach, type CoachInputs } from './targets'
import { DEFAULT_SETTINGS } from './data'
import { recentLondonDayKeys } from '../lib/londonDay'
import type { FoodLogEntry, NutritionProgram, WeightEntry } from './types'

const NOW = new Date('2026-07-28T12:00:00Z') // a Tuesday
const WEEK_START = '2026-07-27'

const RNI = [
  { nutrient_key: 'protein', sex: 'male' as const, age_min: 19, age_max: 50, value: 55.5 },
]

function entry(loggedAt: string, kcal: number, name = 'Toast'): FoodLogEntry {
  return {
    id: `${loggedAt}-${name}`,
    name,
    logged_at: loggedAt,
    meal: 'lunch',
    amount_g: 100,
    nutrients: { energy_kcal: { value: kcal } },
  }
}

function inputs(over: Partial<CoachInputs> = {}): CoachInputs {
  const dayKeys = recentLondonDayKeys(NOW, 90)
  return {
    profile: { sex: 'male', birth_date: '1990-05-01' },
    settings: DEFAULT_SETTINGS,
    rni: RNI,
    weights: [],
    log: [],
    windowDayKeys: dayKeys.slice(-EXPENDITURE_WINDOW_DAYS),
    programs: [],
    now: NOW,
    ...over,
  }
}

describe('dailyEnergy', () => {
  it('totals each London day and leaves unlogged days null', () => {
    const rows = dailyEnergy(
      [entry('2026-07-27T09:00:00Z', 300), entry('2026-07-27T19:00:00Z', 700, 'Curry')],
      ['2026-07-26', '2026-07-27'],
    )
    expect(rows).toEqual([
      { day: '2026-07-26', kcal: null },
      { day: '2026-07-27', kcal: 1000 },
    ])
  })

  it('bins by London day, not UTC day', () => {
    // 23:30 UTC on 30 June is 00:30 BST on 1 July — a July day, not a June one.
    const rows = dailyEnergy([entry('2026-06-30T23:30:00Z', 400)], ['2026-06-30', '2026-07-01'])
    expect(rows[0]?.kcal).toBeNull()
    expect(rows[1]?.kcal).toBe(400)
  })
})

describe('resolveCoach', () => {
  it('gives no targets until the profile has sex and date of birth', () => {
    const state = resolveCoach(inputs({ profile: { sex: null, birth_date: null } }))
    expect(state.targets).toBeNull()
  })

  it('falls back to guideline targets, labelled as such, for a fresh account', () => {
    const state = resolveCoach(inputs())
    expect(state.targets?.origin).toBe('default')
    expect(state.targets?.kcalTarget).toBe(2500)
    expect(state.expenditure).toBeNull()
    expect(state.trendWeightKg).toBeNull()
    expect(state.proposed).toBeNull()
  })

  it('offers a first check-in immediately, dated to this week', () => {
    expect(resolveCoach(inputs()).checkInFrom).toBe(WEEK_START)
  })

  it('does not offer a second check-in in the same week', () => {
    const program: NutritionProgram = {
      id: 'p1',
      effective_from: WEEK_START,
      kcal_target: 2200,
      protein_g_target: 150,
      carb_g_target: 220,
      fat_g_target: 73,
      expenditure_kcal: 2600,
      trend_weight_kg: 84,
      source: 'coached',
    }
    const state = resolveCoach(inputs({ programs: [program] }))
    expect(state.checkInFrom).toBeNull()
    expect(state.targets?.origin).toBe('coached')
    expect(state.targets?.kcalTarget).toBe(2200)
    expect(state.targets?.effectiveFrom).toBe(WEEK_START)
  })

  it('reads the accepted program even when the coach could propose a new one', () => {
    // Targets must stay put mid-week: what's on the diary is what was accepted.
    const lastWeek: NutritionProgram = {
      id: 'p0',
      effective_from: '2026-07-20',
      kcal_target: 2100,
      protein_g_target: 150,
      carb_g_target: 200,
      fat_g_target: 70,
      expenditure_kcal: 2500,
      trend_weight_kg: 84,
      source: 'coached',
    }
    const state = resolveCoach(inputs({ programs: [lastWeek] }))
    expect(state.targets?.kcalTarget).toBe(2100)
    expect(state.checkInFrom).toBe(WEEK_START)
  })

  it('prefers the user\'s own figures in manual mode', () => {
    const state = resolveCoach(
      inputs({
        settings: {
          ...DEFAULT_SETTINGS,
          program_mode: 'manual',
          kcal_target: 1900,
          protein_g_target: 160,
        },
      }),
    )
    expect(state.targets?.origin).toBe('manual')
    expect(state.targets?.kcalTarget).toBe(1900)
    expect(state.targets?.proteinTargetG).toBe(160)
    // A field the user left blank falls back rather than blanking the diary.
    expect(state.targets?.fatTargetG).toBeGreaterThan(0)
  })

  it('surfaces the trend weight from a single weigh-in', () => {
    const weights: WeightEntry[] = [{ day: '2026-07-28', weight_kg: 84.4 }]
    const state = resolveCoach(inputs({ weights }))
    expect(state.trendWeightKg).toBeCloseTo(84.4, 5)
    expect(state.scaleWeightKg).toBeCloseTo(84.4, 5)
    // One weigh-in is a weight, not an expenditure.
    expect(state.expenditure).toBeNull()
  })

  it('proposes targets once there is enough weight and intake history', () => {
    const dayKeys = recentLondonDayKeys(NOW, 90)
    const weights: WeightEntry[] = dayKeys.map((day, i) => ({
      day,
      weight_kg: 90 - i * (0.5 / 7),
    }))
    const log = dayKeys.map((day) => entry(`${day}T12:00:00Z`, 2000))
    const state = resolveCoach(inputs({ weights, log }))

    expect(state.expenditure).not.toBeNull()
    // Losing 0.5 kg/wk on 2,000 kcal means burning appreciably more than that.
    expect(state.expenditure?.kcal as number).toBeGreaterThan(2400)
    expect(state.proposed).not.toBeNull()
    // Goal defaults to maintenance, so the proposal sits at expenditure.
    expect(state.proposed?.kcalTarget).toBeCloseTo(state.expenditure?.kcal as number, -2)
    // Protein scales from the trend weight at the default 1.8 g/kg.
    expect(state.proposed?.proteinTargetG).toBeCloseTo(
      (state.trendWeightKg as number) * 1.8,
      0,
    )
    expect(state.status).toBe('faster') // drifting down on a maintenance goal
  })

  it('reports on-track when the measured rate matches the goal', () => {
    const dayKeys = recentLondonDayKeys(NOW, 90)
    const weights: WeightEntry[] = dayKeys.map((day, i) => ({
      day,
      weight_kg: 90 - i * (0.5 / 7),
    }))
    const log = dayKeys.map((day) => entry(`${day}T12:00:00Z`, 2000))
    const state = resolveCoach(
      inputs({
        weights,
        log,
        settings: { ...DEFAULT_SETTINGS, goal_rate_kg_per_week: -0.5 },
      }),
    )
    expect(state.status).toBe('on-track')
  })
})
