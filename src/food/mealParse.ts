// Rule-based meal-description parser. Splits "chicken breast, rice and a
// handful of broccoli" into searchable items with quantity hints — no model,
// no network. Gram amounts resolve later against the matched food's default
// portion, so the parser only reports what the text actually says.

export interface ParsedMealItem {
  /** The fragment as the user typed it, for display. */
  raw: string
  /** Cleaned text to search the foods table with. */
  query: string
  /** Absolute grams when stated ("150g") or implied by a measure ("a handful"). */
  grams: number | null
  /** Portion multiplier ("2 slices", "three eggs") when grams is unknown. */
  count: number | null
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  half: 0.5,
  couple: 2,
  few: 3,
}

/** Approximate grams for household measures. Deliberately coarse — the review
    screen shows the number and the user corrects it. */
const MEASURE_GRAMS: Record<string, number> = {
  handful: 30,
  tablespoon: 15,
  tbsp: 15,
  teaspoon: 5,
  tsp: 5,
  splash: 30,
  drizzle: 10,
  knob: 10,
  glass: 250,
  mug: 250,
  cup: 240,
  bowl: 300,
  plate: 350,
  can: 330,
  tin: 400,
}

/** Count-style units where the food's default portion is the right weight. */
const PORTION_WORDS = new Set([
  'slice',
  'slices',
  'piece',
  'pieces',
  'rasher',
  'rashers',
  'fillet',
  'fillets',
  'scoop',
  'scoops',
  'serving',
  'servings',
  'portion',
  'portions',
  'bar',
  'bars',
  'packet',
  'packets',
  'bag',
  'bags',
  'pot',
  'pots',
])

const FILLER = new Set(['of', 'some', 'the', 'my', 'about', 'roughly', 'around', 'small', 'big', 'large'])

function singular(word: string): string {
  return word.endsWith('s') ? word.slice(0, -1) : word
}

function parseFragment(raw: string): ParsedMealItem | null {
  let text = raw.trim()
  if (!text) return null

  let grams: number | null = null
  let count: number | null = null

  // Explicit weights: "150g", "150 g", "0.5 kg", "200ml" (ml ≈ g for food).
  text = text.replace(/(\d+(?:[.,]\d+)?)\s*(?:kg|kilos?|kilograms?)\b/i, (_, n: string) => {
    grams = Math.round(Number(n.replace(',', '.')) * 1000)
    return ''
  })
  text = text.replace(/(\d+(?:[.,]\d+)?)\s*(?:g|grams?|ml|millilitres?)\b/i, (_, n: string) => {
    grams = Math.round(Number(n.replace(',', '.')))
    return ''
  })

  const words = text.split(/\s+/).filter(Boolean)
  const queryWords: string[] = []
  for (const word of words) {
    const clean = word.toLowerCase().replace(/[^a-z0-9./]/g, '')
    if (!clean) continue
    const asNumber = /^\d+(?:\.\d+)?$/.test(clean) ? Number(clean) : NUMBER_WORDS[clean]
    if (asNumber !== undefined && count === null && queryWords.length === 0) {
      count = asNumber
      continue
    }
    const measure = MEASURE_GRAMS[singular(clean)]
    if (measure !== undefined && grams === null) {
      grams = Math.round(measure * (count ?? 1))
      count = null
      continue
    }
    if (PORTION_WORDS.has(clean)) continue
    if (FILLER.has(clean)) continue
    queryWords.push(clean)
  }

  if (queryWords.length === 0) return null
  return {
    raw: raw.trim(),
    query: queryWords.join(' '),
    grams,
    // "a" before a plain food ("a banana") means one portion, but bare counts
    // of 1 add nothing — keep only meaningful multipliers or explicit ones.
    count: grams !== null ? null : count,
  }
}

/** Splits a meal description into items. Commas, "and", "with", newlines and
    "+" all separate foods. "and"/"with" inside a single food name is the
    known trade-off — the review screen makes fixing it a one-tap job. */
export function parseMealText(text: string): ParsedMealItem[] {
  return text
    .split(/,|\n|\+|&|\band\b|\bwith\b|\bplus\b|\bthen\b/i)
    .map(parseFragment)
    .filter((item): item is ParsedMealItem => item !== null)
    .slice(0, 25)
}

/** Resolves the grams to prefill for a matched food. */
export function resolveAmountG(item: ParsedMealItem, defaultPortionG: number): number {
  if (item.grams !== null) return item.grams
  return Math.round(defaultPortionG * (item.count ?? 1))
}
