import { useState } from 'react'
import { BootItem, BootSequence } from '../motion/BootSequence'
import { Bar } from '../motion/Bar'
import { useFoodData } from '../food/useFoodData'
import {
  averageDailyIntake,
  contributors,
  nutrientTotal,
  targetFor,
  type NutrientDef,
  type NutrientMap,
  type RniTarget,
} from '../lib/nutrition'
import { londonDayKey } from '../lib/londonDay'
import { CARD, LoadFailed, ProfilePrompt } from './FoodParts'

const WINDOWS = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7-day avg' },
  { days: 30, label: '30-day avg' },
] as const

/** Vitamins and minerals read as two lists, not one alphabet. */
const VITAMIN_KEYS = new Set([
  'vitamin_a',
  'vitamin_c',
  'vitamin_d',
  'vitamin_b12',
  'folate',
])

function formatAmount(value: number, unit: string): string {
  const rounded = value >= 100 ? Math.round(value) : value >= 10 ? Number(value.toFixed(1)) : Number(value.toFixed(2))
  return `${rounded.toLocaleString('en-GB')} ${unit}`
}

export function FoodMicros() {
  const { data, failed, reload } = useFoodData()
  const [windowDays, setWindowDays] = useState<number>(1)
  const [openKey, setOpenKey] = useState<string | null>(null)

  if (failed) return <LoadFailed what="micronutrients" onRetry={reload} />
  if (!data) return null

  if (!data.coach.targets) {
    return <ProfilePrompt onSaved={reload} />
  }

  const { sex, ageYears } = data.coach.targets
  const windowKeys = new Set(data.dayKeys.slice(-windowDays))
  const foods = data.log
    .filter((e) => windowKeys.has(londonDayKey(new Date(e.logged_at))))
    .map((e) => ({ name: e.name, nutrients: e.nutrients }))

  const micros = data.defs.filter((d) => d.kind === 'micro')
  const vitamins = micros.filter((d) => VITAMIN_KEYS.has(d.key))
  const minerals = micros.filter((d) => !VITAMIN_KEYS.has(d.key))

  // How complete the picture is: nutrients the coach had no estimate for are
  // absent, not zero (§7), and saying so up front stops a short bar reading as
  // a deficiency when it's really a gap in the data.
  const withData = micros.filter((d) => nutrientTotal(foods, d.key).known > 0).length

  return (
    <BootSequence>
      <BootItem>
        <div className="grid grid-cols-3 gap-2">
          {WINDOWS.map(({ days, label }) => (
            <button
              key={days}
              type="button"
              onClick={() => setWindowDays(days)}
              className={`h-11 rounded-ctl border text-label transition-transform duration-150 ease-instrument active:scale-[0.98] ${
                windowDays === days
                  ? 'border-line-bright bg-surface-raised text-ink'
                  : 'border-line bg-surface text-ink-dim'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </BootItem>

      {foods.length === 0 ? (
        <BootItem>
          <p className="py-12 text-center text-body text-ink-dim">
            Log meals to see how you're covered
          </p>
        </BootItem>
      ) : (
        <>
          <BootItem className={`mt-2.5 ${CARD}`}>
            <p className="text-body text-ink-dim">
              Against UK reference nutrient intakes for a {sex === 'male' ? 'man' : 'woman'} of{' '}
              {ageYears}.
            </p>
            <p className="mt-1 text-label text-ink-faint">
              {withData} of {micros.length} tracked nutrients have an estimate over this window.
              Anything without one is left blank rather than counted as zero.
            </p>
          </BootItem>

          <MicroList
            title="Vitamins"
            defs={vitamins}
            foods={foods}
            rni={data.rni}
            sex={sex}
            ageYears={ageYears}
            windowDays={windowDays}
            openKey={openKey}
            onToggle={setOpenKey}
          />
          <MicroList
            title="Minerals"
            defs={minerals}
            foods={foods}
            rni={data.rni}
            sex={sex}
            ageYears={ageYears}
            windowDays={windowDays}
            openKey={openKey}
            onToggle={setOpenKey}
          />
        </>
      )}
    </BootSequence>
  )
}

interface MicroListProps {
  title: string
  defs: NutrientDef[]
  foods: { name: string; nutrients: NutrientMap }[]
  rni: RniTarget[]
  sex: 'male' | 'female'
  ageYears: number
  windowDays: number
  openKey: string | null
  onToggle: (key: string | null) => void
}

/** Kept out of the screen body so a window change re-renders the rows instead
    of remounting them — a remount would restart every bar's sweep. */
function MicroList({
  title,
  defs,
  foods,
  rni,
  sex,
  ageYears,
  windowDays,
  openKey,
  onToggle,
}: MicroListProps) {
  return (
    <BootItem className={`mt-2.5 ${CARD}`}>
      <h2 className="text-card-title text-ink">{title}</h2>
      <ul className="mt-2 space-y-3">
        {defs.map((def) => {
          const average = averageDailyIntake(foods, def.key, windowDays)
          const target = targetFor(rni, def.key, sex, ageYears)
          const pct =
            average !== null && target !== null && target > 0 ? (average / target) * 100 : null
          const tone =
            pct === null
              ? 'text-ink-faint'
              : pct >= 90
                ? 'text-live'
                : pct < 50
                  ? 'text-warn'
                  : 'text-ink-dim'
          const fill =
            pct === null
              ? 'bg-line'
              : pct >= 90
                ? 'bg-live shadow-glow-sm'
                : pct < 50
                  ? 'bg-warn'
                  : 'bg-ink-dim'
          const open = openKey === def.key
          const top = open ? contributors(foods, def.key).slice(0, 5) : []

          return (
            <li key={def.key}>
              <button
                type="button"
                onClick={() => onToggle(open ? null : def.key)}
                aria-expanded={open}
                className="block w-full text-left"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-body text-ink-dim">{def.display_name}</span>
                  <span className="shrink-0 text-label font-mono tabular-nums text-ink-faint">
                    {average === null ? (
                      'no data'
                    ) : (
                      <>
                        {formatAmount(average, def.unit)}
                        {target !== null && ` / ${formatAmount(target, def.unit)}`}
                      </>
                    )}
                    {pct !== null && <span className={`ml-2 ${tone}`}>{Math.round(pct)}%</span>}
                  </span>
                </div>
                <Bar
                  value={pct ?? 0}
                  max={100}
                  className="mt-1.5"
                  fillClassName={fill}
                  shimmer={pct !== null && pct >= 90}
                />
              </button>
              {open && (
                <div className="mt-2 border-b border-line pb-2">
                  {top.length === 0 ? (
                    <p className="text-label text-ink-faint">
                      Nothing logged has an estimate for this
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {top.map((c) => (
                        <li key={c.name} className="flex items-baseline justify-between">
                          <span className="min-w-0 flex-1 truncate pr-3 text-label text-ink-faint">
                            {c.name}
                          </span>
                          <span className="shrink-0 text-label font-mono tabular-nums text-ink-dim">
                            {formatAmount(c.value / windowDays, def.unit)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </BootItem>
  )
}
