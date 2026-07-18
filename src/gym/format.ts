/** Kilograms for display: thousands separators, at most one decimal. */
export function fmtKg(n: number): string {
  return n.toLocaleString('en-GB', { maximumFractionDigits: 1 })
}

export const sessionDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/London',
})

export const clockTime = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Europe/London',
})
