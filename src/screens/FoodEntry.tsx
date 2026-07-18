import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { deleteEntry, fetchEntry, updateEntry } from '../food/data'
import type { Meal } from '../lib/nutrition'
import type { FoodLogEntry } from '../food/types'

const MEALS: { key: Meal; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
]

const MULTIPLIERS = [0.5, 1, 1.5, 2]

export function FoodEntry() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [entry, setEntry] = useState<FoodLogEntry | null>(null)
  const [amount, setAmount] = useState('')
  const [meal, setMeal] = useState<Meal>('lunch')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    fetchEntry(id).then(
      (found) => {
        if (cancelled) return
        if (!found) {
          navigate('/food', { replace: true })
          return
        }
        setEntry(found)
        setAmount(String(found.amount_g))
        setMeal(found.meal)
      },
      () => {
        if (!cancelled) setFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [id, navigate])

  if (failed) {
    return (
      <div className="mx-auto max-w-md">
        <p className="py-8 text-body text-alert">Couldn't load the entry. Go back and retry.</p>
      </div>
    )
  }

  if (!entry) return null

  const amountG = Number(amount.replace(',', '.'))
  const amountValid = Number.isFinite(amountG) && amountG > 0 && amountG <= 5000

  async function save() {
    if (!entry || !amountValid || saving) return
    setSaving(true)
    try {
      await updateEntry(entry.id, amountG, meal)
      navigate('/food')
    } catch {
      setSaving(false)
      setFailed(true)
    }
  }

  async function remove() {
    if (!entry || saving) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setSaving(true)
    try {
      await deleteEntry(entry.id)
      navigate('/food')
    } catch {
      setSaving(false)
      setConfirmDelete(false)
      setFailed(true)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <header className="pb-2 pt-2">
        <h1 className="text-screen-title text-ink">{entry.foods.name}</h1>
        {entry.foods.brand && (
          <p className="mt-0.5 text-label text-ink-faint">{entry.foods.brand}</p>
        )}
      </header>

      <section className="rounded-card border border-line bg-surface p-3">
        <label htmlFor="amount" className="text-label text-ink-faint">
          Amount g
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
              onClick={() =>
                setAmount(String(Math.round(entry.foods.default_portion_g * mult * 10) / 10))
              }
              className="h-11 rounded-ctl border border-line bg-surface-raised text-body font-mono tabular-nums text-ink-dim transition-transform duration-150 ease-instrument active:scale-[0.98]"
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
          onClick={() => void save()}
          disabled={saving || !amountValid}
          className="mt-3 h-11 w-full rounded-ctl border border-line bg-surface-raised text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98] disabled:text-ink-faint"
        >
          Save
        </button>
      </section>

      <button
        type="button"
        onClick={() => void remove()}
        disabled={saving}
        className="mt-6 h-11 w-full rounded-ctl border border-line text-body text-alert transition-transform duration-150 ease-instrument active:scale-[0.98] disabled:text-ink-faint"
      >
        {confirmDelete ? 'Tap again to delete' : 'Delete entry'}
      </button>
    </div>
  )
}
