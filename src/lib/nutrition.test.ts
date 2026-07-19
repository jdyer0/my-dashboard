import { describe, expect, it } from 'vitest'
import {
  ageInYears,
  averageDailyIntake,
  carbTargetG,
  contributors,
  fatTargetG,
  mealForTime,
  nutrientTotal,
  scaleNutrients,
  targetFor,
  type LoggedFood,
  type RniTarget,
} from './nutrition'

describe('scaleNutrients', () => {
  it('scales values by the factor and keeps unknowns absent', () => {
    const scaled = scaleNutrients({ protein: { value: 8.5 }, fat: { value: 9 } }, 2)
    expect(scaled.protein?.value).toBeCloseTo(17, 5)
    expect(scaled.fat?.value).toBeCloseTo(18, 5)
    expect('vitamin_d' in scaled).toBe(false)
  })

  it('keeps trace as trace, not as a scaled zero', () => {
    const scaled = scaleNutrients({ vitamin_d: { value: 0, is_trace: true } }, 2.5)
    expect(scaled.vitamin_d).toEqual({ value: 0, is_trace: true })
  })
})

describe('nutrientTotal', () => {
  const entries: LoggedFood[] = [
    { nutrients: { iron: { value: 2 } } },
    { nutrients: { iron: { value: 2 } } },
    { nutrients: {} }, // iron unknown — excluded, not zero
    { nutrients: { iron: { value: 0, is_trace: true } } },
  ]

  it('sums only entries with data and counts them', () => {
    const total = nutrientTotal(entries, 'iron')
    expect(total.value).toBeCloseTo(4, 5) // 2 + 2 + trace(0)
    expect(total.known).toBe(3) // trace counts as known
    expect(total.total).toBe(4)
  })
})

describe('averageDailyIntake', () => {
  const known: LoggedFood = { nutrients: { zinc: { value: 7 } } }
  const unknown: LoggedFood = { nutrients: {} }

  it('averages over the window, not over logged days', () => {
    expect(averageDailyIntake([known, known], 'zinc', 7)).toBeCloseTo(2, 5)
  })

  it('shows partial data when only some entries have the nutrient', () => {
    expect(averageDailyIntake([known, unknown, unknown], 'zinc', 7)).toBeCloseTo(1, 5)
  })

  it('is null only when no entry has the nutrient', () => {
    expect(averageDailyIntake([unknown, unknown], 'zinc', 7)).toBeNull()
  })

  it('is null with no entries', () => {
    expect(averageDailyIntake([], 'zinc', 7)).toBeNull()
  })
})

describe('targetFor', () => {
  const targets: RniTarget[] = [
    { nutrient_key: 'iron', sex: 'female', age_min: 19, age_max: 50, value: 14.8 },
    { nutrient_key: 'iron', sex: 'female', age_min: 51, age_max: 120, value: 8.7 },
    { nutrient_key: 'iron', sex: 'male', age_min: 19, age_max: 120, value: 8.7 },
  ]

  it('picks the band containing the age', () => {
    expect(targetFor(targets, 'iron', 'female', 34)).toBe(14.8)
    expect(targetFor(targets, 'iron', 'female', 50)).toBe(14.8)
    expect(targetFor(targets, 'iron', 'female', 51)).toBe(8.7)
    expect(targetFor(targets, 'iron', 'male', 34)).toBe(8.7)
  })

  it('is null for an unknown nutrient', () => {
    expect(targetFor(targets, 'selenium', 'male', 34)).toBeNull()
  })
})

describe('ageInYears', () => {
  it('counts whole years, birthday not yet reached', () => {
    expect(ageInYears('1990-12-25', new Date('2026-07-18T12:00:00Z'))).toBe(35)
  })

  it('counts the birthday itself', () => {
    expect(ageInYears('1990-07-18', new Date('2026-07-18T12:00:00Z'))).toBe(36)
  })
})

describe('mealForTime', () => {
  it('follows London hours across the BST offset', () => {
    // 09:30 UTC = 10:30 London (BST) -> breakfast
    expect(mealForTime(new Date('2026-07-18T09:30:00Z'))).toBe('breakfast')
    // 10:30 UTC = 11:30 London -> lunch
    expect(mealForTime(new Date('2026-07-18T10:30:00Z'))).toBe('lunch')
    // 14:30 UTC = 15:30 London -> dinner
    expect(mealForTime(new Date('2026-07-18T14:30:00Z'))).toBe('dinner')
    // 20:30 UTC = 21:30 London -> snack
    expect(mealForTime(new Date('2026-07-18T20:30:00Z'))).toBe('snack')
  })
})

describe('macro targets', () => {
  it('derives carbohydrate and fat targets from energy', () => {
    expect(carbTargetG(2000)).toBeCloseTo(250, 5)
    expect(fatTargetG(2000)).toBeCloseTo(77.8, 1)
  })
})

describe('contributors', () => {
  it('aggregates by name and sorts by contribution', () => {
    const list = contributors(
      [
        { name: 'Milk', nutrients: { calcium: { value: 240 } } },
        { name: 'Milk', nutrients: { calcium: { value: 120 } } },
        { name: 'Spinach', nutrients: { calcium: { value: 108.8 } } },
        { name: 'Water', nutrients: {} },
      ],
      'calcium',
    )
    expect(list.map((c) => c.name)).toEqual(['Milk', 'Spinach'])
    expect(list[0]?.value).toBeCloseTo(360, 5)
  })
})
