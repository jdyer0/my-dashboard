import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { createCustomFood } from '../food/data'
import type { NutrientValue } from '../lib/nutrition'

// Only fields the user plausibly knows from a label. Anything left blank
// stays unknown (absent from per_100g) — never zero.
const MACRO_FIELDS: { key: string; label: string; unit: string }[] = [
  { key: 'energy_kcal', label: 'Energy', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbohydrate', label: 'Carbohydrate', unit: 'g' },
  { key: 'sugars', label: 'Sugars', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
  { key: 'saturates', label: 'Saturates', unit: 'g' },
  { key: 'fibre', label: 'Fibre', unit: 'g' },
  { key: 'salt', label: 'Salt', unit: 'g' },
]

export function FoodCustom() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [name, setName] = useState(params.get('name') ?? '')
  const [portionG, setPortionG] = useState('100')
  const [portionLabel, setPortionLabel] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const portionNum = Number(portionG.replace(',', '.'))
  const portionValid = Number.isFinite(portionNum) && portionNum > 0
  const valid = name.trim().length > 0 && portionValid

  async function save() {
    if (!valid || saving) return
    const per100g: Record<string, NutrientValue> = {}
    let malformed = false
    for (const field of MACRO_FIELDS) {
      const text = (values[field.key] ?? '').trim()
      if (!text) continue // unknown, not zero
      const n = Number(text.replace(',', '.'))
      if (!Number.isFinite(n) || n < 0) {
        malformed = true
        continue
      }
      per100g[field.key] = { value: n }
    }
    if (malformed) {
      setFailed(true)
      return
    }
    setSaving(true)
    setFailed(false)
    try {
      const food = await createCustomFood(
        name.trim(),
        per100g,
        portionNum,
        portionLabel.trim() || null,
      )
      navigate(`/food/portion/${food.id}`, { replace: true })
    } catch {
      setSaving(false)
      setFailed(true)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md md:max-w-2xl">
      <header className="pb-2 pt-2">
        <h1 className="text-screen-title text-ink">Custom food</h1>
        <p className="mt-0.5 text-label text-ink-faint">
          Values per 100 g. Leave anything unknown blank.
        </p>
      </header>

      <section className="space-y-2 rounded-card border border-line bg-surface p-3">
        <div className="space-y-1.5">
          <label htmlFor="food-name" className="block text-label text-ink-faint">
            Name
          </label>
          <input
            id="food-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 w-full rounded-ctl border border-line bg-surface px-3 text-body text-ink focus:border-line-bright"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <label htmlFor="portion-g" className="block text-label text-ink-faint">
              Portion g
            </label>
            <input
              id="portion-g"
              inputMode="decimal"
              value={portionG}
              onChange={(e) => setPortionG(e.target.value)}
              className="h-11 w-full rounded-ctl border border-line bg-surface px-3 text-body font-mono tabular-nums text-ink focus:border-line-bright"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="portion-label" className="block text-label text-ink-faint">
              Portion name
            </label>
            <input
              id="portion-label"
              type="text"
              placeholder="1 slice"
              value={portionLabel}
              onChange={(e) => setPortionLabel(e.target.value)}
              className="h-11 w-full rounded-ctl border border-line bg-surface px-3 text-body text-ink placeholder:text-ink-faint focus:border-line-bright"
            />
          </div>
        </div>

        {MACRO_FIELDS.map((field) => (
          <div key={field.key} className="flex items-center justify-between gap-3">
            <label htmlFor={`nutrient-${field.key}`} className="text-body text-ink-dim">
              {field.label}
            </label>
            <div className="flex items-center gap-1.5">
              <input
                id={`nutrient-${field.key}`}
                inputMode="decimal"
                value={values[field.key] ?? ''}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                className="h-11 w-24 rounded-ctl border border-line bg-surface px-2 text-right text-body font-mono tabular-nums text-ink focus:border-line-bright"
              />
              <span className="w-8 text-label text-ink-faint">{field.unit}</span>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !valid}
          className="mt-1 h-11 w-full btn-glow rounded-ctl border border-line bg-surface-raised text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98] disabled:text-ink-faint"
        >
          Save food
        </button>
        {failed && (
          <p className="text-body text-alert">Couldn't save. Check the numbers and try again.</p>
        )}
      </section>
    </div>
  )
}
