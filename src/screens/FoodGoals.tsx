import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchProfile, fetchRniTargets, fetchSettings, saveSettings } from '../food/data'
import { resolveTargets } from '../food/targets'

const FIELDS = [
  { key: 'kcal', label: 'Calories', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carb', label: 'Carbohydrate', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
] as const

type FieldKey = (typeof FIELDS)[number]['key']

export function FoodGoals() {
  const navigate = useNavigate()
  const [values, setValues] = useState<Record<FieldKey, string> | null>(null)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [noProfile, setNoProfile] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [profile, settings, rni] = await Promise.all([
          fetchProfile(),
          fetchSettings(),
          fetchRniTargets(),
        ])
        if (cancelled) return
        const targets = resolveTargets(profile, settings, rni, new Date())
        if (!targets) {
          setNoProfile(true)
          return
        }
        setValues({
          kcal: String(Math.round(targets.kcalTarget)),
          protein: String(Math.round(targets.proteinTargetG)),
          carb: String(Math.round(targets.carbTargetG)),
          fat: String(Math.round(targets.fatTargetG)),
        })
      } catch {
        if (!cancelled) setFailed(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const parsed = values
    ? {
        kcal: Number(values.kcal.replace(',', '.')),
        protein: Number(values.protein.replace(',', '.')),
        carb: Number(values.carb.replace(',', '.')),
        fat: Number(values.fat.replace(',', '.')),
      }
    : null
  const valid =
    parsed !== null &&
    Object.values(parsed).every((n) => Number.isFinite(n) && n > 0)

  async function save() {
    if (!parsed || !valid || saving) return
    setSaving(true)
    setFailed(false)
    try {
      await saveSettings({
        kcal_target: Math.round(parsed.kcal),
        protein_g_target: parsed.protein,
        carb_g_target: parsed.carb,
        fat_g_target: parsed.fat,
      })
      navigate('/food')
    } catch {
      setSaving(false)
      setFailed(true)
    }
  }

  if (noProfile) {
    return (
      <div className="mx-auto w-full max-w-md md:max-w-2xl">
        <header className="pb-2 pt-2">
          <h1 className="text-screen-title text-ink">Goals</h1>
        </header>
        <p className="py-8 text-body text-ink-dim">
          Goals need your sex and age first.{' '}
          <Link to="/food" className="text-ink underline decoration-line-bright">
            Set them on the food tab
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-md md:max-w-2xl">
      <header className="pb-2 pt-2">
        <h1 className="text-screen-title text-ink">Goals</h1>
        <p className="mt-0.5 text-label text-ink-faint">Daily calorie and macronutrient targets</p>
      </header>

      {failed && !values ? (
        <p className="py-8 text-body text-alert">Couldn't load your goals. Go back and retry.</p>
      ) : !values ? null : (
        <section className="space-y-2 rounded-card border border-line bg-surface p-3">
          {FIELDS.map((field) => (
            <div key={field.key} className="flex items-center justify-between gap-3">
              <label htmlFor={`goal-${field.key}`} className="text-body text-ink-dim">
                {field.label}
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  id={`goal-${field.key}`}
                  inputMode="numeric"
                  value={values[field.key]}
                  onChange={(e) =>
                    setValues((prev) => (prev ? { ...prev, [field.key]: e.target.value } : prev))
                  }
                  className="h-11 w-24 rounded-ctl border border-line bg-surface px-2 text-right text-body font-mono tabular-nums text-ink focus:border-line-bright"
                />
                <span className="w-9 text-label text-ink-faint">{field.unit}</span>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !valid}
            className="mt-1 h-11 w-full btn-glow rounded-ctl border border-line bg-surface-raised text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98] disabled:text-ink-faint"
          >
            Save goals
          </button>
          {failed && (
            <p className="text-body text-alert">Couldn't save. Check the numbers and try again.</p>
          )}
        </section>
      )}
    </div>
  )
}
