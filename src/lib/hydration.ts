// Hydration maths. Pure — no network, no DOM.
//
// Stored in whole millilitres, read in litres. Keeping the integer as the
// source of truth means a day of 250 ml glasses totals exactly 2.000 L rather
// than 1.9999999999999998, and the "hit your target" comparison is an integer
// one that can't fail by a rounding hair.

export interface DrinkEntry {
  /** London day key, 'YYYY-MM-DD'. */
  day: string
  volumeMl: number
}

export interface HydrationDay {
  day: string
  totalMl: number
  /** True when the day met or beat the target. */
  onTarget: boolean
}

/** Litres, to one decimal — the resolution a person actually drinks in. */
export function litres(ml: number): string {
  return (ml / 1000).toLocaleString('en-GB', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

/** Millilitres for a litre figure typed by the user. */
export function mlFromLitres(l: number): number {
  return Math.round(l * 1000)
}

/** Total for one day. */
export function totalForDay(entries: DrinkEntry[], day: string): number {
  return entries.reduce((sum, e) => (e.day === day ? sum + e.volumeMl : sum), 0)
}

/**
 * One row per day key given, in the order given — including days with nothing
 * logged, which are a real zero here. Water differs from nutrients that way:
 * an unlogged glass is indistinguishable from an undrunk one, so there is no
 * null-vs-zero distinction to preserve (contrast CLAUDE.md §7).
 */
export function dailyTotals(
  entries: DrinkEntry[],
  dayKeys: string[],
  targetMl: number,
): HydrationDay[] {
  const byDay = new Map<string, number>()
  for (const e of entries) byDay.set(e.day, (byDay.get(e.day) ?? 0) + e.volumeMl)
  return dayKeys.map((day) => {
    const totalMl = byDay.get(day) ?? 0
    return { day, totalMl, onTarget: totalMl >= targetMl }
  })
}

/**
 * Consecutive days on target, counting back from the most recent day.
 *
 * Today is forgiving: a day still in progress hasn't failed yet, so an
 * incomplete today leaves the streak behind it intact rather than reading as
 * a break. Any earlier day below target ends the run.
 */
export function currentStreak(days: HydrationDay[]): number {
  let streak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i]
    if (!day) break
    if (day.onTarget) {
      streak++
      continue
    }
    // The last entry is today — short of target simply means "not yet".
    if (i === days.length - 1) continue
    break
  }
  return streak
}

/** Mean daily intake across the days given, in ml. Zero-length gives null. */
export function averageDailyMl(days: HydrationDay[]): number | null {
  if (days.length === 0) return null
  return days.reduce((sum, d) => sum + d.totalMl, 0) / days.length
}

/**
 * A starting hydration target from bodyweight: roughly 35 ml per kg, the
 * figure UK dietetic guidance uses for adults, rounded to a quarter litre so
 * it reads as a number of glasses rather than a lab measurement. Clamped to a
 * sane band — this is a suggestion the user can overwrite, not a prescription.
 */
export function suggestedTargetMl(weightKg: number): number {
  const raw = weightKg * 35
  return Math.min(4000, Math.max(1500, Math.round(raw / 250) * 250))
}
