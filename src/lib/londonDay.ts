// A "day" is the user's London calendar day, not a UTC day (CLAUDE.md §6).
// Day keys are 'YYYY-MM-DD' strings; ISO ordering makes them comparable.

// en-CA formats as YYYY-MM-DD directly.
const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The London calendar day containing the instant, as 'YYYY-MM-DD'. */
export function londonDayKey(date: Date): string {
  return dayFormat.format(date)
}

/** Monday of the London week containing the instant, as 'YYYY-MM-DD'. */
export function londonWeekStartKey(date: Date): string {
  const key = londonDayKey(date)
  const [y, m, d] = key.split('-').map(Number)
  if (y === undefined || m === undefined || d === undefined) throw new Error(`Bad day key ${key}`)
  // Noon UTC anchors the calendar date away from any DST edge.
  const anchor = new Date(Date.UTC(y, m - 1, d, 12))
  const daysSinceMonday = (anchor.getUTCDay() + 6) % 7
  anchor.setUTCDate(anchor.getUTCDate() - daysSinceMonday)
  return anchor.toISOString().slice(0, 10)
}

/** True when the instant falls in the same London week (Mon–Sun) as `now`. */
export function inLondonWeek(iso: string, now: Date): boolean {
  return londonWeekStartKey(new Date(iso)) === londonWeekStartKey(now)
}
