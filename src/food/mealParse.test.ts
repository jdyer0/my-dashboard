import { describe, expect, it } from 'vitest'
import { parseMealText, resolveAmountG } from './mealParse'

describe('parseMealText', () => {
  it('splits on commas and "and"', () => {
    const items = parseMealText('chicken breast, rice and broccoli')
    expect(items.map((i) => i.query)).toEqual(['chicken breast', 'rice', 'broccoli'])
  })

  it('reads explicit gram amounts', () => {
    const items = parseMealText('150g chicken breast and 80 g broccoli')
    expect(items[0]).toMatchObject({ query: 'chicken breast', grams: 150 })
    expect(items[1]).toMatchObject({ query: 'broccoli', grams: 80 })
  })

  it('converts kilograms and treats ml as grams', () => {
    const items = parseMealText('0.5kg potatoes, 200ml milk')
    expect(items[0]?.grams).toBe(500)
    expect(items[1]?.grams).toBe(200)
  })

  it('turns leading counts into portion multipliers', () => {
    const items = parseMealText('2 slices of toast, three eggs')
    expect(items[0]).toMatchObject({ query: 'toast', grams: null, count: 2 })
    expect(items[1]).toMatchObject({ query: 'eggs', grams: null, count: 3 })
  })

  it('maps household measures to grams, scaled by count', () => {
    const items = parseMealText('a handful of almonds, 2 tablespoons of olive oil')
    expect(items[0]).toMatchObject({ query: 'almonds', grams: 30 })
    expect(items[1]).toMatchObject({ query: 'olive oil', grams: 30 })
  })

  it('treats "a" as one portion and strips filler words', () => {
    const items = parseMealText('a banana with some peanut butter')
    expect(items[0]).toMatchObject({ query: 'banana', count: 1 })
    expect(items[1]).toMatchObject({ query: 'peanut butter', count: null })
  })

  it('returns nothing for text with no foods', () => {
    expect(parseMealText('  , and ')).toEqual([])
    expect(parseMealText('')).toEqual([])
  })

  it('keeps the raw fragment for display', () => {
    const items = parseMealText('a handful of spinach')
    expect(items[0]?.raw).toBe('a handful of spinach')
  })
})

describe('resolveAmountG', () => {
  it('prefers explicit grams over the default portion', () => {
    expect(resolveAmountG({ raw: '', query: '', grams: 150, count: null }, 80)).toBe(150)
  })

  it('multiplies the default portion by the count', () => {
    expect(resolveAmountG({ raw: '', query: '', grams: null, count: 2 }, 40)).toBe(80)
  })

  it('falls back to one default portion', () => {
    expect(resolveAmountG({ raw: '', query: '', grams: null, count: null }, 180)).toBe(180)
  })
})
