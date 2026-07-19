import type { Per100g } from '../lib/nutrition'

export interface Food {
  id: string
  name: string
  brand: string | null
  source: 'cofid' | 'fdc' | 'custom'
  per_100g: Per100g
  default_portion_g: number
  portion_label: string | null
}

export interface FoodLogEntry {
  id: string
  food_id: string
  logged_at: string
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  amount_g: number
  foods: Food
}

export interface FdcResult {
  fdcId: number
  name: string
  brand: string | null
  kcalPer100g: number | null
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
