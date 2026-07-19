// meal-parse — turns a free-text meal description into logged-ready food items
// using Gemini's free tier, so the key never reaches the client and nothing
// is billed. The model splits the meal into foods and estimates each portion's
// macro- and micronutrients directly; there is no foods table to match
// against, so its estimate is the record.
//
// POST { text: string } -> { items: [{ name, amount_g, nutrients }] }
// nutrients holds absolute amounts for the portion, keyed by nutrient_defs.key.
//
// The gateway verifies the caller's JWT. Requires a free key from
// https://aistudio.google.com/apikey :
//   npx supabase secrets set GEMINI_API_KEY=...

// The "-latest" alias tracks Google's current flash model — pinned versions
// get retired for new API keys (2.5-flash 404s: "no longer available to new
// users").
const MODEL = 'gemini-flash-latest'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
          nutrients: {
            type: 'OBJECT',
            required: NUTRIENTS.filter((n) => n.required).map((n) => n.key),
            properties: Object.fromEntries(
              NUTRIENTS.map((n) => [
                n.key,
                {
                  type: 'NUMBER',
                  description: `Total ${n.label} in ${n.unit} for the whole portion eaten`,
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

Base estimates on standard UK food composition (McCance & Widdowson). Prefer a plausible estimate over leaving a nutrient out; omit a micronutrient only when you genuinely cannot estimate it. Never report a nutrient as 0 unless the food really contains none.

Portion estimates when no amount is stated, typical UK portions: a chicken breast 150 g, a serving of cooked rice or pasta 180 g, a slice of bread 40 g, a medium potato 180 g, a handful of nuts 30 g, a tablespoon of oil 11 g, a splash of milk 30 g, a glass of milk 200 g.

If the text names no food, return an empty items array. Never invent foods that are not mentioned.`

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

interface ParsedMeal {
  items: { name: string; amount_g: number; nutrients: Record<string, number> }[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  let body: { text?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return json({ error: 'text is required' }, 400)
  if (text.length > 2000) return json({ error: 'text too long' }, 400)

  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) return json({ error: 'GEMINI_API_KEY is not set' }, 500)

  // Key goes in a header, not the query string — query params land in logs.
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: MEAL_SCHEMA,
        temperature: 0.2,
        maxOutputTokens: 8192,
      },
    }),
  })

  if (res.status === 429) return json({ error: 'Rate limited' }, 429)
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500)
    return json({ error: `Gemini request failed (${res.status})`, detail }, 502)
  }

  const data = (await res.json()) as GeminiResponse
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!raw) return json({ error: 'Empty model response' }, 502)

  try {
    const parsed = JSON.parse(raw) as ParsedMeal
    if (!Array.isArray(parsed.items)) return json({ error: 'Malformed model response' }, 502)
    return json({ items: parsed.items.slice(0, 25) })
  } catch {
    return json({ error: 'Malformed model response' }, 502)
  }
})
