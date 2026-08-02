import { useState, type ReactNode } from 'react'
import { Bar } from '../motion/Bar'
import { CountUp } from '../motion/CountUp'
import { saveProfile } from '../food/data'
import { PAGE, PageHeader } from '../shell/PageHeader'

/** The one button style the food module uses. */
export const BUTTON =
  'h-11 w-full btn-glow rounded-ctl border border-line bg-surface-raised text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98] disabled:text-ink-faint'

export const CARD = 'rounded-card border border-line bg-surface p-3'

/** Container for a screen pushed off the food tabs — same width, own title.
    Every push gets a back control: the tab bar would drop you on the diary and
    lose which of the four views you came from. */
export function FoodPush({
  title,
  subtitle,
  back = { to: '/food', label: 'Food' },
  children,
}: {
  title: string
  subtitle?: string
  back?: { to: string; label: string }
  children: ReactNode
}) {
  return (
    <div className={PAGE}>
      <PageHeader back={back} title={title} subtitle={subtitle} />
      {children}
    </div>
  )
}

export function LoadFailed({ what, onRetry }: { what: string; onRetry?: () => void }) {
  return (
    <div>
      <p className="py-8 text-body text-alert">Couldn't load {what}. Try again.</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={BUTTON}>
          Retry
        </button>
      )}
    </div>
  )
}

/** Sex and date of birth: micronutrient RNIs are keyed by both, so the coach
    prompts rather than assuming. */
export function ProfilePrompt({ onSaved }: { onSaved: () => void }) {
  const [sex, setSex] = useState<'male' | 'female' | null>(null)
  const [birthDate, setBirthDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  async function save() {
    if (!sex || !birthDate || saving) return
    setSaving(true)
    setFailed(false)
    try {
      await saveProfile(sex, birthDate)
      onSaved()
    } catch {
      setSaving(false)
      setFailed(true)
    }
  }

  return (
    // Capped: a sex toggle and a date field stretched across a desktop reads as
    // a form someone forgot to lay out.
    <section className={`${CARD} lg:max-w-2xl`}>
      <h2 className="text-card-title text-ink">Set your targets</h2>
      <p className="mt-1 text-body text-ink-dim">
        Nutrient targets are UK RNIs, looked up by sex and age.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(['male', 'female'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setSex(option)}
            className={`h-11 rounded-ctl border text-body transition-transform duration-150 ease-instrument active:scale-[0.98] ${
              sex === option
                ? 'border-line-bright bg-surface-raised text-ink'
                : 'border-line bg-surface text-ink-dim'
            }`}
          >
            {option === 'male' ? 'Male' : 'Female'}
          </button>
        ))}
      </div>
      <div className="mt-2 space-y-1.5">
        <label htmlFor="birth-date" className="block text-label text-ink-faint">
          Date of birth
        </label>
        <input
          id="birth-date"
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          className="h-11 w-full rounded-ctl border border-line bg-surface px-3 text-body font-mono tabular-nums text-ink focus:border-line-bright"
        />
      </div>
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || !sex || !birthDate}
        className={`mt-3 ${BUTTON}`}
      >
        Save
      </button>
      {failed && <p className="mt-2 text-body text-alert">Couldn't save. Try again.</p>}
    </section>
  )
}

/**
 * One macro against its target. Colour is rationed (§4): protein earns the
 * accent when it's met because it's the macro worth hitting, carbohydrate and
 * fat stay neutral because being under them is not a failure.
 */
export function MacroRow({
  label,
  value,
  target,
  unit = 'g',
  accent = false,
}: {
  label: string
  value: number
  target: number
  unit?: string
  accent?: boolean
}) {
  const onTarget = value >= target
  const remaining = target - value
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-label text-ink-faint">{label}</span>
        <span className="text-label font-mono tabular-nums text-ink-dim">
          <CountUp value={Math.round(value)} /> / {Math.round(target)} {unit}
          <span className="ml-2 text-ink-faint">
            {remaining > 0 ? `${Math.round(remaining)} left` : `+${Math.round(-remaining)}`}
          </span>
        </span>
      </div>
      <Bar
        value={value}
        max={target}
        className="mt-1.5"
        fillClassName={accent && onTarget ? 'bg-live shadow-glow-sm' : 'bg-ink-dim'}
        shimmer={accent && onTarget}
      />
    </div>
  )
}

/** A labelled figure in a card — the module's workhorse row. */
export function StatRow({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <span className="text-body text-ink-dim">
        {label}
        {hint && <span className="ml-2 text-label text-ink-faint">{hint}</span>}
      </span>
      <span className="shrink-0 text-body font-mono tabular-nums text-ink">{children}</span>
    </div>
  )
}
