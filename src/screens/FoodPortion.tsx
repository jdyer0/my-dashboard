import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchFood, logFood } from '../food/data'
import { mealForTime, type Meal } from '../lib/nutrition'
import type { Food } from '../food/types'

const MEALS: { key: Meal; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
]

const MULTIPLIERS = [0.5, 1, 1.5, 2]

export function FoodPortion() {
  const { foodId } = useParams()
  const navigate = useNavigate()
  const [food, setFood] = useState<Food | null>(null)
  const [amount, setAmount] = useState('')
  const [meal, setMeal] = useState<Meal>(() => mealForTime(new Date()))
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!foodId) return
    let cancelled = false
    fetchFood(foodId).then(
      (found) => {
        if (cancelled) return
        if (!found) {
          navigate('/food/log', { replace: true })
          return
        }
        setFood(found)
        setAmount(String(found.default_portion_g))
      },
      () => {
        if (!cancelled) setFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [foodId, navigate])

  if (failed) {
    return (
      <div className="mx-auto w-full max-w-md md:max-w-2xl">
        <p className="py-8 text-body text-alert">Couldn't load the food. Go back and retry.</p>
      </div>
    )
  }

  if (!food) return null

  const amountG = Number(amount.replace(',', '.'))
  const amountValid = Number.isFinite(amountG) && amountG > 0 && amountG <= 5000
  const kcalPer100 = food.per_100g.energy_kcal
  const kcalPreview =
    amountValid && kcalPer100 && !kcalPer100.is_trace
      ? Math.round((kcalPer100.value * amountG) / 100)
      : null

  async function log() {
    if (!food || !amountValid || saving) return
    setSaving(true)
    try {
      await logFood(food.id, meal, amountG)
      navigate('/food')
    } catch {
      setSaving(false)
      setFailed(true)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md md:max-w-2xl">
      <header className="pb-2 pt-2">
        <h1 className="text-screen-title text-ink">{food.name}</h1>
        {food.brand && <p className="mt-0.5 text-label text-ink-faint">{food.brand}</p>}
      </header>

      <section className="rounded-card border border-line bg-surface p-3">
        <label htmlFor="amount" className="text-label text-ink-faint">
          Amount g{food.portion_label ? ` · ${food.portion_label} is ${food.default_portion_g} g` : ''}
        </label>
        <input
          id="amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1.5 h-11 w-full rounded-ctl border border-line bg-surface px-3 text-center text-metric-sm font-mono tabular-nums text-ink focus:border-line-bright"
        />
        <div className="mt-2 grid grid-cols-4 gap-2">
          {MULTIPLIERS.map((mult) => (
            <button
              key={mult}
              type="button"
              onClick={() => setAmount(String(Math.round(food.default_portion_g * mult * 10) / 10))}
              className="h-11 btn-glow rounded-ctl border border-line bg-surface-raised text-body font-mono tabular-nums text-ink-dim transition-transform duration-150 ease-instrument active:scale-[0.98]"
            >
              ×{mult}
            </button>
          ))}
        </div>

        <p className="mt-2 text-label text-ink-faint">Meal</p>
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
          disabled={saving || !amountValid}
          className="mt-3 h-11 w-full btn-glow rounded-ctl border border-line bg-surface-raised text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98] disabled:text-ink-faint"
        >
          Log{kcalPreview !== null ? ` · ${kcalPreview} kcal` : ''}
        </button>
      </section>
    </div>
  )
}
