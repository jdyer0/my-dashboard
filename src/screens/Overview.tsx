import { useEffect, useState, type ReactNode } from 'react'
import { BootSequence, BootItem } from '../motion/BootSequence'
import { CountUp } from '../motion/CountUp'
import { Sparkline } from '../motion/Sparkline'
import { Bar } from '../motion/Bar'
import { SyncDot } from '../motion/SyncDot'
import { Clock } from '../motion/Clock'
import { listAllSets, listExercises, listSessions } from '../gym/data'
import { bestLifts, bestPerSession } from '../gym/e1rm'
import { inLondonWeek, londonDayKey, recentLondonDayKeys } from '../lib/londonDay'
import {
  fetchHydrationLog,
  fetchNutrientDefs,
  fetchPrograms,
  fetchProfile,
  fetchRecentLog,
  fetchRniTargets,
  fetchSettings,
  fetchWeightLog,
} from '../food/data'
import { EXPENDITURE_WINDOW_DAYS, resolveCoach } from '../food/targets'
import { averageDailyIntake, nutrientTotal, targetFor } from '../lib/nutrition'
import { PAGE } from '../shell/PageHeader'

/** Enough history for the expenditure window; the overview needs no more. */
const HISTORY_DAYS = 35

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/London',
})

// Placeholder values — real data replaces these as each module lands.
// Gym (Phase 1) and food (Phase 2) are live; steps wait for Phase 4.
const placeholder = {
  steps: 8420,
  stepsTarget: 10000,
}

interface Strength {
  sessionsThisWeek: number
  bestName: string | null
  bestE1rmKg: number
  trend: number[]
}

function useStrength(): Strength {
  const [strength, setStrength] = useState<Strength>({
    sessionsThisWeek: 0,
    bestName: null,
    bestE1rmKg: 0,
    trend: [],
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [sessions, sets, exercises] = await Promise.all([
          listSessions(),
          listAllSets(),
          listExercises(),
        ])
        if (cancelled) return
        const now = new Date()
        const sessionsThisWeek = sessions.filter((s) => inLondonWeek(s.started_at, now)).length
        const best = bestLifts(sets)[0]
        setStrength({
          sessionsThisWeek,
          bestName: best ? (exercises.find((e) => e.id === best.exerciseId)?.name ?? null) : null,
          bestE1rmKg: best?.e1rmKg ?? 0,
          trend: best ? bestPerSession(sets, best.exerciseId).slice(-12) : [],
        })
      } catch {
        // The overview stays quiet on failure — zeros, no error banner.
        // The gym tab is where a load failure gets surfaced and retried.
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return strength
}

interface Nutrition {
  kcalToday: number
  kcalTarget: number | null
  proteinToday: number
  proteinTargetG: number | null
  /** Measured expenditure, once the coach has enough data. */
  expenditureKcal: number | null
  trendWeightKg: number | null
  waterMl: number
  waterTargetMl: number
  /** Worst micro under 50% of RNI on the 7-day view, if any. */
  worstMicro: { name: string; pct: number } | null
}

const EMPTY_NUTRITION: Nutrition = {
  kcalToday: 0,
  kcalTarget: null,
  proteinToday: 0,
  proteinTargetG: null,
  expenditureKcal: null,
  trendWeightKg: null,
  waterMl: 0,
  waterTargetMl: 2500,
  worstMicro: null,
}

function useNutrition(): Nutrition {
  const [nutrition, setNutrition] = useState<Nutrition>(EMPTY_NUTRITION)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [profile, settings, rni, defs, log, weights, hydration, programs] = await Promise.all(
          [
            fetchProfile(),
            fetchSettings(),
            fetchRniTargets(),
            fetchNutrientDefs(),
            fetchRecentLog(HISTORY_DAYS),
            fetchWeightLog(HISTORY_DAYS),
            fetchHydrationLog(1),
            fetchPrograms(1),
          ],
        )
        if (cancelled) return
        const now = new Date()
        const todayKey = londonDayKey(now)
        const weekKeys = new Set(recentLondonDayKeys(now, 7))
        const dayKeys = recentLondonDayKeys(now, HISTORY_DAYS)
        const todayFoods = log
          .filter((e) => londonDayKey(new Date(e.logged_at)) === todayKey)
          .map((e) => ({ nutrients: e.nutrients }))
        const weekFoods = log
          .filter((e) => weekKeys.has(londonDayKey(new Date(e.logged_at))))
          .map((e) => ({ nutrients: e.nutrients }))

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
        const targets = coach.targets

        let worst: { name: string; pct: number } | null = null
        if (targets && weekFoods.length > 0) {
          for (const def of defs.filter((d) => d.kind === 'micro')) {
            const average = averageDailyIntake(weekFoods, def.key, 7)
            const target = targetFor(rni, def.key, targets.sex, targets.ageYears)
            if (average === null || target === null || target <= 0) continue
            const pct = (average / target) * 100
            if (pct < 50 && (!worst || pct < worst.pct)) {
              worst = { name: def.display_name, pct }
            }
          }
        }

        setNutrition({
          kcalToday: nutrientTotal(todayFoods, 'energy_kcal').value,
          kcalTarget: targets?.kcalTarget ?? null,
          proteinToday: nutrientTotal(todayFoods, 'protein').value,
          proteinTargetG: targets?.proteinTargetG ?? null,
          expenditureKcal: coach.expenditure ? Math.round(coach.expenditure.kcal) : null,
          trendWeightKg: coach.trendWeightKg,
          waterMl: hydration
            .filter((h) => londonDayKey(new Date(h.logged_at)) === todayKey)
            .reduce((sum, h) => sum + h.volume_ml, 0),
          waterTargetMl: settings.hydration_target_ml,
          worstMicro: worst,
        })
      } catch {
        // Quiet on the overview; the food tab surfaces and retries failures.
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return nutrition
}

function MetricTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <BootItem className="rounded-card border border-line bg-surface px-2 py-2.5">
      <p className="text-label text-ink-faint">{label}</p>
      <p className="glow-ink mt-1 text-metric-sm text-ink">{children}</p>
    </BootItem>
  )
}

function TargetRow({
  label,
  value,
  max,
  unit,
  decimals = 0,
}: {
  label: string
  value: number
  max: number
  unit: string
  decimals?: number
}) {
  const onTarget = value >= max
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-label text-ink-faint">{label}</span>
        <span className={`text-label ${onTarget ? 'glow-live text-live' : 'text-ink-dim'}`}>
          <CountUp value={value} decimals={decimals} /> /{' '}
          {max.toLocaleString('en-GB', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })}{' '}
          {unit}
        </span>
      </div>
      <Bar
        value={value}
        max={max}
        className="mt-1.5"
        fillClassName={onTarget ? 'bg-live shadow-glow-sm' : 'bg-warn'}
        shimmer={onTarget}
      />
    </div>
  )
}

export function Overview() {
  const today = dateFormat.format(new Date())
  const strength = useStrength()
  const nutrition = useNutrition()

  return (
    <BootSequence>
      <div className={PAGE}>
        <BootItem>
          <header className="flex items-center justify-between pb-2 pt-2">
            <h1 className="text-screen-title text-ink">{today}</h1>
            <span className="flex items-center gap-2">
              <SyncDot state="synced" />
              <Clock className="text-label text-ink-dim" />
            </span>
          </header>
        </BootItem>

        {/* Five tiles: three then two on a phone, one row once the desktop
            rail has freed the width. */}
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-5">
          <MetricTile label="Sessions">
            <CountUp value={strength.sessionsThisWeek} />
          </MetricTile>
          <MetricTile label={nutrition.kcalTarget === null ? 'Kcal today' : 'Kcal left'}>
            <CountUp
              value={
                nutrition.kcalTarget === null
                  ? nutrition.kcalToday
                  : nutrition.kcalTarget - nutrition.kcalToday
              }
            />
          </MetricTile>
          <MetricTile label="Water L">
            <CountUp value={nutrition.waterMl / 1000} decimals={1} />
          </MetricTile>
          <MetricTile label="Trend kg">
            {nutrition.trendWeightKg === null ? (
              <span className="text-ink-faint">—</span>
            ) : (
              <CountUp value={nutrition.trendWeightKg} decimals={1} />
            )}
          </MetricTile>
          <MetricTile label="Burned">
            {nutrition.expenditureKcal === null ? (
              <span className="text-ink-faint">—</span>
            ) : (
              <CountUp value={nutrition.expenditureKcal} />
            )}
          </MetricTile>
        </div>

        <div className="mt-2.5 grid gap-2.5 md:grid-cols-2">
          <BootItem className="rounded-card border border-line bg-surface p-3">
            <h2 className="text-card-title text-ink">Strength</h2>
            {strength.bestName ? (
              <div className="mt-2 flex items-end justify-between">
                <div>
                  <p className="glow-ink text-metric text-ink">
                    <CountUp value={strength.bestE1rmKg} decimals={1} />
                  </p>
                  <p className="mt-0.5 text-label text-ink-faint">
                    e1RM kg, {strength.bestName.toLowerCase()}
                  </p>
                </div>
                {strength.trend.length >= 2 && (
                  <Sparkline points={strength.trend} className="text-ink-dim" />
                )}
              </div>
            ) : (
              <p className="mt-2 text-body text-ink-dim">Log your first workout</p>
            )}
          </BootItem>

          <BootItem className="rounded-card border border-line bg-surface p-3">
            <h2 className="text-card-title text-ink">Today</h2>
            <div className="mt-3 space-y-3">
              {nutrition.proteinTargetG !== null && (
                <TargetRow
                  label="Protein"
                  value={Math.round(nutrition.proteinToday)}
                  max={Math.round(nutrition.proteinTargetG)}
                  unit="g"
                />
              )}
              <TargetRow
                label="Water"
                value={nutrition.waterMl / 1000}
                max={nutrition.waterTargetMl / 1000}
                unit="L"
                decimals={1}
              />
              <TargetRow
                label="Steps"
                value={placeholder.steps}
                max={placeholder.stepsTarget}
                unit=""
              />
              {nutrition.worstMicro && (
                <div className="flex items-baseline justify-between">
                  <span className="text-label text-ink-faint">Lowest micronutrient, 7 days</span>
                  <span className="text-label font-mono tabular-nums text-warn">
                    {nutrition.worstMicro.name} {Math.round(nutrition.worstMicro.pct)}%
                  </span>
                </div>
              )}
            </div>
          </BootItem>
        </div>
      </div>
    </BootSequence>
  )
}
