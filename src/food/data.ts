import { supabase } from '../lib/supabase'
import type { NutrientDef, NutrientMap, RniTarget } from '../lib/nutrition'
import type { FoodLogEntry, NutritionSettings, ParsedMealItem, Profile } from './types'

const ENTRY_COLS = 'id, name, logged_at, meal, amount_g, nutrients'

async function userId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user.id
  if (!id) throw new Error('Signed out')
  return id
}

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
    .select('kcal_target, protein_g_target, carb_g_target, fat_g_target')
    .maybeSingle()
  if (error) throw error
  return (
    data ?? { kcal_target: null, protein_g_target: null, carb_g_target: null, fat_g_target: null }
  )
}

export async function saveSettings(settings: NutritionSettings): Promise<void> {
  const { error } = await supabase
    .from('nutrition_settings')
    .upsert({ user_id: await userId(), ...settings })
  if (error) throw error
}

/** Nutrient values the meal-parse function may return, as plain numbers. */
type RemoteItem = { name?: unknown; amount_g?: unknown; nutrients?: unknown }

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

/** Sends a meal description to the meal-parse Edge Function (Gemini free
    tier), which splits it into foods and estimates each portion's macro- and
    micronutrients directly — there is no foods table to match against. */
export async function parseMealRemote(text: string): Promise<ParsedMealItem[]> {
  const { data, error } = await supabase.functions.invoke('meal-parse', {
    body: { text },
  })
  if (error) throw error
  const items = (data as { items?: RemoteItem[] }).items
  if (!Array.isArray(items)) throw new Error('Malformed response')
  return items
    .map((item): ParsedMealItem | null => {
      const name = typeof item.name === 'string' ? item.name.trim() : ''
      const amountG =
        typeof item.amount_g === 'number' && Number.isFinite(item.amount_g)
          ? Math.max(1, Math.round(item.amount_g))
          : null
      if (!name || amountG === null) return null
      return { name, amount_g: amountG, nutrients: toNutrientMap(item.nutrients) }
    })
    .filter((item): item is ParsedMealItem => item !== null)
}

export async function logMeal(
  items: { name: string; amountG: number; nutrients: NutrientMap }[],
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
  const since = new Date(Date.now() - (days + 1) * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('food_log')
    .select(ENTRY_COLS)
    .gte('logged_at', since)
    .order('logged_at')
  if (error) throw error
  return data as FoodLogEntry[]
}
