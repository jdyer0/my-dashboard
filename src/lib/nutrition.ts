// Pure nutrition maths. The null / zero / trace distinction is load-bearing
// (CLAUDE.md §7): an absent nutrient key means unknown, never zero. Nothing
// here talks to the network or the DOM.

export interface NutrientValue {
  value: number
  is_trace?: boolean
}

/** Per-100g nutrient map; unknown nutrients are absent, never zero. */
export type Per100g = Record<string, NutrientValue | undefined>

export interface NutrientDef {
  key: string
  display_name: string
  unit: string
  kind: 'macro' | 'micro'
  sort_order: number
}

export interface RniTarget {
  nutrient_key: string
  sex: 'male' | 'female'
  age_min: number
  age_max: number
  value: number
}

export interface LoggedFood {
  amountG: number
  per100g: Per100g
}

/** Scale a per-100g map to an amount. Trace stays trace; unknown stays absent. */
export function scaleNutrients(per100g: Per100g, amountG: number): Record<string, NutrientValue> {
  const scaled: Record<string, NutrientValue> = {}
  for (const [key, v] of Object.entries(per100g)) {
    if (!v) continue
    scaled[key] = v.is_trace ? { value: 0, is_trace: true } : { value: (v.value * amountG) / 100 }
  }
  return scaled
}

export interface NutrientTotal {
  /** Sum over entries that have data for this nutrient. */
  value: number
  /** Entries with data for this nutrient. */
  known: number
  /** All entries. */
  total: number
}

/** Total intake for one nutrient. Entries lacking the nutrient are excluded
    from the sum — they make the total less complete, not smaller. */
export function nutrientTotal(entries: LoggedFood[], key: string): NutrientTotal {
  let value = 0
  let known = 0
  for (const entry of entries) {
    const v = entry.per100g[key]
    if (!v) continue
    known++
    if (!v.is_trace) value += (v.value * entry.amountG) / 100
  }
  return { value, known, total: entries.length }
}

/**
 * Average daily intake over a window, or null for "insufficient data" when
 * more than half of the logged foods lack data for the nutrient. Never
 * present a number built mostly from missing values.
 */
export function averageDailyIntake(entries: LoggedFood[], key: string, days: number): number | null {
  if (entries.length === 0 || days <= 0) return null
  const { value, known, total } = nutrientTotal(entries, key)
  const lacking = total - known
  if (lacking > total / 2) return null
  return value / days
}

/** RNI lookup by sex and age band. */
export function targetFor(
  targets: RniTarget[],
  key: string,
  sex: 'male' | 'female',
  ageYears: number,
): number | null {
  const row = targets.find(
    (t) => t.nutrient_key === key && t.sex === sex && ageYears >= t.age_min && ageYears <= t.age_max,
  )
  return row ? row.value : null
}

/** Whole years since birth_date at `now`. Calendar arithmetic, no DST traps. */
export function ageInYears(birthDateIso: string, now: Date): number {
  const [y, m, d] = birthDateIso.split('-').map(Number)
  if (y === undefined || m === undefined || d === undefined) return 0
  let age = now.getUTCFullYear() - y
  const monthDiff = now.getUTCMonth() + 1 - m
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < d)) age--
  return age
}

const londonHour = new Intl.DateTimeFormat('en-GB', {
  hour: 'numeric',
  hour12: false,
  timeZone: 'Europe/London',
})

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'

/** Meal default by London time of day: before 11 breakfast, 11–3 lunch,
    3–9 dinner, else snack. */
export function mealForTime(now: Date): Meal {
  const hour = Number(londonHour.format(now))
  if (hour < 11) return 'breakfast'
  if (hour < 15) return 'lunch'
  if (hour < 21) return 'dinner'
  return 'snack'
}

// UK guideline energy and macro targets. Carbohydrate ~50% of energy at
// 4 kcal/g, fat <35% at 9 kcal/g, fibre 30 g (SACN).
export function kcalTargetDefault(sex: 'male' | 'female'): number {
  return sex === 'male' ? 2500 : 2000
}

export function carbTargetG(kcalTarget: number): number {
  return (kcalTarget * 0.5) / 4
}

export function fatTargetG(kcalTarget: number): number {
  return (kcalTarget * 0.35) / 9
}

export const FIBRE_TARGET_G = 30

export interface Contribution {
  name: string
  value: number
}

/** Which foods contributed most to a nutrient, aggregated by food name. */
export function contributors(
  entries: (LoggedFood & { name: string })[],
  key: string,
): Contribution[] {
  const byName = new Map<string, number>()
  for (const entry of entries) {
    const v = entry.per100g[key]
    if (!v || v.is_trace) continue
    const amount = (v.value * entry.amountG) / 100
    if (amount <= 0) continue
    byName.set(entry.name, (byName.get(entry.name) ?? 0) + amount)
  }
  return [...byName.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
}
