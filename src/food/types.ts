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
}

export interface Profile {
  sex: 'male' | 'female' | null
  birth_date: string | null
}

export interface NutritionSettings {
  kcal_target: number | null
  protein_g_target: number | null
  carb_g_target: number | null
  fat_g_target: number | null
}
