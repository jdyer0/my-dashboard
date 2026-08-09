import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { logMeal } from '../food/data'
import {
  BLANK_FIELDS,
  LABEL_FIELDS,
  checkManualEntry,
  type LabelBasis,
  type LabelFields,
} from '../food/manualEntry'
import { mealForTime, type Meal } from '../lib/nutrition'
import { BUTTON, CARD, FoodPush } from './FoodParts'

const MEALS: { key: Meal; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
]

const BASES: { key: LabelBasis; label: string }[] = [
  { key: 'portion', label: 'This portion' },
  { key: 'per100', label: 'Per 100 g' },
]

/**
 * Typing a label instead of describing a meal. The coach's estimate is the
 * record for anything cooked, but a packaged food already carries better
 * numbers on the back than a model would guess at, and the free tier runs out
 * partway through a day. Everything the form does with the figures lives in
 * `food/manualEntry.ts`, under test — this screen only collects them.
 */
export function FoodManual() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [basis, setBasis] = useState<LabelBasis>('portion')
  const [fields, setFields] = useState<LabelFields>(BLANK_FIELDS)
  const [meal, setMeal] = useState<Meal>(() => mealForTime(new Date()))
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  // Nothing turns red until there's something to be wrong about: a form that
  // scolds you for the fields you haven't reached yet is unusable.
  const [touched, setTouched] = useState(false)

  const { draft, invalid, macroKcal } = checkManualEntry({ name, amount, fields, basis })
  const flagged = (key: string) => touched && invalid.includes(key)

  const kcal = draft?.nutrients.energy_kcal?.value ?? null
  // Only worth flagging when both numbers were given and they disagree by more
  // than rounding on the pack would explain.
  const energyGap =
    kcal !== null && macroKcal !== null && !draft?.energyDerived
      ? Math.abs(kcal - macroKcal)
      : null
  const energyMismatch = energyGap !== null && kcal !== null && energyGap > Math.max(20, kcal * 0.1)

  function setField(key: string, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  async function log() {
    if (!draft || saving) {
      setTouched(true)
      return
    }
    setSaving(true)
    setFailed(false)
    try {
      await logMeal(
        [{ name: draft.name, amountG: draft.amountG, nutrients: draft.nutrients }],
        meal,
      )
      navigate('/food')
    } catch {
      setSaving(false)
      setFailed(true)
    }
  }

  const fieldClass = (key: string) =>
    `h-11 w-28 rounded-ctl border bg-surface px-2 text-right text-body font-mono tabular-nums text-ink focus:border-line-bright ${
      flagged(key) ? 'border-alert' : 'border-line'
    }`

  return (
    <FoodPush title="Enter a meal" subtitle="Straight off the back of the pack">
      <section className={CARD}>
        <label htmlFor="manual-name" className="text-label text-ink-faint">
          What was it?
        </label>
        <input
          id="manual-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tesco chicken and mushroom pie"
          className={`mt-1.5 h-11 w-full rounded-ctl border bg-surface px-3 text-body text-ink placeholder:text-ink-faint focus:border-line-bright ${
            flagged('name') ? 'border-alert' : 'border-line'
          }`}
        />

        <label htmlFor="manual-amount" className="mt-3 block text-label text-ink-faint">
          How much, in grams
        </label>
        <input
          id="manual-amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="220"
          className={`mt-1.5 h-11 w-full rounded-ctl border bg-surface px-3 text-center text-metric-sm font-mono tabular-nums text-ink placeholder:text-ink-faint focus:border-line-bright ${
            flagged('amount') ? 'border-alert' : 'border-line'
          }`}
        />

        <p className="mt-3 text-label text-ink-faint">Meal</p>
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
      </section>

      <section className={`mt-2.5 ${CARD}`}>
        <h2 className="text-card-title text-ink">Nutrition</h2>

        {/* Packs print both columns and which one you're reading is the easiest
            thing in the world to get wrong, so it's a choice, not a guess. */}
        <div className="mt-2 grid grid-cols-2 gap-2">
          {BASES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setBasis(key)}
              className={`h-11 rounded-ctl border text-body transition-transform duration-150 ease-instrument active:scale-[0.98] ${
                basis === key
                  ? 'border-line-bright bg-surface-raised text-ink'
                  : 'border-line bg-surface text-ink-dim'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-label text-ink-faint">
          {basis === 'per100'
            ? 'Typed per 100 g and scaled to the amount above.'
            : 'Typed for the amount above.'}
        </p>

        <div className="mt-2 space-y-2">
          {LABEL_FIELDS.map((field) => (
            <div key={field.key} className="flex items-center justify-between gap-3">
              <label
                htmlFor={`manual-${field.key}`}
                className={`text-body ${field.indent ? 'pl-4 text-ink-faint' : 'text-ink-dim'}`}
              >
                {field.label}
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  id={`manual-${field.key}`}
                  inputMode="decimal"
                  value={fields[field.key]}
                  onChange={(e) => setField(field.key, e.target.value)}
                  className={fieldClass(field.key)}
                />
                <span className="w-9 text-label text-ink-faint">{field.unit}</span>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-2 text-label text-ink-faint">
          Leave anything the pack doesn't say blank — a blank reads as unknown, a zero as none.
        </p>
      </section>

      <section className={`mt-2.5 ${CARD}`}>
        {draft?.energyDerived && (
          <p className="mb-2 text-label font-mono tabular-nums text-ink-faint">
            Energy worked out from the macros: {Math.round(kcal ?? 0)} kcal.
          </p>
        )}
        {energyMismatch && kcal !== null && (
          <p className="mb-2 text-label font-mono tabular-nums text-warn">
            The macros come to {macroKcal} kcal, not {Math.round(kcal)}. Check the column you
            typed.
          </p>
        )}
        <button
          type="button"
          onClick={() => void log()}
          disabled={saving}
          className={BUTTON}
        >
          {kcal !== null ? `Log ${Math.round(kcal)} kcal` : 'Log it'}
        </button>
        {touched && !draft && (
          <p className="mt-2 text-body text-alert">
            {invalid.includes('energy_kcal') && !invalid.includes('name') && !invalid.includes('amount')
              ? 'Add the energy, or all three of protein, carbohydrate and fat.'
              : 'Fill in the name, the amount and the energy.'}
          </p>
        )}
        {failed && <p className="mt-2 text-body text-alert">Couldn't log that. Try again.</p>}
      </section>

      <Link
        to="/food/chat"
        className="mt-6 block text-center text-label text-ink-faint underline decoration-line-bright"
      >
        Describe it instead
      </Link>
    </FoodPush>
  )
}
