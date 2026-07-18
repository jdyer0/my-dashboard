import { supabase } from '../lib/supabase'
import type { NutrientDef, Per100g, RniTarget } from '../lib/nutrition'
import type { FdcResult, Food, FoodLogEntry, NutritionSettings, Profile } from './types'

const FOOD_COLS = 'id, name, brand, source, per_100g, default_portion_g, portion_label'
const ENTRY_COLS = `id, food_id, logged_at, meal, amount_g, foods (${FOOD_COLS})`

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
    .select('kcal_target, protein_g_target')
    .maybeSingle()
  if (error) throw error
  return data ?? { kcal_target: null, protein_g_target: null }
}

export async function saveSettings(settings: NutritionSettings): Promise<void> {
  const { error } = await supabase
    .from('nutrition_settings')
    .upsert({ user_id: await userId(), ...settings })
  if (error) throw error
}

/** Local name search. The trigram index makes ilike '%q%' fast; ranking
    (prefix first, then shortest name) happens client-side. */
export async function searchFoods(q: string): Promise<Food[]> {
  const { data, error } = await supabase
    .from('foods')
    .select(FOOD_COLS)
    .ilike('name', `%${q.replace(/%/g, '')}%`)
    .limit(30)
  if (error) throw error
  const lower = q.toLowerCase()
  return (data as Food[]).sort((a, b) => {
    const aPrefix = a.name.toLowerCase().startsWith(lower) ? 0 : 1
    const bPrefix = b.name.toLowerCase().startsWith(lower) ? 0 : 1
    return aPrefix - bPrefix || a.name.length - b.name.length
  })
}

export async function fetchFood(id: string): Promise<Food | null> {
  const { data, error } = await supabase.from('foods').select(FOOD_COLS).eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

/** Most people eat the same 20 foods: recent entries, deduped by food,
    most-frequent first, recency as the tiebreak. */
export async function recentFoods(): Promise<Food[]> {
  const { data, error } = await supabase
    .from('food_log')
    .select(`food_id, foods (${FOOD_COLS})`)
    .order('logged_at', { ascending: false })
    .limit(100)
  if (error) throw error
  const counts = new Map<string, { food: Food; count: number; firstSeen: number }>()
  // supabase-js types embedded to-one relations as arrays; PostgREST returns
  // an object for a many-to-one FK join, so the cast goes via unknown.
  const rows = data as unknown as { food_id: string; foods: Food }[]
  for (const [index, row] of rows.entries()) {
    const existing = counts.get(row.food_id)
    if (existing) existing.count++
    else counts.set(row.food_id, { food: row.foods, count: 1, firstSeen: index })
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.firstSeen - b.firstSeen)
    .slice(0, 20)
    .map((c) => c.food)
}

export async function fdcSearch(q: string): Promise<FdcResult[]> {
  const { data, error } = await supabase.functions.invoke('food-search-fdc', {
    body: { action: 'search', q },
  })
  if (error) throw error
  return (data as { results: FdcResult[] }).results
}

export async function fdcImport(fdcId: number): Promise<Food> {
  const { data, error } = await supabase.functions.invoke('food-search-fdc', {
    body: { action: 'import', fdcId },
  })
  if (error) throw error
  return (data as { food: Food }).food
}

export async function createCustomFood(
  name: string,
  per100g: Per100g,
  defaultPortionG: number,
  portionLabel: string | null,
): Promise<Food> {
  const { data, error } = await supabase
    .from('foods')
    .insert({
      name,
      source: 'custom',
      per_100g: per100g,
      default_portion_g: defaultPortionG,
      portion_label: portionLabel,
      created_by: await userId(),
    })
    .select(FOOD_COLS)
    .single()
  if (error) throw error
  return data
}

export async function logFood(
  foodId: string,
  meal: FoodLogEntry['meal'],
  amountG: number,
): Promise<void> {
  const { error } = await supabase.from('food_log').insert({
    user_id: await userId(),
    food_id: foodId,
    meal,
    amount_g: amountG,
  })
  if (error) throw error
}

export async function fetchEntry(id: string): Promise<FoodLogEntry | null> {
  const { data, error } = await supabase
    .from('food_log')
    .select(ENTRY_COLS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data as unknown as FoodLogEntry | null
}

export async function updateEntry(
  id: string,
  amountG: number,
  meal: FoodLogEntry['meal'],
): Promise<void> {
  const { error } = await supabase
    .from('food_log')
    .update({ amount_g: amountG, meal })
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
  return data as unknown as FoodLogEntry[]
}
