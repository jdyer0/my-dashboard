import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { logFood, parseMealRemote, searchFoods } from '../food/data'
import { parseMealText, resolveAmountG, type ParsedMealItem } from '../food/mealParse'
import { mealForTime, microDataCount, type Meal } from '../lib/nutrition'
import type { Food } from '../food/types'

const MEALS: { key: Meal; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
]

const MAX_MATCHES = 6

interface ReviewRow {
  parsed: ParsedMealItem
  matches: Food[]
  foodId: string | null
  amount: string
  /** True once the user has typed in the amount field — stops the prefill
      from overwriting their number when they switch the matched food. */
  edited: boolean
}

/** The foods search is a single-substring ilike, so multi-word queries like
    "grilled chicken breast" miss CoFID's comma-separated names. Search on the
    longest word, then rank by how many query words the name contains, breaking
    ties toward foods that carry micronutrient data so the auto-picked match
    feeds the micros screen rather than logging a macro-only entry. */
async function findMatches(query: string): Promise<Food[]> {
  const words = query.split(' ').filter((w) => w.length > 2)
  const terms = words.length > 0 ? [...words].sort((a, b) => b.length - a.length) : [query]
  for (const term of terms) {
    const found = await searchFoods(term)
    if (found.length === 0) continue
    const lower = words.map((w) => w.toLowerCase())
    return found
      .map((food) => ({
        food,
        score: lower.filter((w) => food.name.toLowerCase().includes(w)).length,
        micros: microDataCount(food.per_100g),
      }))
      .sort((a, b) => b.score - a.score || b.micros - a.micros)
      .map((scored) => scored.food)
      .slice(0, MAX_MATCHES)
  }
  return []
}

function rowAmountG(row: ReviewRow): number | null {
  const g = Number(row.amount.replace(',', '.'))
  return Number.isFinite(g) && g > 0 && g <= 5000 ? g : null
}

function rowKcal(row: ReviewRow): number | null {
  const food = row.matches.find((f) => f.id === row.foodId)
  const amountG = rowAmountG(row)
  const kcal = food?.per_100g.energy_kcal
  if (!food || amountG === null || !kcal || kcal.is_trace) return null
  return Math.round((kcal.value * amountG) / 100)
}

export function FoodChat() {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [meal, setMeal] = useState<Meal>(() => mealForTime(new Date()))
  const [rows, setRows] = useState<ReviewRow[] | null>(null)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  async function analyse() {
    const described = text.trim()
    if (!described || parsing) return
    setParsing(true)
    setFailed(null)
    setRows(null)
    // Gemini understands composite meals; the rule parser is the offline /
    // rate-limited fallback so the screen never depends on the network.
    let items: ParsedMealItem[]
    try {
      items = await parseMealRemote(described)
    } catch {
      items = []
    }
    if (items.length === 0) items = parseMealText(described)
    if (items.length === 0) {
      setFailed("Couldn't find any foods in that. Describe the meal again.")
      setParsing(false)
      return
    }
    try {
      const built = await Promise.all(
        items.map(async (item): Promise<ReviewRow> => {
          const matches = await findMatches(item.query)
          const first = matches[0]
          return {
            parsed: item,
            matches,
            foodId: first?.id ?? null,
            amount: first ? String(resolveAmountG(item, first.default_portion_g)) : '',
            edited: false,
          }
        }),
      )
      setRows(built)
    } catch {
      setFailed('Search failed. Try again.')
    } finally {
      setParsing(false)
    }
  }

  function updateRow(index: number, patch: Partial<ReviewRow>) {
    setRows((current) =>
      current ? current.map((row, i) => (i === index ? { ...row, ...patch } : row)) : current,
    )
  }

  function pickFood(index: number, foodId: string) {
    setRows((current) => {
      if (!current) return current
      return current.map((row, i) => {
        if (i !== index) return row
        const food = row.matches.find((f) => f.id === foodId)
        const amount =
          !row.edited && row.parsed.grams === null && food
            ? String(resolveAmountG(row.parsed, food.default_portion_g))
            : row.amount
        return { ...row, foodId, amount }
      })
    })
  }

  function removeRow(index: number) {
    setRows((current) => (current ? current.filter((_, i) => i !== index) : current))
  }

  const loggable = (rows ?? []).filter((row) => row.foodId && rowAmountG(row) !== null)
  const unmatched = (rows ?? []).filter((row) => !row.foodId)
  const totalKcal = loggable.reduce((sum, row) => sum + (rowKcal(row) ?? 0), 0)

  async function log() {
    if (loggable.length === 0 || saving) return
    setSaving(true)
    setFailed(null)
    try {
      for (const row of loggable) {
        await logFood(row.foodId as string, meal, rowAmountG(row) as number)
      }
      navigate('/food')
    } catch {
      setSaving(false)
      setFailed("Couldn't log the meal. Try again.")
    }
  }

  return (
    <div className="mx-auto w-full max-w-md md:max-w-2xl">
      <header className="pb-2 pt-2">
        <h1 className="text-screen-title text-ink">Describe a meal</h1>
      </header>

      <section className="rounded-card border border-line bg-surface p-3">
        <label htmlFor="meal-text" className="text-label text-ink-faint">
          What did you eat?
        </label>
        <textarea
          id="meal-text"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Grilled chicken breast, a serving of rice and a handful of broccoli"
          className="mt-1.5 w-full resize-none rounded-ctl border border-line bg-surface px-3 py-2.5 text-body text-ink placeholder:text-ink-faint focus:border-line-bright"
        />
        <button
          type="button"
          onClick={() => void analyse()}
          disabled={parsing || !text.trim()}
          className="mt-2 h-11 w-full btn-glow rounded-ctl border border-line bg-surface-raised text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98] disabled:text-ink-faint"
        >
          {parsing ? 'Working it out' : 'Break it down'}
        </button>
      </section>

      {failed && <p className="mt-2 text-body text-alert">{failed}</p>}

      {rows && (
        <>
          <section className="mt-2.5 rounded-card border border-line bg-surface p-3">
            <ul>
              {rows.map((row, index) => {
                const kcal = rowKcal(row)
                return (
                  <li
                    key={`${row.parsed.raw}-${index}`}
                    className="border-b border-line py-2.5 last:border-b-0"
                  >
                    <div className="flex items-center justify-between">
                      <span className="min-w-0 flex-1 truncate pr-2 text-label text-ink-faint">
                        {row.parsed.raw}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        aria-label={`Remove ${row.parsed.raw}`}
                        className="flex h-11 w-11 shrink-0 items-center justify-center text-body text-ink-faint transition-transform duration-150 ease-instrument active:scale-[0.98]"
                      >
                        ✕
                      </button>
                    </div>
                    {row.foodId ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={row.foodId}
                          onChange={(e) => pickFood(index, e.target.value)}
                          aria-label={`Matched food for ${row.parsed.raw}`}
                          className="h-11 min-w-0 flex-1 rounded-ctl border border-line bg-surface px-3 text-body text-ink focus:border-line-bright"
                        >
                          {row.matches.map((food) => (
                            <option key={food.id} value={food.id}>
                              {food.name}
                            </option>
                          ))}
                        </select>
                        <input
                          inputMode="decimal"
                          value={row.amount}
                          onChange={(e) => updateRow(index, { amount: e.target.value, edited: true })}
                          aria-label={`Amount in grams for ${row.parsed.raw}`}
                          className="h-11 w-20 shrink-0 rounded-ctl border border-line bg-surface px-2 text-center text-body font-mono tabular-nums text-ink focus:border-line-bright"
                        />
                        <span className="w-14 shrink-0 text-right text-label font-mono tabular-nums text-ink-faint">
                          {kcal !== null ? `${kcal} kcal` : 'g'}
                        </span>
                      </div>
                    ) : (
                      <p className="pb-1 text-body text-warn">No match in your foods</p>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="mt-2.5 rounded-card border border-line bg-surface p-3">
            <p className="text-label text-ink-faint">Meal</p>
            <div className="mt-1.5 grid grid-cols-4 gap-2">
              {MEALS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMeal(key)}
                  className={`h-11 rounded-ctl border text-label transition-transform duration-150 ease-instrument active:scale-[0.98] ${
                    meal === key
                      ? 'border-line-bright bg-surface-raised text-ink'
                      : 'border-line bg-surface text-ink-dim'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void log()}
              disabled={saving || loggable.length === 0}
              className="mt-3 h-11 w-full btn-glow rounded-ctl border border-line bg-surface-raised text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98] disabled:text-ink-faint"
            >
              Log {loggable.length} {loggable.length === 1 ? 'item' : 'items'}
              {totalKcal > 0 ? ` · ${totalKcal} kcal` : ''}
            </button>
            {unmatched.length > 0 && (
              <p className="mt-2 text-label text-ink-faint">
                Unmatched items are skipped. Log them from search.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  )
}
