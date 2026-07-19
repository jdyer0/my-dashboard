import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { logMeal, parseMealRemote } from '../food/data'
import { mealForTime, scaleNutrients, type Meal, type NutrientMap } from '../lib/nutrition'

const MEALS: { key: Meal; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
]

interface ReviewRow {
  name: string
  /** Grams the estimate was made for — editing the amount rescales from this. */
  baseAmountG: number
  /** Nutrients for baseAmountG, as the coach estimated them. */
  nutrients: NutrientMap
  amount: string
}

function rowAmountG(row: ReviewRow): number | null {
  const g = Number(row.amount.replace(',', '.'))
  return Number.isFinite(g) && g > 0 && g <= 5000 ? g : null
}

/** The row's nutrients scaled to the amount in the input. */
function rowNutrients(row: ReviewRow): NutrientMap {
  const amountG = rowAmountG(row) ?? row.baseAmountG
  return scaleNutrients(row.nutrients, amountG / row.baseAmountG)
}

function rowKcal(row: ReviewRow): number | null {
  if (rowAmountG(row) === null) return null
  const kcal = rowNutrients(row).energy_kcal
  return kcal && !kcal.is_trace ? Math.round(kcal.value) : null
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
    try {
      const items = await parseMealRemote(described)
      if (items.length === 0) {
        setFailed("Couldn't find any foods in that. Describe the meal again.")
        return
      }
      setRows(
        items.map((item) => ({
          name: item.name,
          baseAmountG: item.amount_g,
          nutrients: item.nutrients,
          amount: String(item.amount_g),
        })),
      )
    } catch {
      setFailed("Couldn't estimate that meal. Try again.")
    } finally {
      setParsing(false)
    }
  }

  function updateAmount(index: number, amount: string) {
    setRows((current) =>
      current ? current.map((row, i) => (i === index ? { ...row, amount } : row)) : current,
    )
  }

  function removeRow(index: number) {
    setRows((current) => (current ? current.filter((_, i) => i !== index) : current))
  }

  const loggable = (rows ?? []).filter((row) => rowAmountG(row) !== null)
  const totalKcal = loggable.reduce((sum, row) => sum + (rowKcal(row) ?? 0), 0)

  async function log() {
    if (loggable.length === 0 || saving) return
    setSaving(true)
    setFailed(null)
    try {
      await logMeal(
        loggable.map((row) => ({
          name: row.name,
          amountG: rowAmountG(row) as number,
          nutrients: rowNutrients(row),
        })),
        meal,
      )
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
                    key={`${row.name}-${index}`}
                    className="border-b border-line py-2.5 last:border-b-0"
                  >
                    <div className="flex items-center justify-between">
                      <span className="min-w-0 flex-1 truncate pr-2 text-body text-ink-dim">
                        {row.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        aria-label={`Remove ${row.name}`}
                        className="flex h-11 w-11 shrink-0 items-center justify-center text-body text-ink-faint transition-transform duration-150 ease-instrument active:scale-[0.98]"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        inputMode="decimal"
                        value={row.amount}
                        onChange={(e) => updateAmount(index, e.target.value)}
                        aria-label={`Amount in grams for ${row.name}`}
                        className="h-11 w-20 shrink-0 rounded-ctl border border-line bg-surface px-2 text-center text-body font-mono tabular-nums text-ink focus:border-line-bright"
                      />
                      <span className="text-label text-ink-faint">g</span>
                      <span className="min-w-0 flex-1 text-right text-label font-mono tabular-nums text-ink-faint">
                        {kcal !== null ? `${kcal} kcal` : 'check the amount'}
                      </span>
                    </div>
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
          </section>
        </>
      )}
    </div>
  )
}
