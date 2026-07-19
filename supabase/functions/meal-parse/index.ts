// meal-parse — turns a free-text meal description into structured food items
// using Gemini's free tier, so the key never reaches the client and nothing
// is billed. The client matches each item against the local foods table and
// logs through the normal food_log path; if this function is unreachable the
// client falls back to its rule-based parser.
//
// POST { text: string } -> { items: [{ name, search_term, amount_g }] }
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

// OpenAPI-subset schema, Gemini's structured-output format.
const MEAL_SCHEMA = {
  type: 'OBJECT',
  required: ['items'],
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        required: ['name', 'search_term', 'amount_g'],
        properties: {
          name: {
            type: 'STRING',
            description: 'The food as the user described it, e.g. "a handful of broccoli"',
          },
          search_term: {
            type: 'STRING',
            description:
              'Short generic UK food name for database search, e.g. "chicken breast grilled"',
          },
          amount_g: {
            type: 'INTEGER',
            description: 'Estimated weight eaten in grams, cooked weight unless stated raw',
          },
        },
      },
    },
  },
}

const SYSTEM = `You parse meal descriptions into individual food items for a UK nutrition tracker.

The user describes what they ate in plain English. Break it into separate foods and estimate the weight in grams of each, as eaten (cooked weight unless stated otherwise). Composite dishes the user names as one thing ("a full English breakfast", "chicken stir fry") should be broken into their typical component foods.

For search_term, give a short generic UK food name likely to match the McCance & Widdowson (CoFID) database — e.g. "chicken breast grilled", "rice white boiled", "broccoli boiled". No brands unless the user names one. Use UK terms (courgette not zucchini, porridge not oatmeal).

Portion estimates when no amount is stated, typical UK portions: a chicken breast 150 g, a serving of cooked rice or pasta 180 g, a slice of bread 40 g, a medium potato 180 g, a handful of nuts 30 g, a tablespoon of oil 11 g, a splash of milk 30 g, a glass of milk 200 g.

If the text names no food, return an empty items array. Never invent foods that are not mentioned.`

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

interface ParsedMeal {
  items: { name: string; search_term: string; amount_g: number }[]
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
        maxOutputTokens: 2048,
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
