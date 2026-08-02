import { describe, expect, it } from 'vitest'
import { fitWithin } from './photo'

describe('fitWithin', () => {
  it('scales a landscape photo down by its longest edge', () => {
    expect(fitWithin(4032, 3024, 1024)).toEqual({ width: 1024, height: 768 })
  })

  it('scales a portrait photo down by its longest edge', () => {
    expect(fitWithin(3024, 4032, 1024)).toEqual({ width: 768, height: 1024 })
  })

  it('leaves a photo already inside the cap alone', () => {
    expect(fitWithin(800, 600, 1024)).toEqual({ width: 800, height: 600 })
  })

  it('never enlarges — upscaling would invent detail the model reads as real', () => {
    const { width, height } = fitWithin(200, 150, 1024)
    expect(width).toBe(200)
    expect(height).toBe(150)
  })

  it('keeps the short edge at least one pixel on an extreme panorama', () => {
    expect(fitWithin(10000, 3, 1024)).toEqual({ width: 1024, height: 1 })
  })

  it('handles a degenerate zero-size decode without dividing by zero', () => {
    expect(fitWithin(0, 0, 1024)).toEqual({ width: 0, height: 0 })
  })
})
