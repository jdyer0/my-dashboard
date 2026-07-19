import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar } from '../motion/Bar'
import { BootItem, BootSequence } from '../motion/BootSequence'
import {
  fetchNutrientDefs,
  fetchProfile,
  fetchRecentLog,
  fetchRniTargets,
} from '../food/data'
import {
  ageInYears,
  averageDailyIntake,
  contributors,
  targetFor,
  type NutrientDef,
  type RniTarget,
} from '../lib/nutrition'
import { londonDayKey } from '../lib/londonDay'
import type { FoodLogEntry, Profile } from '../food/types'

interface MicrosData {
  defs: NutrientDef[]
  rni: RniTarget[]
  profile: Profile
  todayEntries: FoodLogEntry[]
}

export function FoodMicros() {
  const [data, setData] = useState<MicrosData | null>(null)
  const [failed, setFailed] = useState(false)
  const [openKey, setOpenKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [defs, rni, profile, log] = await Promise.all([
          fetchNutrientDefs(),
          fetchRniTargets(),
          fetchProfile(),
          fetchRecentLog(1),
        ])
        if (cancelled) return
        const todayKey = londonDayKey(new Date())
        setData({
          defs,
          rni,
          profile,
          todayEntries: log.filter((e) => londonDayKey(new Date(e.logged_at)) === todayKey),
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

  if (failed) {
    return (
      <div className="mx-auto w-full max-w-md md:max-w-2xl">
        <p className="py-8 text-body text-alert">Couldn't load micronutrients. Go back and retry.</p>
      </div>
    )
  }

  if (!data) return null

  if (!data.profile.sex || !data.profile.birth_date) {
    return (
      <div className="mx-auto w-full max-w-md md:max-w-2xl">
        <header className="pb-2 pt-2">
          <h1 className="text-screen-title text-ink">Micronutrients</h1>
        </header>
        <p className="py-8 text-body text-ink-dim">
          Targets need your sex and age.{' '}
          <Link to="/food" className="text-ink underline decoration-line-bright">
            Set them on the food tab
          </Link>
        </p>
      </div>
    )
  }

  const sex = data.profile.sex
  const age = ageInYears(data.profile.birth_date, new Date())
  const micros = data.defs.filter((d) => d.kind === 'micro')
  const loggedFoods = data.todayEntries.map((e) => ({
    name: e.name,
    nutrients: e.nutrients,
  }))

  return (
    <BootSequence>
      <div className="mx-auto w-full max-w-md md:max-w-2xl">
        <BootItem>
          <header className="pb-2 pt-2">
            <h1 className="text-screen-title text-ink">Micronutrients</h1>
            <p className="mt-0.5 text-label text-ink-faint">Today vs UK RNI</p>
          </header>
        </BootItem>

        <BootItem className="rounded-card border border-line bg-surface p-3">
          {loggedFoods.length === 0 ? (
            <p className="py-8 text-center text-body text-ink-dim">Log meals to see today's totals</p>
          ) : (
            <ul className="space-y-3">
              {micros.map((def) => {
                const average = averageDailyIntake(loggedFoods, def.key, 1)
                const target = targetFor(data.rni, def.key, sex, age)
                const pct =
                  average !== null && target !== null && target > 0
                    ? (average / target) * 100
                    : null
                const tone =
                  pct === null ? 'text-ink-faint' : pct >= 90 ? 'text-live' : pct < 50 ? 'text-warn' : 'text-ink'
                const fill =
                  pct === null ? 'bg-ink-dim' : pct >= 90 ? 'bg-live' : pct < 50 ? 'bg-warn' : 'bg-ink-dim'
                const open = openKey === def.key
                const top = open ? contributors(loggedFoods, def.key).slice(0, 5) : []
                return (
                  <li key={def.key}>
                    <button
                      type="button"
                      onClick={() => setOpenKey(open ? null : def.key)}
                      aria-expanded={open}
                      className="block w-full text-left"
                    >
                      <div className="flex items-baseline justify-between">
                        <span className="text-body text-ink-dim">{def.display_name}</span>
                        <span className={`text-label font-mono tabular-nums ${tone}`}>
                          {pct === null ? 'insufficient data' : `${Math.round(pct)}%`}
                        </span>
                      </div>
                      <Bar
                        value={pct ?? 0}
                        max={100}
                        className="mt-1.5"
                        fillClassName={fill}
                      />
                    </button>
                    {open && (
                      <div className="mt-2 border-b border-line pb-2">
                        {top.length === 0 ? (
                          <p className="text-label text-ink-faint">
                            No logged food has data for this
                          </p>
                        ) : (
                          <ul className="space-y-1">
                            {top.map((c) => (
                              <li key={c.name} className="flex items-baseline justify-between">
                                <span className="min-w-0 flex-1 truncate pr-3 text-label text-ink-faint">
                                  {c.name}
                                </span>
                                <span className="shrink-0 text-label font-mono tabular-nums text-ink-dim">
                                  {c.value >= 10 ? Math.round(c.value) : c.value.toFixed(1)}{' '}
                                  {def.unit}
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
          )}
        </BootItem>
      </div>
    </BootSequence>
  )
}
