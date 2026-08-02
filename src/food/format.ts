/** Signed kilograms, with the sign always shown — a rate of change reads
    ambiguously without it, and a minus sign is the whole message. Uses a true
    minus (−), not a hyphen, so it aligns in tabular numerals. */
export function signedKg(kg: number, decimals = 2): string {
  const rounded = Number(kg.toFixed(decimals))
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : ''
  return `${sign}${Math.abs(rounded).toFixed(decimals)}`
}
