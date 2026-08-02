import type { NutrientMap } from '../lib/nutrition'

export interface FoodLogEntry {
  id: string
  name: string
  logged_at: string
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  amount_g: number
  /** Absolute nutrient amounts for this portion, estimated by the coach. */
  nutrients: NutrientMap
}

/** One food from a parsed meal description, with the coach's estimates. */
export interface ParsedMealItem {
  name: string
  amount_g: number
  nutrients: NutrientMap
  /** Fluid the item contributes to hydration, ml. Null when it isn't a drink. */
  water_ml: number | null
}

export interface Profile {
  sex: 'male' | 'female' | null
  birth_date: string | null
}

/** How the day's targets are decided. */
export type ProgramMode = 'coached' | 'manual'

export interface NutritionSettings {
  program_mode: ProgramMode
  /** Signed kg per week: negative loses, zero maintains, positive gains. */
  goal_rate_kg_per_week: number
  protein_g_per_kg: number
  /** Share of energy from fat, 0–1. */
  fat_pct_energy: number
  hydration_target_ml: number
  /** Manual-mode overrides. Null means "the coach decides". */
  kcal_target: number | null
  protein_g_target: number | null
  carb_g_target: number | null
  fat_g_target: number | null
}

/** A set of targets issued by a check-in and held for the week. */
export interface NutritionProgram {
  id: string
  /** London day the targets took effect — always a Monday. */
  effective_from: string
  kcal_target: number
  protein_g_target: number
  carb_g_target: number
  fat_g_target: number
  /** What the targets were derived from; null when set by hand. */
  expenditure_kcal: number | null
  trend_weight_kg: number | null
  source: ProgramMode
}

export interface WeightEntry {
  /** London day key, 'YYYY-MM-DD'. */
  day: string
  weight_kg: number
}

export interface HydrationEntry {
  id: string
  logged_at: string
  volume_ml: number
  source: 'manual' | 'meal'
}
