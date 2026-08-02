import {
  checkInDue,
  estimateExpenditure,
  goalStatus,
  programTargets,
  trendWeights,
  type DailyIntake,
  type Expenditure,
  type GoalStatus,
  type TrendPoint,
  type WeighIn,
} from '../lib/adaptive'
import {
  ageInYears,
  carbTargetG,
  fatTargetG,
  kcalTargetDefault,
  nutrientTotal,
  targetFor,
  type RniTarget,
} from '../lib/nutrition'
import { londonDayKey, londonWeekStartKey } from '../lib/londonDay'
import type {
  FoodLogEntry,
  NutritionProgram,
  NutritionSettings,
  Profile,
  WeightEntry,
} from './types'

/** The window the expenditure estimate looks back over. Long enough for the
    weight trend to say something, short enough to follow a real change. */
export const EXPENDITURE_WINDOW_DAYS = 28

export interface ResolvedTargets {
  kcalTarget: number
  proteinTargetG: number
  carbTargetG: number
  fatTargetG: number
  sex: 'male' | 'female'
  ageYears: number
  /** Where these numbers came from, for the diary to caption honestly. */
  origin: 'coached' | 'manual' | 'default'
  /** The Monday the coached targets took effect. Null when not coached. */
  effectiveFrom: string | null
}

/**
 * Everything the coach knows, derived once and shared by every food screen.
 * Assembling it in one place keeps the diary, trends and program screens
 * agreeing about what the targets are and why.
 */
export interface CoachState {
  targets: ResolvedTargets | null
  /** Smoothed weight history, oldest first. */
  trend: TrendPoint[]
  /** Latest trend weight, the figure macros are scaled from. */
  trendWeightKg: number | null
  /** Latest scale reading. */
  scaleWeightKg: number | null
  expenditure: Expenditure | null
  /** Measured rate against intended rate. */
  status: GoalStatus
  /** The Monday a new check-in would take effect, or null when not due. */
  checkInFrom: string | null
  /** The targets that check-in would issue. Null when there isn't enough data. */
  proposed: {
    kcalTarget: number
    proteinTargetG: number
    carbTargetG: number
    fatTargetG: number
  } | null
  latestProgram: NutritionProgram | null
}

/** Daily energy totals keyed by London day — null for days with no log. */
export function dailyEnergy(entries: FoodLogEntry[], dayKeys: string[]): DailyIntake[] {
  const byDay = new Map<string, FoodLogEntry[]>()
  for (const entry of entries) {
    const key = londonDayKey(new Date(entry.logged_at))
    const list = byDay.get(key)
    if (list) list.push(entry)
    else byDay.set(key, [entry])
  }
  return dayKeys.map((day) => {
    const dayEntries = byDay.get(day)
    if (!dayEntries || dayEntries.length === 0) return { day, kcal: null }
    return { day, kcal: nutrientTotal(dayEntries, 'energy_kcal').value }
  })
}

/**
 * Targets before the coach has anything to go on: UK guideline calories for
 * the user's sex, protein at the RNI, carbohydrate and fat as shares of
 * energy. These are a placeholder, not a recommendation — the whole point of
 * the adaptive engine is to replace them with measured numbers, and the diary
 * labels them as provisional until it can.
 */
function defaultTargets(
  sex: 'male' | 'female',
  ageYears: number,
  rni: RniTarget[],
): Omit<ResolvedTargets, 'origin' | 'effectiveFrom'> {
  const kcal = kcalTargetDefault(sex)
  return {
    kcalTarget: kcal,
    proteinTargetG: targetFor(rni, 'protein', sex, ageYears) ?? 50,
    carbTargetG: carbTargetG(kcal),
    fatTargetG: fatTargetG(kcal),
    sex,
    ageYears,
  }
}

export interface CoachInputs {
  profile: Profile
  settings: NutritionSettings
  rni: RniTarget[]
  weights: WeightEntry[]
  /** Food log covering at least EXPENDITURE_WINDOW_DAYS. */
  log: FoodLogEntry[]
  /** Day keys the expenditure window spans, oldest first. */
  windowDayKeys: string[]
  programs: NutritionProgram[]
  now: Date
}

/**
 * Resolve everything the food screens need from the raw stored state.
 *
 * Targets come from the most recent accepted check-in when the coach is
 * driving, from the user's own figures in manual mode, and from UK guideline
 * defaults only until one of those exists. The check-in itself is *proposed*,
 * never applied: a target that changed on its own between opening the app and
 * logging lunch would be worse than a stale one.
 */
export function resolveCoach(inputs: CoachInputs): CoachState {
  const { profile, settings, rni, weights, log, windowDayKeys, programs, now } = inputs

  const weighIns: WeighIn[] = weights.map((w) => ({ day: w.day, kg: Number(w.weight_kg) }))
  const trend = trendWeights(weighIns)
  const latest = trend[trend.length - 1] ?? null
  const trendWeightKg = latest?.trendKg ?? null
  const scaleWeightKg = latest?.kg ?? null

  const today = londonDayKey(now)
  const expenditure = estimateExpenditure(
    weighIns,
    dailyEnergy(log, windowDayKeys),
    EXPENDITURE_WINDOW_DAYS,
    today,
  )

  const latestProgram = programs[0] ?? null
  const checkInFrom = checkInDue(latestProgram?.effective_from ?? null, londonWeekStartKey(now))

  const proposed =
    expenditure && trendWeightKg !== null
      ? (() => {
          const t = programTargets({
            expenditureKcal: expenditure.kcal,
            goalRateKgPerWeek: Number(settings.goal_rate_kg_per_week),
            trendWeightKg,
            proteinGPerKg: Number(settings.protein_g_per_kg),
            fatPctEnergy: Number(settings.fat_pct_energy),
          })
          return {
            kcalTarget: t.kcal,
            proteinTargetG: t.proteinG,
            carbTargetG: t.carbG,
            fatTargetG: t.fatG,
          }
        })()
      : null

  const status = goalStatus(
    expenditure?.ratePerWeekKg ?? null,
    Number(settings.goal_rate_kg_per_week),
  )

  // Targets need sex and age — micronutrient RNIs are keyed by them, and the
  // screens prompt for a profile rather than guessing.
  if (!profile.sex || !profile.birth_date) {
    return {
      targets: null,
      trend,
      trendWeightKg,
      scaleWeightKg,
      expenditure,
      status,
      checkInFrom,
      proposed,
      latestProgram,
    }
  }

  const sex = profile.sex
  const ageYears = ageInYears(profile.birth_date, now)
  const fallback = defaultTargets(sex, ageYears, rni)

  let targets: ResolvedTargets
  if (settings.program_mode === 'manual') {
    // Manual mode reads the user's own figures, falling back per-field so a
    // half-filled form doesn't blank the diary.
    targets = {
      ...fallback,
      kcalTarget: settings.kcal_target ?? fallback.kcalTarget,
      proteinTargetG: settings.protein_g_target ?? fallback.proteinTargetG,
      carbTargetG: settings.carb_g_target ?? fallback.carbTargetG,
      fatTargetG: settings.fat_g_target ?? fallback.fatTargetG,
      origin: 'manual',
      effectiveFrom: null,
    }
  } else if (latestProgram) {
    targets = {
      ...fallback,
      kcalTarget: latestProgram.kcal_target,
      proteinTargetG: Number(latestProgram.protein_g_target),
      carbTargetG: Number(latestProgram.carb_g_target),
      fatTargetG: Number(latestProgram.fat_g_target),
      origin: 'coached',
      effectiveFrom: latestProgram.effective_from,
    }
  } else {
    targets = { ...fallback, origin: 'default', effectiveFrom: null }
  }

  return {
    targets,
    trend,
    trendWeightKg,
    scaleWeightKg,
    expenditure,
    status,
    checkInFrom,
    proposed,
    latestProgram,
  }
}
