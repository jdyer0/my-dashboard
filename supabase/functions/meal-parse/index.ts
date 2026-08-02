// meal-parse — turns a free-text meal description into logged-ready food items
// using Gemini's free tier, so the key never reaches the client and nothing
// is billed. The model splits the meal into foods and estimates each portion's
// macro- and micronutrients directly; there is no foods table to match
// against, so its estimate is the record.
//
// POST { text?: string, image?: { data: base64, mime_type } }
//   -> { items: [{ name, amount_g, nutrients, water_ml? }] }
// nutrients holds absolute amounts for the portion, keyed by nutrient_defs.key.
// water_ml is present only for drinks, and feeds the hydration log.
// Either text or an image is enough; a photo is what makes the portion
// estimate worth trusting, since the app no longer lets the user correct
// grams after the fact.
//
// The gateway verifies the caller's JWT. Requires a free key from
// https://aistudio.google.com/apikey :
//   npx supabase secrets set GEMINI_API_KEY=...

// The "-latest" aliases track Google's current models — pinned versions get
// retired for new API keys (2.5-flash 404s: "no longer available to new
// users"), so never swap these for a dated id.
//
// Two of them, in quality order. Free-tier request quotas are counted **per
// model** and reset at midnight Pacific, and the headline flash model's daily
// allowance is small — 20 requests on gemini-3.6-flash, which a single
// afternoon of use can exhaust. Falling back to the lite model costs some
// accuracy on portion and micronutrient estimates, which is a far better
// trade than telling someone their food diary is closed until tomorrow.
const MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest']

function urlFor(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
}

// Ways to tell the model not to think, newest API shape first.
//
// Thinking is on by default and dominates the wait: seconds of reasoning
// tokens before the first byte, on a task that is recall against a fixed
// schema. But the knob was renamed between model generations — 2.5 took a
// token budget, 3.x takes a word — and the alias above deliberately tracks
// whatever Google ships now (§7: never pin a dated model), so the model under
// us changes generation without warning. Sending the wrong one is a bare 400
// INVALID_ARGUMENT that names no field, which reads as "the app is broken".
//
// So: try each shape in turn and fall back to letting the model think. This is
// deliberately per-request rather than memoised — a module-level "which shape
// won" makes the function behave differently depending on which warm isolate
// serves you, which is untraceable when something breaks.
const THINKING_CONFIGS: (Record<string, unknown> | null)[] = [
  { thinkingLevel: 'minimal' }, // Gemini 3.x
  { thinkingBudget: 0 }, // Gemini 2.5
  null, // unknown generation — accept the latency
]

// Sized against the worst legitimate meal — a full English broken into a dozen
// component foods with all 20 nutrients each runs to roughly 6k tokens — and
// deliberately not larger. A runaway (see MAX_GENERATIONS) always burns the
// whole ceiling before it is cut off, so this doubles as the bound on how long
// a failure can take: two attempts at 8k must still finish inside Supabase's
// 150s wall clock. At 32k a single spiral took 115s on its own. Thinking
// tokens, when the model insists on them, are charged against this too.
const MAX_OUTPUT_TOKENS = 8192

// A NUMBER field with no precision bound occasionally sends the model into a
// long-division spiral: asked for a trace nutrient it starts writing
// 0.0054131578947368421052631578947… and does not stop until the token ceiling
// cuts the JSON in half. The prompt asks for 2 decimal places, which fixes the
// cause; this catches the times it ignores that. The spiral is stochastic, so
// a second go almost always lands.
const MAX_GENERATIONS = 2

// Supabase kills the worker at 150s wall clock, and the kill is not an error we
// can dress up — the caller gets WORKER_RESOURCE_LIMIT and the app shows its
// generic failure. A big meal legitimately takes a minute, so only retry when
// there is room for a second one. A clear failure beats being killed mid-flight.
const RETRY_DEADLINE_MS = 45_000

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Formats Gemini accepts inline. The client re-encodes every photo as JPEG
// before sending, so the other two are only here for a share-sheet paste.
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// Base64 characters, so roughly 4.5 MB of image. The client downscales to
// ~1024px, which lands under 300 KB — anything near this cap did not come
// through the camera button.
const MAX_IMAGE_CHARS = 6_000_000

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// Mirrors the nutrient_defs seed (migration 0003). Macros are required —
// the model can always estimate them; micros it may omit when it genuinely
// has no idea, which the app renders as "no data", never zero.
const NUTRIENTS: { key: string; label: string; unit: string; required: boolean }[] = [
  { key: 'energy_kcal', label: 'energy', unit: 'kcal', required: true },
  { key: 'protein', label: 'protein', unit: 'g', required: true },
  { key: 'carbohydrate', label: 'carbohydrate', unit: 'g', required: true },
  { key: 'sugars', label: 'sugars', unit: 'g', required: false },
  { key: 'fat', label: 'fat', unit: 'g', required: true },
  { key: 'saturates', label: 'saturated fat', unit: 'g', required: false },
  { key: 'fibre', label: 'fibre (AOAC)', unit: 'g', required: false },
  { key: 'salt', label: 'salt', unit: 'g', required: false },
  { key: 'iron', label: 'iron', unit: 'mg', required: false },
  { key: 'calcium', label: 'calcium', unit: 'mg', required: false },
  { key: 'magnesium', label: 'magnesium', unit: 'mg', required: false },
  { key: 'zinc', label: 'zinc', unit: 'mg', required: false },
  { key: 'potassium', label: 'potassium', unit: 'mg', required: false },
  { key: 'selenium', label: 'selenium', unit: 'µg', required: false },
  { key: 'iodine', label: 'iodine', unit: 'µg', required: false },
  { key: 'vitamin_a', label: 'vitamin A (retinol equivalents)', unit: 'µg', required: false },
  { key: 'vitamin_d', label: 'vitamin D', unit: 'µg', required: false },
  { key: 'vitamin_b12', label: 'vitamin B12', unit: 'µg', required: false },
  { key: 'folate', label: 'folate', unit: 'µg', required: false },
  { key: 'vitamin_c', label: 'vitamin C', unit: 'mg', required: false },
]

// OpenAPI-subset schema, Gemini's structured-output format.
const MEAL_SCHEMA = {
  type: 'OBJECT',
  required: ['items'],
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: ['name', 'amount_g', 'nutrients'],
        properties: {
          name: {
            type: 'STRING',
            description: 'The food as the user described it, e.g. "a handful of broccoli"',
          },
          amount_g: {
            type: 'INTEGER',
            description: 'Estimated weight eaten in grams, cooked weight unless stated raw',
          },
          water_ml: {
            type: 'INTEGER',
            description:
              'Fluid this portion contributes to hydration, in ml. Only for drinks — omit for solid food',
          },
          nutrients: {
            type: 'OBJECT',
            required: NUTRIENTS.filter((n) => n.required).map((n) => n.key),
            properties: Object.fromEntries(
              NUTRIENTS.map((n) => [
                n.key,
                {
                  type: 'NUMBER',
                  description: `Total ${n.label} in ${n.unit} for the whole portion eaten, rounded to 2 decimal places`,
                },
              ]),
            ),
          },
        },
      },
    },
  },
}

const SYSTEM = `You are the nutrition estimator for a single-user UK food diary.

The user describes what they ate in plain English. Break it into separate foods, estimate the weight in grams of each as eaten (cooked weight unless stated otherwise), then estimate the nutrients in each portion. Composite dishes the user names as one thing ("a full English breakfast", "chicken stir fry") should be broken into their typical component foods.

Nutrient values are absolute amounts for the whole portion eaten — never per 100 g. Use the units given in the schema exactly: macros in grams, energy in kcal, minerals and vitamin C in mg, trace nutrients and vitamins A/D/B12 and folate in µg. Salt is salt in grams, not sodium. Vitamin A is retinol equivalents.

Round every number to at most 2 decimal places. Never write more than 4 significant figures and never a recurring decimal — 0.01 is a fine answer for a trace amount, 0.005413157894736842 is not. If an amount is smaller than 0.01, write 0.01. Energy and amount_g are whole numbers.

Base estimates on standard UK food composition (McCance & Widdowson). Fill in every nutrient in the schema for every food. Leave one out only when you genuinely have no basis for estimating it — never merely because the amount is small or fiddly. A savoury or processed food always has salt; any plant food has fibre; meat, fish and pulses carry iron and zinc; dairy carries calcium and iodine. Report 0 only when the food really contains none of that nutrient.

Portion estimates when no amount is stated, typical UK portions: a chicken breast 150 g, a serving of cooked rice or pasta 180 g, a slice of bread 40 g, a medium potato 180 g, a handful of nuts 30 g, a tablespoon of oil 11 g, a splash of milk 30 g, a glass of milk 200 g. Drinks: a glass of water 250 ml, a mug of tea or coffee 250 ml, a pint 568 ml, a can 330 ml, a standard bottle 500 ml.

The user cannot correct your gram estimates afterwards — your figure is what gets logged. Commit to the most realistic amount rather than hedging toward a small default.

When a photo is attached, read the portions from the picture and let it override vague wording in the text. Judge size against whatever is in frame: a dinner plate is about 27 cm across, a side plate 20 cm, a fork 19 cm, a teaspoon 14 cm, a standard mug holds 250 ml, a pint glass 568 ml, a 330 ml can is 12 cm tall. Account for depth — a heaped bowl holds far more than a flat plate of the same width. Name what you can actually see, e.g. "about half a plate of chips". Do not invent foods that are out of frame or hidden under others. Where the photo and the text disagree, trust the photo for how much and the text for what it is and how it was cooked.

Set water_ml only for drinks, as the fluid the drink contributes to hydration — the whole volume for water, tea, coffee, squash and soft drinks; roughly the water content for milk and juice (about 87% and 88%). Omit water_ml entirely for solid food and for alcoholic drinks, which do not count toward hydration.

If neither the text nor the photo shows any food, return an empty items array. Never invent foods that are not mentioned or visible.`

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] }
    /** STOP when it finished; MAX_TOKENS when the answer was cut off. */
    finishReason?: string
  }[]
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    /** Non-zero here means thinking is still on despite the config. */
    thoughtsTokenCount?: number
    totalTokenCount?: number
  }
}

/** One call to Gemini, kept so a failure can explain itself. */
interface Attempt {
  model: string
  shape: string
  status: number
  detail?: string
}

type GenerateResult =
  | { ok: true; data: GeminiResponse; shape: string; model: string }
  | { ok: false; status: number; attempts: Attempt[] }

interface ParsedMeal {
  items: {
    name: string
    amount_g: number
    nutrients: Record<string, number>
    water_ml?: number
  }[]
}

/**
 * Rounds what the model sent. It is asked for 2 decimal places and mostly
 * complies, but it does arithmetic internally and sometimes hands back the raw
 * float — `zinc: 1.1400122070312513` for a sausage. Prompting alone will not
 * hold that, and 16 decimal places of a trace mineral is false precision in a
 * record we can never re-derive. Also drops the `water_ml: 0` some solid foods
 * come back with, so "not a drink" stays absent rather than becoming a zero.
 */
function tidy(items: ParsedMeal['items']): ParsedMeal['items'] {
  return items.map((item) => {
    const nutrients: Record<string, number> = {}
    for (const [key, value] of Object.entries(item.nutrients ?? {})) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue
      // Energy is whole kcal; everything else keeps two places.
      nutrients[key] = key === 'energy_kcal' ? Math.round(value) : Math.round(value * 100) / 100
    }
    const waterMl =
      typeof item.water_ml === 'number' && Number.isFinite(item.water_ml) && item.water_ml > 0
        ? Math.round(item.water_ml)
        : null
    return {
      name: item.name,
      amount_g: Number.isFinite(item.amount_g) ? Math.max(1, Math.round(item.amount_g)) : 0,
      nutrients,
      ...(waterMl === null ? {} : { water_ml: waterMl }),
    }
  })
}

/**
 * Calls Gemini, stepping through THINKING_CONFIGS when a shape is rejected.
 * Only a 400 is worth re-asking differently — a rate limit or an outage would
 * fail identically three times over. Every attempt is recorded so a failure
 * arrives with its own explanation rather than needing a redeploy to diagnose.
 */
async function generate(key: string, parts: Record<string, unknown>[]): Promise<GenerateResult> {
  const attempts: Attempt[] = []

  for (const model of MODELS) {
    for (const thinking of THINKING_CONFIGS) {
      const shape = thinking ? JSON.stringify(thinking) : 'none'
      // Key goes in a header, not the query string — query params land in logs.
      const res = await fetch(urlFor(model), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: 'user', parts }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: MEAL_SCHEMA,
            // Not lower: near-greedy decoding is what lets a digit sequence
            // lock into a repeating loop it cannot leave.
            temperature: 0.4,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            ...(thinking ? { thinkingConfig: thinking } : {}),
          },
        }),
      })

      if (res.ok) {
        return { ok: true, data: (await res.json()) as GeminiResponse, shape, model }
      }

      // Long enough to keep a quota failure's useful part: Google names the
      // exact limit and the model it applies to, and a bare "rate limited"
      // cannot tell a one-minute wait from a one-day one.
      const detail = (await res.text()).slice(0, 900)
      attempts.push({ model, shape, status: res.status, detail })
      console.warn(`meal-parse: ${model} ${shape} rejected with ${res.status}`)

      // 400 means this thinking shape is wrong for this model — try the next
      // shape. 429 means the model's daily quota is gone and no amount of
      // rephrasing helps — move to the next model. Anything else is the API
      // being unwell, where retrying is just noise.
      if (res.status === 400) continue
      if (res.status === 429) break
      return { ok: false, status: res.status, attempts }
    }
  }

  return { ok: false, status: attempts[attempts.length - 1]?.status ?? 502, attempts }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  let body: { text?: unknown; image?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (text.length > 2000) return json({ error: 'text too long' }, 400)

  let image: { data: string; mimeType: string } | null = null
  if (body.image !== undefined && body.image !== null) {
    const raw = body.image as { data?: unknown; mime_type?: unknown }
    const data = typeof raw.data === 'string' ? raw.data : ''
    const mimeType = typeof raw.mime_type === 'string' ? raw.mime_type : ''
    if (!data || !mimeType) return json({ error: 'image needs data and mime_type' }, 400)
    if (!IMAGE_TYPES.includes(mimeType)) return json({ error: 'unsupported image type' }, 400)
    if (data.length > MAX_IMAGE_CHARS) return json({ error: 'image too large' }, 413)
    image = { data, mimeType }
  }

  // A photo on its own is a complete request — most of the time the picture
  // says more about the portion than the sentence would.
  if (!text && !image) return json({ error: 'text or image is required' }, 400)

  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) return json({ error: 'GEMINI_API_KEY is not set' }, 500)

  // Image first: Gemini grounds the text against the picture better in this
  // order than the reverse.
  const parts: Record<string, unknown>[] = []
  if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } })
  parts.push({ text: text || 'Log everything in this photo.' })

  let failure: Record<string, unknown> = { error: 'Empty model response' }
  const startedAt = Date.now()

  for (let attempt = 0; attempt < MAX_GENERATIONS; attempt++) {
    const result = await generate(key, parts)
    if (!result.ok) {
      // Pass Google's own quota text through. Which limit was hit decides
      // whether the answer is "wait a minute" or "wait until tomorrow", and
      // the app cannot tell those apart from a bare 429.
      if (result.status === 429) {
        return json({ error: 'Rate limited', attempts: result.attempts }, 429)
      }
      return json(
        { error: `Gemini request failed (${result.status})`, attempts: result.attempts },
        502,
      )
    }

    const candidate = result.data.candidates?.[0]
    const raw = candidate?.content?.parts?.[0]?.text
    const truncated = candidate?.finishReason === 'MAX_TOKENS'

    if (raw && !truncated) {
      try {
        const parsed = JSON.parse(raw) as ParsedMeal
        if (Array.isArray(parsed.items)) {
          // Which model answered, so a drop in estimate quality is traceable
          // to the fallback rather than looking like the coach getting worse.
          // The client ignores this field.
          return json({ items: tidy(parsed.items.slice(0, 25)), model: result.model })
        }
      } catch {
        // Fall through: a model that returned unparseable JSON having claimed
        // to finish will not do better on a retry.
      }
    }

    // What the request actually did, carried on every failure path. Without
    // finishReason a truncated answer and a refused one are the same crash.
    failure = {
      error: truncated ? 'Model response was cut off' : 'Malformed model response',
      thinking: result.shape,
      finish_reason: candidate?.finishReason ?? null,
      usage: result.data.usageMetadata ?? null,
      // The tail is the tell: JSON that simply stops mid-number ran into the
      // ceiling rather than being mangled.
      tail: raw ? raw.slice(-200) : null,
    }

    if (!truncated) break
    const elapsed = Date.now() - startedAt
    if (elapsed > RETRY_DEADLINE_MS) {
      console.warn(`meal-parse: cut off after ${elapsed}ms, no room to retry`)
      break
    }
    console.warn(`meal-parse: cut off after ${MAX_OUTPUT_TOKENS} tokens, retrying`)
  }

  return json(failure, 502)
})
