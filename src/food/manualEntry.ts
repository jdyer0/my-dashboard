// Turning typed label figures into a food_log row. Pure — no network, no DOM.
//
// The coach's estimate is normally the record (CLAUDE.md §7), but a packaged
// food already carries better numbers than any model would guess, and the free
// tier runs out. So the same jsonb shape can be filled in by hand.
//
// The null / zero distinction survives the keyboard: a field left blank is
// unknown and never reaches the map, a typed 0 means the food genuinely has
// none of that nutrient. Those are different rows on the micros screen.

import { macroEnergy } from '../lib/adaptive'
import type { NutrientMap } from '../lib/nutrition'

/** The fields on the back of a UK pack, in the order they're printed there —
    typing follows the label down rather than hunting around it. */
export const LABEL_FIELDS = [
  { key: 'energy_kcal', label: 'Energy', unit: 'kcal', indent: false },
  { key: 'fat', label: 'Fat', unit: 'g', indent: false },
  { key: 'saturates', label: 'of which saturates', unit: 'g', indent: true },
  { key: 'carbohydrate', label: 'Carbohydrate', unit: 'g', indent: false },
  { key: 'sugars', label: 'of which sugars', unit: 'g', indent: true },
  { key: 'fibre', label: 'Fibre', unit: 'g', indent: false },
  { key: 'protein', label: 'Protein', unit: 'g', indent: false },
  { key: 'salt', label: 'Salt', unit: 'g', indent: false },
] as const

export type LabelKey = (typeof LABEL_FIELDS)[number]['key']

export type LabelFields = Record<LabelKey, string>

export const BLANK_FIELDS: LabelFields = {
  energy_kcal: '',
  fat: '',
  saturates: '',
  carbohydrate: '',
  sugars: '',
  fibre: '',
  protein: '',
  salt: '',
}

/** The amount check mirrors `food_log.amount_g numeric(7,1) check (> 0)`, so a
    draft that passes here can't be rejected by the database. */
const MAX_AMOUNT_G = 5000

/** Generous, but it catches a decimal point typed as a thumb-slip: no single
    portion holds a hundred thousand of anything the label measures. */
const MAX_NUTRIENT = 100_000

/** A field is unknown, a number, or gibberish — three states, because blank
    and invalid must not collapse into the same silence. */
type Parsed = { state: 'blank' } | { state: 'value'; value: number } | { state: 'invalid' }

function parseField(text: string, max: number): Parsed {
  const trimmed = text.trim()
  if (trimmed === '') return { state: 'blank' }
  // A UK keyboard on iOS offers a comma on the decimal pad in some locales.
  const n = Number(trimmed.replace(',', '.'))
  if (!Number.isFinite(n) || n < 0 || n > max) return { state: 'invalid' }
  return { state: 'value', value: n }
}

/** Two decimals, matching what meal-parse rounds its estimates to, so a
    hand-typed row and an estimated one carry the same precision. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export interface ManualDraft {
  name: string
  amountG: number
  nutrients: NutrientMap
  /** True when energy was computed from the macros rather than typed. */
  energyDerived: boolean
}

/**
 * Which column of the label was typed. Packs print both, but the per-100g one
 * is the column that's always there, and doing the arithmetic here beats doing
 * it in your head at the fridge.
 */
export type LabelBasis = 'portion' | 'per100'

export interface ManualCheck {
  /** Ready to log, or null while something is missing or unparseable. */
  draft: ManualDraft | null
  /** Field keys whose text isn't a number — 'name' and 'amount' included. */
  invalid: string[]
  /** kcal the typed macros come to, once all three are there. Null otherwise.
      A cross-check against the printed energy, not a correction to it. */
  macroKcal: number | null
}

/**
 * Validates the form and builds the row it would insert. Every figure it
 * reports — the macro cross-check included — is for the portion, whichever
 * column of the label was typed.
 *
 * Energy is the one figure the diary can't do without — the ring is calories.
 * If it's left blank but protein, carbohydrate and fat are all typed, it's
 * derived from them at Atwater factors and flagged, rather than blocking on a
 * number the label already implies.
 */
export function checkManualEntry(input: {
  name: string
  amount: string
  fields: LabelFields
  basis: LabelBasis
}): ManualCheck {
  const invalid: string[] = []

  const name = input.name.trim()
  if (name === '') invalid.push('name')

  const amount = parseField(input.amount, MAX_AMOUNT_G)
  if (amount.state === 'invalid' || (amount.state === 'value' && amount.value <= 0)) {
    invalid.push('amount')
  }

  // Per-100g figures are scaled to the portion before anything else looks at
  // them, so the rest of this function only ever handles portion amounts.
  const factor =
    input.basis === 'per100' && amount.state === 'value' ? amount.value / 100 : 1

  const values: Partial<Record<LabelKey, number>> = {}
  for (const field of LABEL_FIELDS) {
    const parsed = parseField(input.fields[field.key], MAX_NUTRIENT)
    if (parsed.state === 'invalid') invalid.push(field.key)
    else if (parsed.state === 'value') values[field.key] = parsed.value * factor
  }

  const { protein, carbohydrate, fat } = values
  const macroKcal =
    protein !== undefined && carbohydrate !== undefined && fat !== undefined
      ? Math.round(macroEnergy({ proteinG: protein, carbG: carbohydrate, fatG: fat }))
      : null

  const energyDerived = values.energy_kcal === undefined && macroKcal !== null
  const energy = values.energy_kcal ?? (energyDerived ? macroKcal : null)

  if (energy === null) invalid.push('energy_kcal')
  if (invalid.length > 0 || amount.state !== 'value' || energy === null) {
    return { draft: null, invalid, macroKcal }
  }

  const nutrients: NutrientMap = {}
  for (const field of LABEL_FIELDS) {
    const value = field.key === 'energy_kcal' ? energy : values[field.key]
    if (value === undefined) continue
    nutrients[field.key] = { value: round2(value) }
  }

  return {
    draft: {
      name,
      amountG: Math.round(amount.value * 10) / 10,
      nutrients,
      energyDerived,
    },
    invalid: [],
    macroKcal,
  }
}
