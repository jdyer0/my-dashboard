import { describe, expect, it } from 'vitest'
import {
  BLANK_FIELDS,
  checkManualEntry,
  type LabelBasis,
  type LabelFields,
} from './manualEntry'

function fields(partial: Partial<LabelFields>): LabelFields {
  return { ...BLANK_FIELDS, ...partial }
}

/** The common case: figures typed for the portion actually eaten. */
function check(input: {
  name: string
  amount: string
  fields: LabelFields
  basis?: LabelBasis
}) {
  return checkManualEntry({ ...input, basis: input.basis ?? 'portion' })
}

describe('checkManualEntry', () => {
  it('builds a row from a typed label', () => {
    const { draft } = check({
      name: '  Chicken pie  ',
      amount: '220',
      fields: fields({ energy_kcal: '410', protein: '28', carbohydrate: '31', fat: '19' }),
    })
    expect(draft).toEqual({
      name: 'Chicken pie',
      amountG: 220,
      nutrients: {
        energy_kcal: { value: 410 },
        protein: { value: 28 },
        carbohydrate: { value: 31 },
        fat: { value: 19 },
      },
      energyDerived: false,
    })
  })

  it('leaves a blank nutrient out of the map — unknown is not zero', () => {
    const { draft } = check({
      name: 'Pie',
      amount: '220',
      fields: fields({ energy_kcal: '410' }),
    })
    expect(draft?.nutrients).toEqual({ energy_kcal: { value: 410 } })
    expect('protein' in (draft?.nutrients ?? {})).toBe(false)
  })

  it('keeps a typed zero — the food really contains none', () => {
    const { draft } = check({
      name: 'Black coffee',
      amount: '200',
      fields: fields({ energy_kcal: '2', fat: '0', sugars: '0' }),
    })
    expect(draft?.nutrients.fat).toEqual({ value: 0 })
    expect(draft?.nutrients.sugars).toEqual({ value: 0 })
  })

  it('derives energy from the three macros when it is left blank', () => {
    const { draft, macroKcal } = check({
      name: 'Shake',
      amount: '300',
      fields: fields({ protein: '30', carbohydrate: '10', fat: '5' }),
    })
    // 30*4 + 10*4 + 5*9 = 205
    expect(macroKcal).toBe(205)
    expect(draft?.nutrients.energy_kcal).toEqual({ value: 205 })
    expect(draft?.energyDerived).toBe(true)
  })

  it('never overwrites typed energy with the macro figure', () => {
    const { draft, macroKcal } = check({
      name: 'Shake',
      amount: '300',
      fields: fields({ energy_kcal: '190', protein: '30', carbohydrate: '10', fat: '5' }),
    })
    expect(macroKcal).toBe(205)
    expect(draft?.nutrients.energy_kcal).toEqual({ value: 190 })
    expect(draft?.energyDerived).toBe(false)
  })

  it('holds out for energy when the macros are incomplete', () => {
    const { draft, invalid, macroKcal } = check({
      name: 'Shake',
      amount: '300',
      fields: fields({ protein: '30', fat: '5' }),
    })
    expect(draft).toBeNull()
    expect(macroKcal).toBeNull()
    expect(invalid).toContain('energy_kcal')
  })

  it('names every field it cannot read', () => {
    const { draft, invalid } = check({
      name: '   ',
      amount: 'a lot',
      fields: fields({ energy_kcal: '410', protein: '-3' }),
    })
    expect(draft).toBeNull()
    expect(invalid).toEqual(['name', 'amount', 'protein'])
  })

  it('rejects an amount the food_log check constraint would reject', () => {
    for (const amount of ['0', '-5', '5001']) {
      const { invalid } = check({
        name: 'Pie',
        amount,
        fields: fields({ energy_kcal: '410' }),
      })
      expect(invalid).toContain('amount')
    }
  })

  it('reads a comma as a decimal point', () => {
    const { draft } = check({
      name: 'Oil',
      amount: '12,5',
      fields: fields({ energy_kcal: '110', fat: '12,5' }),
    })
    expect(draft?.amountG).toBe(12.5)
    expect(draft?.nutrients.fat).toEqual({ value: 12.5 })
  })

  it('rounds to two decimals, as the coach does', () => {
    const { draft } = check({
      name: 'Salt',
      amount: '1',
      fields: fields({ energy_kcal: '0', salt: '0.0166666' }),
    })
    expect(draft?.nutrients.salt).toEqual({ value: 0.02 })
  })
})

describe('checkManualEntry, per-100g basis', () => {
  it('scales the label to the portion', () => {
    const { draft } = check({
      name: 'Cheddar',
      amount: '220',
      fields: fields({ energy_kcal: '186', protein: '12.7', fat: '8.5' }),
      basis: 'per100',
    })
    expect(draft?.amountG).toBe(220)
    expect(draft?.nutrients).toEqual({
      energy_kcal: { value: 409.2 },
      protein: { value: 27.94 },
      fat: { value: 18.7 },
    })
  })

  it('leaves a blank blank rather than scaling it into a zero', () => {
    const { draft } = check({
      name: 'Cheddar',
      amount: '220',
      fields: fields({ energy_kcal: '186' }),
      basis: 'per100',
    })
    expect(draft?.nutrients).toEqual({ energy_kcal: { value: 409.2 } })
  })

  it('cross-checks the macros against the portion, not the 100 g column', () => {
    const { macroKcal } = check({
      name: 'Cheddar',
      amount: '200',
      fields: fields({ energy_kcal: '186', protein: '10', carbohydrate: '10', fat: '10' }),
      basis: 'per100',
    })
    // Doubled to the portion first: 20*4 + 20*4 + 20*9 = 340.
    expect(macroKcal).toBe(340)
  })

  it('derives energy from macros that were themselves scaled', () => {
    const { draft } = check({
      name: 'Rice',
      amount: '250',
      fields: fields({ protein: '2.6', carbohydrate: '28', fat: '0.3' }),
      basis: 'per100',
    })
    // 6.5*4 + 70*4 + 0.75*9 = 312.75, and a derived energy lands on the whole
    // kcal — a fractional calorie is precision the arithmetic doesn't have.
    expect(draft?.nutrients.energy_kcal).toEqual({ value: 313 })
    expect(draft?.energyDerived).toBe(true)
  })
})
