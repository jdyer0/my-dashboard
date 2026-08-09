import { useState } from 'react'
import { BootItem, BootSequence } from '../motion/BootSequence'
import { CountUp } from '../motion/CountUp'
import { Ring } from '../motion/Ring'
import { LineChart } from '../motion/LineChart'
import { deleteDrink, logDrink, saveSettings } from '../food/data'
import { useFoodData } from '../food/useFoodData'
import {
  averageDailyMl,
  currentStreak,
  litres,
  mlFromLitres,
  suggestedTargetMl,
} from '../lib/hydration'
import { londonDayKey } from '../lib/londonDay'
import { BUTTON_INLINE, CARD, LoadFailed, StatRow, UnitField } from './FoodParts'

/** The vessels a day actually gets drunk out of. */
const QUICK_ADD = [
  { ml: 250, label: 'Glass', sub: '250 ml' },
  { ml: 500, label: 'Bottle', sub: '500 ml' },
  { ml: 750, label: 'Flask', sub: '750 ml' },
  { ml: 1000, label: 'Litre', sub: '1.0 L' },
]

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Europe/London',
})

export function FoodWater() {
  const { data, failed, reload } = useFoodData()
  const [busy, setBusy] = useState(false)
  const [custom, setCustom] = useState('')
  const [editingTarget, setEditingTarget] = useState(false)
  const [targetInput, setTargetInput] = useState('')
  const [actionFailed, setActionFailed] = useState<string | null>(null)

  if (failed) return <LoadFailed what="your hydration log" onRetry={reload} />
  if (!data) return null

  const { settings, hydrationDays, todayWaterMl, today, coach } = data
  const targetMl = settings.hydration_target_ml
  const remainingMl = targetMl - todayWaterMl
  const met = todayWaterMl >= targetMl

  const last14 = hydrationDays.slice(-14)
  const streak = currentStreak(hydrationDays)
  const average = averageDailyMl(last14)

  const todayDrinks = data.hydration
    .filter((h) => londonDayKey(new Date(h.logged_at)) === today)
    .slice()
    .reverse()

  const customMl = (() => {
    const n = Number(custom.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) return null
    // Typed as litres when small, as millilitres when large — nobody drinks
    // 500 litres and nobody logs 0.5 ml.
    const ml = n < 20 ? mlFromLitres(n) : Math.round(n)
    return ml > 0 && ml <= 5000 ? ml : null
  })()

  async function add(ml: number) {
    if (busy) return
    setBusy(true)
    setActionFailed(null)
    try {
      await logDrink(ml)
      setCustom('')
      reload()
    } catch {
      setActionFailed("Couldn't log that drink. Try again.")
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (busy) return
    setBusy(true)
    setActionFailed(null)
    try {
      await deleteDrink(id)
      reload()
    } catch {
      setActionFailed("Couldn't remove that drink. Try again.")
    } finally {
      setBusy(false)
    }
  }

  async function saveTarget() {
    const n = Number(targetInput.replace(',', '.'))
    const ml = Number.isFinite(n) ? mlFromLitres(n) : NaN
    if (!Number.isFinite(ml) || ml < 500 || ml > 8000 || busy) return
    setBusy(true)
    setActionFailed(null)
    try {
      await saveSettings({ hydration_target_ml: ml })
      setEditingTarget(false)
      reload()
    } catch {
      setActionFailed("Couldn't save the target. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const suggestion =
    coach.trendWeightKg !== null ? suggestedTargetMl(coach.trendWeightKg) : null

  return (
    <BootSequence>
      <BootItem className={CARD}>
        <div className="flex items-center gap-4">
          <Ring
            value={todayWaterMl}
            max={targetMl}
            className={met ? 'text-live' : 'text-ink-dim'}
            overshoot={todayWaterMl > targetMl}
          >
            <span
              className={`text-metric font-mono tabular-nums ${met ? 'glow-live text-live' : 'text-ink'}`}
            >
              <CountUp value={todayWaterMl / 1000} decimals={1} />
            </span>
            <span className="mt-0.5 text-label text-ink-faint">of {litres(targetMl)} L</span>
          </Ring>
          <div className="min-w-0 flex-1">
            <p className="text-body text-ink-dim">
              {met
                ? 'Target met for today.'
                : `${litres(remainingMl)} L to go — about ${Math.ceil(remainingMl / 250)} more ${
                    Math.ceil(remainingMl / 250) === 1 ? 'glass' : 'glasses'
                  }.`}
            </p>
            <div className="mt-2">
              <StatRow label="Streak" hint="days on target">
                <span className={streak > 0 ? 'text-live' : 'text-ink-faint'}>{streak}</span>
              </StatRow>
              <StatRow label="Average" hint="last 14 days">
                {average === null ? '—' : `${litres(average)} L`}
              </StatRow>
            </div>
          </div>
        </div>
      </BootItem>

      <BootItem className={`mt-2.5 ${CARD}`}>
        <h2 className="text-card-title text-ink">Log a drink</h2>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {QUICK_ADD.map(({ ml, label, sub }) => (
            <button
              key={ml}
              type="button"
              onClick={() => void add(ml)}
              disabled={busy}
              className="btn-glow flex min-h-[56px] flex-col items-center justify-center rounded-ctl border border-line bg-surface-raised transition-transform duration-150 ease-instrument active:scale-[0.98] disabled:opacity-50"
            >
              <span className="text-body text-ink">{label}</span>
              <span className="text-label font-mono tabular-nums text-ink-faint">{sub}</span>
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <UnitField
            id="custom-water"
            label="Custom amount in litres"
            unit="L"
            value={custom}
            placeholder="0.4"
            onChange={setCustom}
          />
          <button
            type="button"
            onClick={() => customMl !== null && void add(customMl)}
            disabled={busy || customMl === null}
            className={BUTTON_INLINE}
          >
            Add
          </button>
        </div>
        {actionFailed && <p className="mt-2 text-body text-alert">{actionFailed}</p>}
      </BootItem>

      <BootItem className={`mt-2.5 ${CARD}`}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-card-title text-ink">Last 14 days</h2>
          <button
            type="button"
            onClick={() => {
              setTargetInput(litres(targetMl))
              setEditingTarget((v) => !v)
            }}
            className="text-label text-ink-faint underline decoration-line-bright"
          >
            {editingTarget ? 'Cancel' : 'Edit target'}
          </button>
        </div>

        {editingTarget ? (
          <div className="mt-2">
            {/* Caption, not a second <label> — UnitField already labels the
                field for assistive tech. */}
            <p className="text-label text-ink-faint">Daily target, litres</p>
            <div className="mt-1.5 flex items-center gap-2">
              <UnitField
                id="water-target"
                label="Daily target in litres"
                unit="L"
                value={targetInput}
                onChange={setTargetInput}
              />
              <button
                type="button"
                onClick={() => void saveTarget()}
                disabled={busy}
                className={BUTTON_INLINE}
              >
                Save
              </button>
            </div>
            {suggestion !== null && (
              <button
                type="button"
                onClick={() => setTargetInput(litres(suggestion))}
                className="mt-2 text-label text-ink-faint underline decoration-line-bright"
              >
                Use {litres(suggestion)} L, about 35 ml per kg of your trend weight
              </button>
            )}
          </div>
        ) : (
          <>
            <LineChart
              className="mt-2"
              height={80}
              series={[
                {
                  points: last14.map((d) => d.totalMl / 1000),
                  className: 'text-ink-dim',
                  endpoint: true,
                },
              ]}
              reference={targetMl / 1000}
              referenceLabel="dashed: target"
            />
            <div className="mt-2 flex gap-1">
              {last14.map((d) => (
                <div
                  key={d.day}
                  title={`${d.day}: ${litres(d.totalMl)} L`}
                  className={`h-1.5 flex-1 rounded-full ${
                    d.onTarget ? 'bg-live shadow-glow-sm' : d.totalMl > 0 ? 'bg-ink-faint' : 'bg-line'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </BootItem>

      <BootItem className={`mt-2.5 ${CARD}`}>
        <h2 className="text-card-title text-ink">Today</h2>
        {todayDrinks.length === 0 ? (
          <p className="py-8 text-center text-body text-ink-dim">Log your first glass</p>
        ) : (
          <ul className="mt-1">
            {todayDrinks.map((drink) => (
              <li
                key={drink.id}
                className="flex min-h-[44px] items-center justify-between border-b border-line last:border-b-0"
              >
                <span className="text-body font-mono tabular-nums text-ink-dim">
                  {litres(drink.volume_ml)} L
                  <span className="ml-2 text-label text-ink-faint">
                    {timeFormat.format(new Date(drink.logged_at))}
                    {drink.source === 'meal' && ' · from a meal'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void remove(drink.id)}
                  disabled={busy}
                  aria-label={`Remove ${litres(drink.volume_ml)} litre drink`}
                  className="flex h-11 w-11 items-center justify-center text-body text-ink-faint transition-transform duration-150 ease-instrument active:scale-[0.98]"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </BootItem>
    </BootSequence>
  )
}
