import { describe, expect, it } from 'vitest'
import {
  averageDailyMl,
  currentStreak,
  dailyTotals,
  litres,
  mlFromLitres,
  suggestedTargetMl,
  totalForDay,
  type DrinkEntry,
} from './hydration'

describe('litres', () => {
  it('reads millilitres as litres to one decimal', () => {
    expect(litres(2500)).toBe('2.5')
    expect(litres(0)).toBe('0.0')
    expect(litres(1000)).toBe('1.0')
  })

  it('rounds rather than truncating', () => {
    expect(litres(2460)).toBe('2.5')
    expect(litres(2440)).toBe('2.4')
  })
})

describe('mlFromLitres', () => {
  it('round-trips a typed litre figure to whole millilitres', () => {
    expect(mlFromLitres(2.5)).toBe(2500)
    expect(mlFromLitres(0.33)).toBe(330)
    // The classic float: 2.4 * 1000 is 2399.9999999999995 without the round.
    expect(mlFromLitres(2.4)).toBe(2400)
  })
})

describe('totalForDay', () => {
  const entries: DrinkEntry[] = [
    { day: '2026-07-27', volumeMl: 250 },
    { day: '2026-07-27', volumeMl: 500 },
    { day: '2026-07-28', volumeMl: 750 },
  ]

  it('sums only that day', () => {
    expect(totalForDay(entries, '2026-07-27')).toBe(750)
    expect(totalForDay(entries, '2026-07-28')).toBe(750)
  })

  it('is zero for a day with nothing logged', () => {
    expect(totalForDay(entries, '2026-07-26')).toBe(0)
  })

  it('adds integer millilitres exactly', () => {
    const eight: DrinkEntry[] = Array.from({ length: 8 }, () => ({
      day: '2026-07-27',
      volumeMl: 250,
    }))
    expect(totalForDay(eight, '2026-07-27')).toBe(2000)
  })
})

describe('dailyTotals', () => {
  const entries: DrinkEntry[] = [
    { day: '2026-07-26', volumeMl: 3000 },
    { day: '2026-07-28', volumeMl: 1000 },
    { day: '2026-07-28', volumeMl: 1500 },
  ]
  const keys = ['2026-07-26', '2026-07-27', '2026-07-28']

  it('returns a row per requested day, in order', () => {
    const rows = dailyTotals(entries, keys, 2500)
    expect(rows.map((r) => r.day)).toEqual(keys)
  })

  it('counts a day with no drinks as zero', () => {
    const rows = dailyTotals(entries, keys, 2500)
    expect(rows[1]).toEqual({ day: '2026-07-27', totalMl: 0, onTarget: false })
  })

  it('marks a day that exactly meets the target as on target', () => {
    const rows = dailyTotals(entries, keys, 2500)
    expect(rows[2]?.totalMl).toBe(2500)
    expect(rows[2]?.onTarget).toBe(true)
  })

  it('ignores entries outside the requested days', () => {
    const rows = dailyTotals(entries, ['2026-07-27'], 2500)
    expect(rows).toEqual([{ day: '2026-07-27', totalMl: 0, onTarget: false }])
  })
})

describe('currentStreak', () => {
  const day = (d: string, totalMl: number, targetMl = 2500) => ({
    day: d,
    totalMl,
    onTarget: totalMl >= targetMl,
  })

  it('counts back through consecutive days on target', () => {
    expect(
      currentStreak([
        day('2026-07-26', 3000),
        day('2026-07-27', 2600),
        day('2026-07-28', 2500),
      ]),
    ).toBe(3)
  })

  it('stops at the first earlier day below target', () => {
    expect(
      currentStreak([
        day('2026-07-25', 3000),
        day('2026-07-26', 900),
        day('2026-07-27', 2600),
        day('2026-07-28', 2500),
      ]),
    ).toBe(2)
  })

  it('does not break the streak on an incomplete today', () => {
    // Half a litre in by lunchtime is not a failed day yet.
    expect(
      currentStreak([
        day('2026-07-26', 3000),
        day('2026-07-27', 2600),
        day('2026-07-28', 500),
      ]),
    ).toBe(2)
  })

  it('counts today once it does hit the target', () => {
    expect(currentStreak([day('2026-07-27', 2600), day('2026-07-28', 2500)])).toBe(2)
  })

  it('is zero with no history and zero when yesterday missed', () => {
    expect(currentStreak([])).toBe(0)
    expect(currentStreak([day('2026-07-27', 100), day('2026-07-28', 0)])).toBe(0)
  })
})

describe('averageDailyMl', () => {
  it('averages across every day, including the dry ones', () => {
    expect(
      averageDailyMl([
        { day: '2026-07-27', totalMl: 3000, onTarget: true },
        { day: '2026-07-28', totalMl: 0, onTarget: false },
      ]),
    ).toBe(1500)
  })

  it('is null with nothing to average', () => {
    expect(averageDailyMl([])).toBeNull()
  })
})

describe('suggestedTargetMl', () => {
  it('works out ~35 ml per kg, rounded to a quarter litre', () => {
    expect(suggestedTargetMl(84)).toBe(3000)
    expect(suggestedTargetMl(60)).toBe(2000)
  })

  it('clamps at both ends rather than prescribing an extreme', () => {
    expect(suggestedTargetMl(30)).toBe(1500)
    expect(suggestedTargetMl(200)).toBe(4000)
  })
})
