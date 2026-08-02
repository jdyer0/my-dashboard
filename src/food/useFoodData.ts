import { useCallback, useEffect, useState } from 'react'
import {
  fetchHydrationLog,
  fetchNutrientDefs,
  fetchPrograms,
  fetchProfile,
  fetchRecentLog,
  fetchRniTargets,
  fetchSettings,
  fetchWeightLog,
} from './data'
import { EXPENDITURE_WINDOW_DAYS, resolveCoach, type CoachState } from './targets'
import { londonDayKey, recentLondonDayKeys } from '../lib/londonDay'
import { dailyTotals, type DrinkEntry, type HydrationDay } from '../lib/hydration'
import type { NutrientDef, RniTarget } from '../lib/nutrition'
import type {
  FoodLogEntry,
  HydrationEntry,
  NutritionProgram,
  NutritionSettings,
  Profile,
  WeightEntry,
} from './types'

/** History every food screen has in hand. Deep enough for the expenditure
    window and the trend charts, shallow enough to stay one round trip. */
const HISTORY_DAYS = 90

export interface FoodData {
  profile: Profile
  settings: NutritionSettings
  defs: NutrientDef[]
  rni: RniTarget[]
  /** Food log over HISTORY_DAYS, oldest first. */
  log: FoodLogEntry[]
  weights: WeightEntry[]
  hydration: HydrationEntry[]
  programs: NutritionProgram[]
  coach: CoachState
  /** London day keys over HISTORY_DAYS, oldest first. */
  dayKeys: string[]
  today: string
  /** Today's food log entries. */
  todayEntries: FoodLogEntry[]
  /** Hydration per day over HISTORY_DAYS, oldest first. */
  hydrationDays: HydrationDay[]
  todayWaterMl: number
}

export interface FoodDataState {
  data: FoodData | null
  failed: boolean
  reload: () => void
}

/**
 * Loads the whole food module's state in one pass.
 *
 * The screens share a loader rather than each fetching what it needs: the
 * coach's numbers have to agree everywhere, and a diary showing one calorie
 * target while the trends screen computes another from a slightly later read
 * is the kind of inconsistency that destroys trust in the figures.
 */
export function useFoodData(): FoodDataState {
  const [data, setData] = useState<FoodData | null>(null)
  const [failed, setFailed] = useState(false)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setFailed(false)
      try {
        const [profile, settings, defs, rni, log, weights, hydration, programs] = await Promise.all(
          [
            fetchProfile(),
            fetchSettings(),
            fetchNutrientDefs(),
            fetchRniTargets(),
            fetchRecentLog(HISTORY_DAYS),
            fetchWeightLog(HISTORY_DAYS),
            fetchHydrationLog(HISTORY_DAYS),
            fetchPrograms(),
          ],
        )
        if (cancelled) return

        const now = new Date()
        const today = londonDayKey(now)
        const dayKeys = recentLondonDayKeys(now, HISTORY_DAYS)

        const coach = resolveCoach({
          profile,
          settings,
          rni,
          weights,
          log,
          windowDayKeys: dayKeys.slice(-EXPENDITURE_WINDOW_DAYS),
          programs,
          now,
        })

        const drinks: DrinkEntry[] = hydration.map((h) => ({
          day: londonDayKey(new Date(h.logged_at)),
          volumeMl: h.volume_ml,
        }))
        const hydrationDays = dailyTotals(drinks, dayKeys, settings.hydration_target_ml)

        setData({
          profile,
          settings,
          defs,
          rni,
          log,
          weights,
          hydration,
          programs,
          coach,
          dayKeys,
          today,
          todayEntries: log.filter((e) => londonDayKey(new Date(e.logged_at)) === today),
          hydrationDays,
          todayWaterMl: hydrationDays[hydrationDays.length - 1]?.totalMl ?? 0,
        })
      } catch {
        if (!cancelled) setFailed(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [nonce])

  return { data, failed, reload }
}
