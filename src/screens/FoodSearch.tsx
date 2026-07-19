import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fdcImport, fdcSearch, recentFoods, searchFoods } from '../food/data'
import type { FdcResult, Food } from '../food/types'

const DEBOUNCE_MS = 150

function kcalOf(food: Food): number | null {
  const kcal = food.per_100g.energy_kcal
  return kcal && !kcal.is_trace ? kcal.value : null
}

function FoodRow({ food, onPick }: { food: Food; onPick: () => void }) {
  const kcal = kcalOf(food)
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex min-h-[44px] w-full items-center justify-between border-b border-line py-2 text-left last:border-b-0"
    >
      <span className="min-w-0 flex-1 truncate pr-3 text-body text-ink">
        {food.name}
        {food.brand && <span className="text-ink-faint"> · {food.brand}</span>}
      </span>
      {kcal !== null && (
        <span className="shrink-0 text-label font-mono tabular-nums text-ink-faint">
          {Math.round(kcal)} kcal/100g
        </span>
      )}
    </button>
  )
}

export function FoodSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [recents, setRecents] = useState<Food[]>([])
  const [results, setResults] = useState<Food[] | null>(null)
  const [fdcResults, setFdcResults] = useState<FdcResult[] | null>(null)
  const [fdcPending, setFdcPending] = useState(false)
  const [importing, setImporting] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchSeq = useRef(0)

  useEffect(() => {
    inputRef.current?.focus()
    recentFoods().then(setRecents, () => undefined)
  }, [])

  // Search-as-you-type: debounced, sequence-guarded so stale responses
  // can't overwrite newer ones.
  useEffect(() => {
    const q = query.trim()
    setFdcResults(null)
    if (!q) {
      setResults(null)
      return
    }
    const seq = ++searchSeq.current
    const timer = window.setTimeout(() => {
      searchFoods(q).then(
        (found) => {
          if (searchSeq.current === seq) setResults(found)
        },
        () => {
          if (searchSeq.current === seq) setFailed("Search failed. Try again.")
        },
      )
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  async function searchMore() {
    const q = query.trim()
    if (!q || fdcPending) return
    setFdcPending(true)
    setFailed(null)
    try {
      setFdcResults(await fdcSearch(q))
    } catch {
      setFailed("Couldn't reach the food database. Try again.")
    } finally {
      setFdcPending(false)
    }
  }

  async function pickFdc(result: FdcResult) {
    if (importing) return
    setImporting(true)
    setFailed(null)
    try {
      const food = await fdcImport(result.fdcId)
      navigate(`/food/portion/${food.id}`, { replace: false })
    } catch {
      setImporting(false)
      setFailed("Couldn't add that food. Try again.")
    }
  }

  const listed = query.trim() ? results : recents

  return (
    <div className="mx-auto w-full max-w-md md:max-w-2xl">
      <header className="pb-2 pt-2">
        <h1 className="text-screen-title text-ink">Log food</h1>
      </header>

      <input
        ref={inputRef}
        type="search"
        inputMode="search"
        placeholder="Search foods"
        aria-label="Search foods"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-11 w-full rounded-ctl border border-line bg-surface px-3 text-body text-ink placeholder:text-ink-faint focus:border-line-bright"
      />

      {failed && <p className="mt-2 text-body text-alert">{failed}</p>}

      {listed && listed.length > 0 && (
        <section className="mt-2.5 rounded-card border border-line bg-surface px-3 py-1">
          {!query.trim() && (
            <h2 className="pt-2 text-label text-ink-faint">Recent</h2>
          )}
          <ul>
            {listed.map((food) => (
              <li key={food.id}>
                <FoodRow food={food} onPick={() => navigate(`/food/portion/${food.id}`)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {query.trim() && results && results.length === 0 && (
        <p className="mt-4 text-center text-body text-ink-dim">Nothing local matches</p>
      )}

      {query.trim() && results && !fdcResults && (
        <button
          type="button"
          onClick={() => void searchMore()}
          disabled={fdcPending}
          className="mt-2.5 h-11 w-full rounded-ctl border border-line bg-surface text-body text-ink-dim transition-transform duration-150 ease-instrument active:scale-[0.98] disabled:text-ink-faint"
        >
          {fdcPending ? 'Searching' : 'Search more foods'}
        </button>
      )}

      {fdcResults && (
        <section className="mt-2.5 rounded-card border border-line bg-surface px-3 py-1">
          <h2 className="pt-2 text-label text-ink-faint">FoodData Central</h2>
          {fdcResults.length === 0 ? (
            <p className="py-3 text-body text-ink-dim">Nothing found</p>
          ) : (
            <ul>
              {fdcResults.map((result) => (
                <li key={result.fdcId}>
                  <button
                    type="button"
                    onClick={() => void pickFdc(result)}
                    disabled={importing}
                    className="flex min-h-[44px] w-full items-center justify-between border-b border-line py-2 text-left last:border-b-0 disabled:opacity-50"
                  >
                    <span className="min-w-0 flex-1 truncate pr-3 text-body text-ink">
                      {result.name}
                      {result.brand && <span className="text-ink-faint"> · {result.brand}</span>}
                    </span>
                    {result.kcalPer100g !== null && (
                      <span className="shrink-0 text-label font-mono tabular-nums text-ink-faint">
                        {Math.round(result.kcalPer100g)} kcal/100g
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Link
        to={`/food/new${query.trim() ? `?name=${encodeURIComponent(query.trim())}` : ''}`}
        className="mt-2.5 flex min-h-[44px] w-full items-center justify-center rounded-ctl border border-line text-body text-ink-dim transition-transform duration-150 ease-instrument active:scale-[0.98]"
      >
        Create custom food
      </Link>
    </div>
  )
}
