// Pure nutrition maths. The null / zero / trace distinction is load-bearing
// (CLAUDE.md §7): an absent nutrient key means unknown, never zero. Nothing
// here talks to the network or the DOM.

export interface NutrientValue {
  value: number
  is_trace?: boolean
}

/** Absolute nutrient amounts for a logged portion; unknown nutrients are
    absent, never zero. */
export type NutrientMap = Record<string, NutrientValue | undefined>

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
  nutrients: NutrientMap
}

/** Scale a nutrient map by a factor — used when the user corrects a portion's
    grams. Trace stays trace; unknown stays absent. */
export function scaleNutrients(nutrients: NutrientMap, factor: number): Record<string, NutrientValue> {
  const scaled: Record<string, NutrientValue> = {}
  for (const [key, v] of Object.entries(nutrients)) {
    if (!v) continue
    scaled[key] = v.is_trace ? { value: 0, is_trace: true } : { value: v.value * factor }
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
    const v = entry.nutrients[key]
    if (!v) continue
    known++
    if (!v.is_trace) value += v.value
  }
  return { value, known, total: entries.length }
}

/**
 * Average daily intake over a window, from whatever entries carry the nutrient.
 * Partial data is shown: the figure is null only when no logged entry has any
 * value for the nutrient (genuinely unknown), never a fabricated zero. When
 * some entries lack the nutrient the total is under-counted, not wrong.
 */
export function averageDailyIntake(entries: LoggedFood[], key: string, days: number): number | null {
  if (entries.length === 0 || days <= 0) return null
  const { value, known } = nutrientTotal(entries, key)
  if (known === 0) return null
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

/** Which entries contributed most to a nutrient, aggregated by name. */
export function contributors(
  entries: (LoggedFood & { name: string })[],
  key: string,
): Contribution[] {
  const byName = new Map<string, number>()
  for (const entry of entries) {
    const v = entry.nutrients[key]
    if (!v || v.is_trace) continue
    if (v.value <= 0) continue
    byName.set(entry.name, (byName.get(entry.name) ?? 0) + v.value)
  }
  return [...byName.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
}
