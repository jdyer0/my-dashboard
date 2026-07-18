import { describe, expect, it } from 'vitest'
import { inLondonWeek, londonDayKey, londonWeekStartKey, recentLondonDayKeys } from './londonDay'

describe('londonDayKey', () => {
  it('rolls a late UTC evening into the next London day during BST', () => {
    // 23:30 UTC on 18 July is 00:30 BST on 19 July.
    expect(londonDayKey(new Date('2026-07-18T23:30:00Z'))).toBe('2026-07-19')
  })

  it('matches UTC in winter', () => {
    expect(londonDayKey(new Date('2026-01-18T23:30:00Z'))).toBe('2026-01-18')
  })
})

describe('londonWeekStartKey', () => {
  it('finds Monday from mid-week', () => {
    // 2026-07-18 is a Saturday.
    expect(londonWeekStartKey(new Date('2026-07-18T12:00:00Z'))).toBe('2026-07-13')
  })

  it('is identity on a Monday', () => {
    expect(londonWeekStartKey(new Date('2026-07-13T12:00:00Z'))).toBe('2026-07-13')
  })

  it('rolls Sunday 23:30 UTC into the next week during BST', () => {
    // Sunday 19 July 23:30 UTC is Monday 20 July 00:30 BST.
    expect(londonWeekStartKey(new Date('2026-07-19T23:30:00Z'))).toBe('2026-07-20')
  })
})

describe('recentLondonDayKeys', () => {
  it('ends on the London day, not the UTC day', () => {
    // 23:30 UTC on 18 July is already 19 July in London.
    expect(recentLondonDayKeys(new Date('2026-07-18T23:30:00Z'), 3)).toEqual([
      '2026-07-17',
      '2026-07-18',
      '2026-07-19',
    ])
  })

  it('crosses month boundaries', () => {
    expect(recentLondonDayKeys(new Date('2026-08-01T12:00:00Z'), 2)).toEqual([
      '2026-07-31',
      '2026-08-01',
    ])
  })
})

describe('inLondonWeek', () => {
  const now = new Date('2026-07-18T12:00:00Z') // Saturday

  it('includes Monday of this week', () => {
    expect(inLondonWeek('2026-07-13T06:00:00Z', now)).toBe(true)
  })

  it('excludes last Sunday', () => {
    expect(inLondonWeek('2026-07-12T18:00:00Z', now)).toBe(false)
  })

  it('includes a session logged late Sunday UTC that is Monday in London', () => {
    expect(inLondonWeek('2026-07-12T23:30:00Z', now)).toBe(true)
  })
})
