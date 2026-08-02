// The adaptive coach. Pure maths — nothing here touches the network or DOM.
//
// The idea, in one line: scale weight is noisy, energy balance is not. Smooth
// the weight into a trend, measure the trend's slope, and the difference
// between what the user ate and what the trend says they stored is what they
// burned. That expenditure — not a formula off height and age — is what the
// calorie target is built from, and it is re-derived weekly.
//
// Days are London calendar days throughout (CLAUDE.md §6); callers pass day
// keys from londonDay.ts, never UTC dates.

/** Energy density of body mass change. ~7,700 kcal per kg is the standard
    mixed-tissue figure; the pure-fat 9,400 overstates a real deficit because
    weight change also carries lean tissue, glycogen and its bound water. */
export const KCAL_PER_KG = 7700

/** Smoothing constant for the trend weight, per day. 0.15 gives a ~4-day
    half-life: fast enough to catch a real shift within a week, slow enough
    that a salty dinner or a missed toilet trip doesn't move it. */
const TREND_ALPHA = 0.15

export interface WeighIn {
  /** London day key, 'YYYY-MM-DD'. */
  day: string
  kg: number
}

export interface TrendPoint {
  day: string
  /** The scale reading. */
  kg: number
  /** The smoothed value — what the coach actually reasons about. */
  trendKg: number
}

/** Whole days between two 'YYYY-MM-DD' keys, b − a. Noon UTC anchors the
    arithmetic clear of any DST edge. */
export function daysBetween(a: string, b: string): number {
  return Math.round(dayIndex(b) - dayIndex(a))
}

/** A day key as a day number, for arithmetic and regression x-values. */
export function dayIndex(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  if (y === undefined || m === undefined || d === undefined) throw new Error(`Bad day key ${key}`)
  return Date.UTC(y, m - 1, d, 12) / 86_400_000
}

/**
 * Exponentially weighted trend weight, gap-aware.
 *
 * A plain EWMA assumes one observation per day and quietly over-weights the
 * reading after a gap. Compounding the decay across the gap — the trend keeps
 * drifting toward the last value while nobody is standing on the scale — means
 * a weigh-in after a fortnight away is treated as new information, not as if
 * it were yesterday's. Weigh-ins may arrive in any order; they are sorted here.
 */
export function trendWeights(weighIns: WeighIn[]): TrendPoint[] {
  const sorted = [...weighIns].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
  const out: TrendPoint[] = []
  let trend: number | null = null
  let lastDay: string | null = null

  for (const w of sorted) {
    if (trend === null || lastDay === null) {
      trend = w.kg
    } else {
      const gap = Math.max(1, daysBetween(lastDay, w.day))
      const alpha = 1 - Math.pow(1 - TREND_ALPHA, gap)
      trend = trend + alpha * (w.kg - trend)
    }
    lastDay = w.day
    out.push({ day: w.day, kg: w.kg, trendKg: trend })
  }
  return out
}

export interface Slope {
  /** Change per day in the y units. */
  perDay: number
  /** Standard error of the slope — the honest width of the estimate. */
  standardError: number
  /** Value the fit predicts at the last x. */
  fittedLast: number
}

/** Least-squares fit of y against x. Null under two points or with no spread
    in x (a vertical fit has no slope, and dividing by zero would invent one). */
export function linearFit(points: { x: number; y: number }[]): Slope | null {
  const n = points.length
  if (n < 2) return null
  const meanX = points.reduce((s, p) => s + p.x, 0) / n
  const meanY = points.reduce((s, p) => s + p.y, 0) / n
  let sxx = 0
  let sxy = 0
  for (const p of points) {
    sxx += (p.x - meanX) ** 2
    sxy += (p.x - meanX) * (p.y - meanY)
  }
  if (sxx === 0) return null
  const perDay = sxy / sxx
  const intercept = meanY - perDay * meanX

  // Residual scatter around the fit, converted to the slope's standard error.
  // With exactly two points the fit is exact and the error is genuinely zero.
  let sse = 0
  for (const p of points) sse += (p.y - (intercept + perDay * p.x)) ** 2
  const standardError = n > 2 ? Math.sqrt(sse / (n - 2) / sxx) : 0

  const lastX = points[points.length - 1]?.x ?? meanX
  return { perDay, standardError, fittedLast: intercept + perDay * lastX }
}

export interface DailyIntake {
  day: string
  /** Total energy logged that day. Null means the user didn't log — which is
      not the same as a zero-calorie day, and must never be averaged as one. */
  kcal: number | null
}

export interface Expenditure {
  /** Estimated daily energy expenditure, kcal. */
  kcal: number
  /** One standard error, kcal. The estimate is kcal ± this. */
  errorKcal: number
  /** Days in the window that carried a food log. */
  loggedDays: number
  /** Weigh-ins in the window. */
  weighIns: number
  /** Calendar span the estimate covers. */
  windowDays: number
  /** Trend weight change per week over the window, kg. */
  ratePerWeekKg: number
}

/** Below this the arithmetic is astrology: too few logged days or too short a
    weight span and the slope is noise wearing a number's clothes. */
export const MIN_LOGGED_DAYS = 10
export const MIN_WEIGH_INS = 4
export const MIN_SPAN_DAYS = 10

/**
 * Expenditure from energy balance: what went in, minus what the trend says got
 * stored.
 *
 *   TDEE = mean intake − (trend slope in kg/day × 7,700)
 *
 * Only days with a food log count toward mean intake. That biases the estimate
 * high if the user skips logging on light days, which is the honest failure
 * mode: it is better to under-promise a deficit than to invent one from days
 * that were never recorded.
 *
 * Returns null rather than a shaky number when the window is too thin.
 */
export function estimateExpenditure(
  weighIns: WeighIn[],
  intake: DailyIntake[],
  windowDays: number,
  today: string,
): Expenditure | null {
  const firstDay = dayIndex(today) - (windowDays - 1)
  const inWindow = (day: string) => dayIndex(day) >= firstDay && dayIndex(day) <= dayIndex(today)

  const logged = intake.filter((d) => d.kcal !== null && inWindow(d.day))
  if (logged.length < MIN_LOGGED_DAYS) return null

  // Trend is computed over the full history, then clipped: smoothing needs the
  // run-up, or the first point in the window starts cold at its raw value.
  const trend = trendWeights(weighIns).filter((p) => inWindow(p.day))
  if (trend.length < MIN_WEIGH_INS) return null

  const first = trend[0]
  const last = trend[trend.length - 1]
  if (!first || !last) return null
  const span = daysBetween(first.day, last.day)
  if (span < MIN_SPAN_DAYS) return null

  const fit = linearFit(trend.map((p) => ({ x: dayIndex(p.day), y: p.trendKg })))
  if (!fit) return null

  const intakeValues = logged.map((d) => d.kcal as number)
  const meanIntake = intakeValues.reduce((s, v) => s + v, 0) / intakeValues.length
  const storedPerDay = fit.perDay * KCAL_PER_KG

  // Two independent sources of doubt — how noisy the weight trend is and how
  // variable the eating was — combined in quadrature rather than added, since
  // they don't err in the same direction.
  const slopeError = fit.standardError * KCAL_PER_KG
  const intakeVariance =
    intakeValues.length > 1
      ? intakeValues.reduce((s, v) => s + (v - meanIntake) ** 2, 0) / (intakeValues.length - 1)
      : 0
  const intakeError = Math.sqrt(intakeVariance / intakeValues.length)

  return {
    kcal: meanIntake - storedPerDay,
    errorKcal: Math.sqrt(slopeError ** 2 + intakeError ** 2),
    loggedDays: logged.length,
    weighIns: trend.length,
    windowDays: span + 1,
    ratePerWeekKg: fit.perDay * 7,
  }
}

export interface MacroTargets {
  kcal: number
  proteinG: number
  carbG: number
  fatG: number
}

export interface ProgramInputs {
  expenditureKcal: number
  /** Signed: negative loses, zero maintains, positive gains. */
  goalRateKgPerWeek: number
  /** Bodyweight the macros are scaled from — the trend, not the scale. */
  trendWeightKg: number
  proteinGPerKg: number
  /** Share of energy from fat, 0–1. */
  fatPctEnergy: number
}

/** Never prescribe below this, whatever the arithmetic says. */
const KCAL_FLOOR = 1200
/** Nor below this share of expenditure — a crash deficit isn't a target. */
const DEFICIT_FLOOR = 0.65
const SURPLUS_CEILING = 1.35
/** Essential fat intake, g per kg of bodyweight. */
const FAT_FLOOR_G_PER_KG = 0.5

const KCAL_PER_G_PROTEIN = 4
const KCAL_PER_G_CARB = 4
const KCAL_PER_G_FAT = 9

/**
 * Turn an expenditure and a goal into a day's targets.
 *
 * Calories come from expenditure plus the goal rate's energy cost. Protein is
 * pinned to bodyweight and defended first — it is the macro with a job beyond
 * fuel. Fat takes its share of what's left, floored at the essential intake.
 * Carbohydrate absorbs the remainder, which is what makes it the macro that
 * moves when the target changes.
 */
export function programTargets(inputs: ProgramInputs): MacroTargets {
  const { expenditureKcal, goalRateKgPerWeek, trendWeightKg, proteinGPerKg, fatPctEnergy } = inputs

  const raw = expenditureKcal + (goalRateKgPerWeek * KCAL_PER_KG) / 7
  const kcal = Math.max(
    KCAL_FLOOR,
    expenditureKcal * DEFICIT_FLOOR,
    Math.min(raw, expenditureKcal * SURPLUS_CEILING),
  )

  const proteinG = trendWeightKg * proteinGPerKg
  const fatFloorG = trendWeightKg * FAT_FLOOR_G_PER_KG
  let fatG = Math.max(fatFloorG, (kcal * fatPctEnergy) / KCAL_PER_G_FAT)

  let remainder = kcal - proteinG * KCAL_PER_G_PROTEIN - fatG * KCAL_PER_G_FAT
  if (remainder < 0) {
    // A high protein setting on a deep cut can outrun the calorie budget.
    // Give the energy back from fat first, down to the essential floor, and
    // only then let carbohydrate sit at zero rather than go negative.
    const giveBack = Math.min(-remainder / KCAL_PER_G_FAT, fatG - fatFloorG)
    fatG -= giveBack
    remainder = kcal - proteinG * KCAL_PER_G_PROTEIN - fatG * KCAL_PER_G_FAT
  }

  return {
    kcal: Math.round(kcal),
    proteinG: Math.round(proteinG),
    carbG: Math.round(Math.max(0, remainder) / KCAL_PER_G_CARB),
    fatG: Math.round(fatG),
  }
}

/** Energy a set of macro targets actually accounts for — the diary shows this
    beside the calorie target so a hand-edited split that doesn't add up is
    visible rather than silently wrong. */
export function macroEnergy(targets: Pick<MacroTargets, 'proteinG' | 'carbG' | 'fatG'>): number {
  return (
    targets.proteinG * KCAL_PER_G_PROTEIN +
    targets.carbG * KCAL_PER_G_CARB +
    targets.fatG * KCAL_PER_G_FAT
  )
}

/**
 * Check-ins land on Mondays. Targets that moved mid-week would make the diary
 * unreadable — the point of a weekly cadence is that the number you are eating
 * to is the same number all week. Returns the Monday a new check-in would take
 * effect, or null when the current week's has already been accepted.
 */
export function checkInDue(
  latestEffectiveFrom: string | null,
  currentWeekStart: string,
): string | null {
  if (latestEffectiveFrom === null) return currentWeekStart
  return latestEffectiveFrom < currentWeekStart ? currentWeekStart : null
}

/**
 * How the goal is actually going: measured rate against intended rate.
 * 'on-track' allows a generous band, because a week of trend movement is a
 * small signal and tightening this would cry wolf every Monday.
 */
export type GoalStatus = 'on-track' | 'faster' | 'slower' | 'unknown'

export function goalStatus(
  actualRatePerWeekKg: number | null,
  goalRateKgPerWeek: number,
): GoalStatus {
  if (actualRatePerWeekKg === null) return 'unknown'
  const tolerance = Math.max(0.15, Math.abs(goalRateKgPerWeek) * 0.5)
  const delta = actualRatePerWeekKg - goalRateKgPerWeek
  if (Math.abs(delta) <= tolerance) return 'on-track'
  // "Faster" means the weight is moving more than intended, "slower" less.
  // On a maintenance goal there is no intended direction, so any drift beyond
  // the tolerance is movement the user didn't ask for.
  if (goalRateKgPerWeek === 0) return 'faster'
  return goalRateKgPerWeek < 0 ? (delta < 0 ? 'faster' : 'slower') : delta > 0 ? 'faster' : 'slower'
}
