import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BootItem, BootSequence } from '../motion/BootSequence'
import { CountUp } from '../motion/CountUp'
import { Bar } from '../motion/Bar'
import {
  fetchProfile,
  fetchRecentLog,
  fetchRniTargets,
  fetchSettings,
  saveProfile,
} from '../food/data'
import { resolveTargets, type ResolvedTargets } from '../food/targets'
import {
  carbTargetG,
  fatTargetG,
  FIBRE_TARGET_G,
  nutrientTotal,
  type RniTarget,
} from '../lib/nutrition'
import { londonDayKey } from '../lib/londonDay'
import type { FoodLogEntry, Profile } from '../food/types'

const MEALS: { key: FoodLogEntry['meal']; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snacks' },
]

interface FoodData {
  profile: Profile
  targets: ResolvedTargets | null
  rni: RniTarget[]
  todayEntries: FoodLogEntry[]
}

function ProfilePrompt({ onSaved }: { onSaved: () => void }) {
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
    <section className="rounded-card border border-line bg-surface p-3">
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
        className="mt-3 h-11 w-full rounded-ctl border border-line bg-surface-raised text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98] disabled:text-ink-faint"
      >
        Save
      </button>
      {failed && <p className="mt-2 text-body text-alert">Couldn't save. Try again.</p>}
    </section>
  )
}

function MacroRow({
  label,
  value,
  target,
  accent,
}: {
  label: string
  value: number
  target: number
  accent?: boolean
}) {
  const onTarget = value >= target
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-label text-ink-faint">{label}</span>
        <span className="text-label font-mono tabular-nums text-ink-dim">
          {Math.round(value)} / {Math.round(target)} g
        </span>
      </div>
      <Bar
        value={value}
        max={target}
        className="mt-1.5"
        fillClassName={accent ? (onTarget ? 'bg-live' : 'bg-warn') : 'bg-ink-dim'}
      />
    </div>
  )
}

export function Food() {
  const navigate = useNavigate()
  const [data, setData] = useState<FoodData | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const [profile, settings, rni, log] = await Promise.all([
        fetchProfile(),
        fetchSettings(),
        fetchRniTargets(),
        fetchRecentLog(1),
      ])
      const todayKey = londonDayKey(new Date())
      setData({
        profile,
        rni,
        targets: resolveTargets(profile, settings, rni, new Date()),
        todayEntries: log.filter((e) => londonDayKey(new Date(e.logged_at)) === todayKey),
      })
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (failed) {
    return (
      <div className="mx-auto max-w-md">
        <header className="pb-1 pt-2">
          <h1 className="text-screen-title text-ink">Food</h1>
        </header>
        <p className="py-8 text-body text-alert">Couldn't load your food log. Try again.</p>
        <button
          type="button"
          onClick={() => void load()}
          className="h-11 w-full rounded-ctl border border-line bg-surface-raised text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98]"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data) return null

  const loggedFoods = data.todayEntries.map((e) => ({
    amountG: e.amount_g,
    per100g: e.foods.per_100g,
  }))
  const kcal = nutrientTotal(loggedFoods, 'energy_kcal').value
  const protein = nutrientTotal(loggedFoods, 'protein').value
  const carbs = nutrientTotal(loggedFoods, 'carbohydrate').value
  const fat = nutrientTotal(loggedFoods, 'fat').value
  const fibre = nutrientTotal(loggedFoods, 'fibre').value

  const targets = data.targets
  const kcalWithin = targets
    ? Math.abs(kcal - targets.kcalTarget) <= targets.kcalTarget * 0.1
    : false

  return (
    <BootSequence>
      <div className="mx-auto max-w-md">
        <BootItem>
          <header className="flex items-center justify-between pb-2 pt-2">
            <h1 className="text-screen-title text-ink">Food</h1>
            <Link to="/food/micros" className="flex min-h-[44px] items-center px-2 text-label text-ink-dim">
              Micronutrients
            </Link>
          </header>
        </BootItem>

        {!targets && (
          <BootItem className="mb-2.5">
            <ProfilePrompt onSaved={() => void load()} />
          </BootItem>
        )}

        <BootItem className="rounded-card border border-line bg-surface p-3">
          <h2 className="text-card-title text-ink">Today</h2>
          <div className="mt-2 flex items-baseline gap-2">
            <p className={`text-metric ${kcalWithin ? 'glow-live text-live' : targets ? 'text-warn' : 'text-ink'}`}>
              <CountUp value={kcal} />
            </p>
            {targets && (
              <p className="text-label font-mono tabular-nums text-ink-faint">
                / {targets.kcalTarget.toLocaleString('en-GB')} kcal
              </p>
            )}
          </div>
          {targets && (
            <div className="mt-3 space-y-3">
              <MacroRow label="Protein" value={protein} target={targets.proteinTargetG} accent />
              <MacroRow label="Carbohydrate" value={carbs} target={carbTargetG(targets.kcalTarget)} />
              <MacroRow label="Fat" value={fat} target={fatTargetG(targets.kcalTarget)} />
              <MacroRow label="Fibre" value={fibre} target={FIBRE_TARGET_G} />
            </div>
          )}
        </BootItem>

        <BootItem className="mt-2.5">
          <button
            type="button"
            onClick={() => navigate('/food/log')}
            className="h-11 w-full rounded-ctl border border-line bg-surface-raised text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98]"
          >
            Log food
          </button>
        </BootItem>

        {data.todayEntries.length > 0 ? (
          MEALS.map(({ key, label }) => {
            const entries = data.todayEntries.filter((e) => e.meal === key)
            if (entries.length === 0) return null
            return (
              <BootItem key={key} className="mt-2.5 rounded-card border border-line bg-surface p-3">
                <h2 className="text-card-title text-ink">{label}</h2>
                <ul className="mt-1">
                  {entries.map((entry) => {
                    const entryKcal = entry.foods.per_100g.energy_kcal
                    return (
                      <li key={entry.id}>
                        <Link
                          to={`/food/entry/${entry.id}`}
                          className="flex min-h-[44px] items-center justify-between border-b border-line py-2 last:border-b-0"
                        >
                          <span className="min-w-0 flex-1 truncate pr-3 text-body text-ink-dim">
                            {entry.foods.name}
                          </span>
                          <span className="shrink-0 text-label font-mono tabular-nums text-ink-faint">
                            {Math.round(entry.amount_g)} g
                            {entryKcal && !entryKcal.is_trace
                              ? ` · ${Math.round((entryKcal.value * entry.amount_g) / 100)} kcal`
                              : ''}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </BootItem>
            )
          })
        ) : (
          <BootItem>
            <p className="py-12 text-center text-body text-ink-dim">Log your first meal</p>
          </BootItem>
        )}
      </div>
    </BootSequence>
  )
}
