import { supabase } from '../lib/supabase'
import type { NutrientDef, NutrientMap, RniTarget } from '../lib/nutrition'
import { londonDayKey } from '../lib/londonDay'
import type {
  FoodLogEntry,
  HydrationEntry,
  NutritionProgram,
  NutritionSettings,
  ParsedMealItem,
  Profile,
  WeightEntry,
} from './types'

const ENTRY_COLS = 'id, name, logged_at, meal, amount_g, nutrients'
const SETTINGS_COLS =
  'program_mode, goal_rate_kg_per_week, protein_g_per_kg, fat_pct_energy, hydration_target_ml, kcal_target, protein_g_target, carb_g_target, fat_g_target'
const PROGRAM_COLS =
  'id, effective_from, kcal_target, protein_g_target, carb_g_target, fat_g_target, expenditure_kcal, trend_weight_kg, source'

/** What the coach falls back to before the user has touched a setting. */
export const DEFAULT_SETTINGS: NutritionSettings = {
  program_mode: 'coached',
  goal_rate_kg_per_week: 0,
  protein_g_per_kg: 1.8,
  fat_pct_energy: 0.3,
  hydration_target_ml: 2500,
  kcal_target: null,
  protein_g_target: null,
  carb_g_target: null,
  fat_g_target: null,
}

async function userId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user.id
  if (!id) throw new Error('Signed out')
  return id
}

/** Timestamp far enough back to cover `days` London days whatever the offset. */
function sinceIso(days: number): string {
  return new Date(Date.now() - (days + 1) * 24 * 60 * 60 * 1000).toISOString()
}

// Reference data --------------------------------------------------------

export async function fetchNutrientDefs(): Promise<NutrientDef[]> {
  const { data, error } = await supabase
    .from('nutrient_defs')
    .select('key, display_name, unit, kind, sort_order')
    .order('sort_order')
  if (error) throw error
  return data
}

export async function fetchRniTargets(): Promise<RniTarget[]> {
  const { data, error } = await supabase
    .from('rni_targets')
    .select('nutrient_key, sex, age_min, age_max, value')
  if (error) throw error
  return data
}

// Profile and settings --------------------------------------------------

export async function fetchProfile(): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('sex, birth_date')
    .maybeSingle()
  if (error) throw error
  return data ?? { sex: null, birth_date: null }
}

export async function saveProfile(sex: 'male' | 'female', birthDate: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .upsert({ user_id: await userId(), sex, birth_date: birthDate })
  if (error) throw error
}

export async function fetchSettings(): Promise<NutritionSettings> {
  const { data, error } = await supabase
    .from('nutrition_settings')
    .select(SETTINGS_COLS)
    .maybeSingle()
  if (error) throw error
  return (data as NutritionSettings | null) ?? DEFAULT_SETTINGS
}

/** Writes only the fields given; the rest keep their stored values. */
export async function saveSettings(patch: Partial<NutritionSettings>): Promise<void> {
  const { error } = await supabase
    .from('nutrition_settings')
    .upsert({ user_id: await userId(), ...patch })
  if (error) throw error
}

// Issued targets --------------------------------------------------------

/** Every check-in, newest first. */
export async function fetchPrograms(limit = 12): Promise<NutritionProgram[]> {
  const { data, error } = await supabase
    .from('nutrition_programs')
    .select(PROGRAM_COLS)
    .order('effective_from', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data as NutritionProgram[]
}

/**
 * Records an accepted check-in. Upserting on the effective Monday makes
 * accepting twice — a double tap, a reloaded tab — land on one row rather
 * than two competing sets of targets for the same week.
 */
export async function saveProgram(
  program: Omit<NutritionProgram, 'id'>,
): Promise<void> {
  const { error } = await supabase
    .from('nutrition_programs')
    .upsert({ user_id: await userId(), ...program }, { onConflict: 'user_id,effective_from' })
  if (error) throw error
}

// Food log --------------------------------------------------------------

/** Nutrient values the meal-parse function may return, as plain numbers. */
type RemoteItem = {
  name?: unknown
  amount_g?: unknown
  nutrients?: unknown
  water_ml?: unknown
}

function toNutrientMap(raw: unknown): NutrientMap {
  if (typeof raw !== 'object' || raw === null) return {}
  const map: NutrientMap = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      map[key] = { value }
    }
  }
  return map
}

/** Long enough for a cold Edge Function plus a busy model, short enough that a
    request which is never coming back stops holding the screen hostage. */
const PARSE_TIMEOUT_MS = 45_000

/** An error the UI can turn into copy, without matching on message text. */
function tagged(name: string, message: string): Error {
  const err = new Error(message)
  err.name = name
  return err
}

/**
 * Unpacks a failed `functions.invoke` so a breakage is diagnosable from the
 * console rather than from a screenshot. The Edge Function puts its own
 * `{ error, detail }` in the body, which is where the useful part lives — the
 * invoke error itself only says "non-2xx".
 */
async function invokeFailure(error: unknown): Promise<Error> {
  const context = (error as { context?: unknown }).context
  if (!(context instanceof Response)) {
    console.error('meal-parse failed', error)
    return error instanceof Error ? error : tagged('Upstream', 'meal-parse failed')
  }
  let detail = ''
  try {
    detail = (await context.text()).slice(0, 500)
  } catch {
    // Body already consumed — the status is still worth having.
  }
  console.error(`meal-parse failed (${context.status})`, detail)
  if (context.status === 429) return tagged('RateLimited', 'rate limited')
  return tagged('Upstream', `meal-parse ${context.status}`)
}

/** Sends a meal description, a photo of it, or both to the meal-parse Edge
    Function (Gemini free tier), which splits it into foods and estimates each
    portion's macro- and micronutrients directly — there is no foods table to
    match against. The photo is what the portion estimate rests on, since the
    grams it returns are logged as-is. */
export async function parseMealRemote(
  text: string,
  image?: { data: string; mimeType: string } | null,
): Promise<ParsedMealItem[]> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), PARSE_TIMEOUT_MS)
  let data: unknown
  try {
    const res = await supabase.functions.invoke('meal-parse', {
      body: {
        text,
        ...(image ? { image: { data: image.data, mime_type: image.mimeType } } : {}),
      },
      signal: abort.signal,
    })
    if (res.error) throw await invokeFailure(res.error)
    data = res.data
  } finally {
    clearTimeout(timer)
  }
  const items = (data as { items?: RemoteItem[] } | null)?.items
  if (!Array.isArray(items)) throw new Error('Malformed response')
  return items
    .map((item): ParsedMealItem | null => {
      const name = typeof item.name === 'string' ? item.name.trim() : ''
      const amountG =
        typeof item.amount_g === 'number' && Number.isFinite(item.amount_g)
          ? Math.max(1, Math.round(item.amount_g))
          : null
      if (!name || amountG === null) return null
      const waterMl =
        typeof item.water_ml === 'number' && Number.isFinite(item.water_ml) && item.water_ml > 0
          ? Math.min(5000, Math.round(item.water_ml))
          : null
      return {
        name,
        amount_g: amountG,
        nutrients: toNutrientMap(item.nutrients),
        water_ml: waterMl,
      }
    })
    .filter((item): item is ParsedMealItem => item !== null)
}

export async function logMeal(
  items: { name: string; amountG: number; nutrients: NutrientMap; waterMl?: number | null }[],
  meal: FoodLogEntry['meal'],
): Promise<void> {
  const uid = await userId()
  const { error } = await supabase.from('food_log').insert(
    items.map((item) => ({
      user_id: uid,
      name: item.name,
      meal,
      amount_g: item.amountG,
      nutrients: item.nutrients,
    })),
  )
  if (error) throw error

  // Drinks in the description count toward the day's hydration. This runs
  // after the food insert and is deliberately not rolled back with it: a
  // logged meal whose water didn't record is a smaller problem than a meal
  // that vanished because the water failed.
  const waterMl = items.reduce((sum, item) => sum + (item.waterMl ?? 0), 0)
  if (waterMl > 0) await logDrink(Math.min(5000, waterMl), 'meal')
}

export async function fetchEntry(id: string): Promise<FoodLogEntry | null> {
  const { data, error } = await supabase
    .from('food_log')
    .select(ENTRY_COLS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data as FoodLogEntry | null
}

export async function updateEntry(
  id: string,
  amountG: number,
  meal: FoodLogEntry['meal'],
  nutrients: NutrientMap,
): Promise<void> {
  const { error } = await supabase
    .from('food_log')
    .update({ amount_g: amountG, meal, nutrients })
    .eq('id', id)
  if (error) throw error
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('food_log').delete().eq('id', id)
  if (error) throw error
}

/** Everything logged in the last `days` London days (over-fetches by UTC,
    callers filter by London day key). */
export async function fetchRecentLog(days: number): Promise<FoodLogEntry[]> {
  const { data, error } = await supabase
    .from('food_log')
    .select(ENTRY_COLS)
    .gte('logged_at', sinceIso(days))
    .order('logged_at')
  if (error) throw error
  return data as FoodLogEntry[]
}

// Weight ----------------------------------------------------------------

/** Weigh-ins over the last `days`, oldest first. */
export async function fetchWeightLog(days: number): Promise<WeightEntry[]> {
  const since = londonDayKeyDaysAgo(days)
  const { data, error } = await supabase
    .from('weight_log')
    .select('day, weight_kg')
    .gte('day', since)
    .order('day')
  if (error) throw error
  return data as WeightEntry[]
}

function londonDayKeyDaysAgo(days: number): string {
  return londonDayKey(new Date(Date.now() - days * 24 * 60 * 60 * 1000))
}

/** One weigh-in per day: logging again for the same day corrects it. */
export async function saveWeight(day: string, weightKg: number): Promise<void> {
  const { error } = await supabase
    .from('weight_log')
    .upsert({ user_id: await userId(), day, weight_kg: weightKg }, { onConflict: 'user_id,day' })
  if (error) throw error
}

export async function deleteWeight(day: string): Promise<void> {
  const { error } = await supabase.from('weight_log').delete().eq('day', day)
  if (error) throw error
}

// Hydration -------------------------------------------------------------

export async function fetchHydrationLog(days: number): Promise<HydrationEntry[]> {
  const { data, error } = await supabase
    .from('hydration_log')
    .select('id, logged_at, volume_ml, source')
    .gte('logged_at', sinceIso(days))
    .order('logged_at')
  if (error) throw error
  return data as HydrationEntry[]
}

export async function logDrink(
  volumeMl: number,
  source: HydrationEntry['source'] = 'manual',
): Promise<void> {
  const { error } = await supabase
    .from('hydration_log')
    .insert({ user_id: await userId(), volume_ml: volumeMl, source })
  if (error) throw error
}

export async function deleteDrink(id: string): Promise<void> {
  const { error } = await supabase.from('hydration_log').delete().eq('id', id)
  if (error) throw error
}
