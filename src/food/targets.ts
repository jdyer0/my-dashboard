import {
  ageInYears,
  kcalTargetDefault,
  targetFor,
  type RniTarget,
} from '../lib/nutrition'
import type { NutritionSettings, Profile } from './types'

export interface ResolvedTargets {
  kcalTarget: number
  proteinTargetG: number
  sex: 'male' | 'female'
  ageYears: number
}

/**
 * Targets need sex and age; without a completed profile the screens prompt
 * instead of guessing. Settings override the defaults where present.
 */
export function resolveTargets(
  profile: Profile,
  settings: NutritionSettings,
  rni: RniTarget[],
  now: Date,
): ResolvedTargets | null {
  if (!profile.sex || !profile.birth_date) return null
  const ageYears = ageInYears(profile.birth_date, now)
  const kcalTarget = settings.kcal_target ?? kcalTargetDefault(profile.sex)
  const proteinTargetG =
    settings.protein_g_target ?? targetFor(rni, 'protein', profile.sex, ageYears) ?? 50
  return { kcalTarget, proteinTargetG, sex: profile.sex, ageYears }
}
