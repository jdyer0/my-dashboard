import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { logMeal, parseMealRemote } from '../food/data'
import { prepareMealPhoto, type MealImage } from '../food/photo'
import { mealForTime, type Meal, type NutrientMap } from '../lib/nutrition'
import { litres } from '../lib/hydration'
import { BUTTON, CARD, FoodPush } from './FoodParts'

const MEALS: { key: Meal; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
]

/**
 * One estimated food, exactly as the coach returned it. There is deliberately
 * no amount field: the grams are the model's estimate and they are what gets
 * logged. Correcting a portion means adding detail and asking again — a photo
 * beats typing a number you would also be guessing at. A logged entry is still
 * editable afterwards from the diary.
 */
interface ReviewRow {
  name: string
  amountG: number
  nutrients: NutrientMap
  /** Fluid this item contributes, ml. Null when it isn't a drink. */
  waterMl: number | null
}

function rowKcal(row: ReviewRow): number | null {
  const kcal = row.nutrients.energy_kcal
  return kcal && !kcal.is_trace ? Math.round(kcal.value) : null
}

/** Maps a tagged failure to copy. The underlying status and server detail go
    to the console (§8 keeps exception strings out of the interface). */
function parseFailure(err: unknown): string {
  const name = err instanceof Error ? err.name : ''
  const message = err instanceof Error ? err.message : ''
  if (name === 'AbortError' || /abort/i.test(message)) return 'That took too long. Try again.'
  if (name === 'RateLimited') return 'Too many requests just now. Wait a minute and try again.'
  return "Couldn't estimate that meal. Try again."
}

export function FoodChat() {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<MealImage | null>(null)
  const [readingPhoto, setReadingPhoto] = useState(false)
  const [meal, setMeal] = useState<Meal>(() => mealForTime(new Date()))
  const [rows, setRows] = useState<ReviewRow[] | null>(null)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // Revoking on change as well as unmount keeps a replaced photo from leaking
  // its blob for the life of the tab.
  useEffect(() => {
    if (!photo) return
    return () => URL.revokeObjectURL(photo.previewUrl)
  }, [photo])

  const describable = text.trim().length > 0 || photo !== null

  async function pickPhoto(file: File | undefined) {
    if (!file) return
    setReadingPhoto(true)
    setFailed(null)
    try {
      setPhoto(await prepareMealPhoto(file))
    } catch {
      setFailed("Couldn't read that photo. Try another.")
    } finally {
      setReadingPhoto(false)
      // Clearing the input lets the same file be picked again after a removal.
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function dropPhoto() {
    setPhoto(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  async function analyse() {
    if (!describable || parsing) return
    setParsing(true)
    setFailed(null)
    setRows(null)
    try {
      const items = await parseMealRemote(text.trim(), photo)
      if (items.length === 0) {
        setFailed("Couldn't find any food in that. Describe the meal again.")
        return
      }
      setRows(
        items.map((item) => ({
          name: item.name,
          amountG: item.amount_g,
          nutrients: item.nutrients,
          waterMl: item.water_ml,
        })),
      )
    } catch (err) {
      setFailed(parseFailure(err))
    } finally {
      setParsing(false)
    }
  }

  function removeRow(index: number) {
    setRows((current) => (current ? current.filter((_, i) => i !== index) : current))
  }

  const items = rows ?? []
  const totalKcal = items.reduce((sum, row) => sum + (rowKcal(row) ?? 0), 0)
  const totalWaterMl = items.reduce((sum, row) => sum + (row.waterMl ?? 0), 0)

  async function log() {
    if (items.length === 0 || saving) return
    setSaving(true)
    setFailed(null)
    try {
      await logMeal(items, meal)
      navigate('/food')
    } catch {
      setSaving(false)
      setFailed("Couldn't log the meal. Try again.")
    }
  }

  return (
    <FoodPush title="Describe a meal" subtitle="A photo sharpens the portions">
      <section className={CARD}>
        <label htmlFor="meal-text" className="text-label text-ink-faint">
          What did you eat?
        </label>
        <textarea
          id="meal-text"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Grilled chicken breast, a serving of rice and a handful of broccoli"
          className="mt-1.5 w-full resize-none rounded-ctl border border-line bg-surface px-3 py-2.5 text-body text-ink placeholder:text-ink-faint focus:border-line-bright"
        />

        {/* No capture attribute: iOS then offers the library as well as the
            camera, which matters for logging a meal after the fact. */}
        <input
          ref={fileInput}
          id="meal-photo"
          type="file"
          accept="image/*"
          onChange={(e) => void pickPhoto(e.target.files?.[0])}
          className="sr-only"
        />
        <div className="mt-2 flex items-center gap-2">
          {photo && (
            <img
              src={photo.previewUrl}
              alt="The meal you photographed"
              className="h-11 w-11 shrink-0 rounded-ctl border border-line object-cover"
            />
          )}
          <label
            htmlFor="meal-photo"
            className="flex h-11 flex-1 cursor-pointer items-center justify-center rounded-ctl border border-line bg-surface text-body text-ink-dim transition-transform duration-150 ease-instrument active:scale-[0.98]"
          >
            {readingPhoto ? 'Reading photo' : photo ? 'Change photo' : 'Add a photo'}
          </label>
          {photo && (
            <button
              type="button"
              onClick={dropPhoto}
              aria-label="Remove the photo"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ctl text-body text-ink-faint transition-transform duration-150 ease-instrument active:scale-[0.98]"
            >
              ✕
            </button>
          )}
        </div>

        {/* Picked before the breakdown, so reviewing it is a single tap. */}
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

        <button
          type="button"
          onClick={() => void analyse()}
          disabled={parsing || readingPhoto || !describable}
          className={`mt-3 ${BUTTON}`}
        >
          {parsing ? 'Working it out' : rows ? 'Break it down again' : 'Break it down'}
        </button>
      </section>

      {failed && <p className="mt-2 text-body text-alert">{failed}</p>}

      {/* Holds the space the results will fill so the page doesn't jump. Static
          by design — §4 allows one perpetual animation and the sync dot has it. */}
      {parsing && (
        <section className={`mt-2.5 ${CARD}`} aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="border-b border-line py-2.5 last:border-b-0">
              <div className="h-3 w-2/5 rounded-ctl bg-line" />
              <div className="mt-2 h-3 w-1/4 rounded-ctl bg-line" />
            </div>
          ))}
        </section>
      )}

      {rows && (
        <>
          <section className={`mt-2.5 ${CARD}`}>
            <ul>
              {rows.map((row, index) => (
                <li
                  key={`${row.name}-${index}`}
                  className="flex items-center justify-between gap-2 border-b border-line py-2.5 last:border-b-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-ink-dim">{row.name}</span>
                    <span className="text-label font-mono tabular-nums text-ink-faint">
                      {row.amountG} g
                      {rowKcal(row) !== null && ` · ${rowKcal(row)} kcal`}
                      {row.waterMl !== null && row.waterMl > 0 && ` · ${litres(row.waterMl)} L`}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    aria-label={`Remove ${row.name}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center text-body text-ink-faint transition-transform duration-150 ease-instrument active:scale-[0.98]"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-label text-ink-faint">
              Portions look off? Add a photo or more detail, then break it down again.
            </p>
          </section>

          <section className={`mt-2.5 ${CARD}`}>
            <button
              type="button"
              onClick={() => void log()}
              disabled={saving || items.length === 0}
              className={BUTTON}
            >
              Log {items.length} {items.length === 1 ? 'item' : 'items'}
              {totalKcal > 0 ? ` · ${totalKcal} kcal` : ''}
            </button>
            {totalWaterMl > 0 && (
              <p className="mt-2 text-label text-ink-faint">
                {litres(totalWaterMl)} L of this also counts toward today's water.
              </p>
            )}
          </section>
        </>
      )}
    </FoodPush>
  )
}
