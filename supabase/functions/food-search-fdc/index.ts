// food-search-fdc — proxies USDA FoodData Central so FDC_API_KEY never
// reaches the client, and copies picked foods into our foods table so they
// are local forever after (search once, own it).
//
// POST { action: 'search', q: string }   -> { results: [{ fdcId, name, brand, kcalPer100g }] }
// POST { action: 'import', fdcId: number } -> { food: <foods row> }
//
// The gateway verifies the caller's JWT; writes use the service role.
// Falls back to FDC's DEMO_KEY (30 req/hour) until FDC_API_KEY is set:
//   npx supabase secrets set FDC_API_KEY=...
import { createClient } from 'npm:@supabase/supabase-js@2'

const FDC_BASE = 'https://api.nal.usda.gov/fdc/v1'

// FDC nutrient ids -> our nutrient_defs keys. Units align with nutrient_defs
// (g / mg / µg / kcal) for every id listed. Sodium becomes salt below.
const NUTRIENT_IDS: Record<number, string> = {
  1008: 'energy_kcal',
  1003: 'protein',
  1005: 'carbohydrate',
  2000: 'sugars',
  1004: 'fat',
  1258: 'saturates',
  1079: 'fibre',
  1093: 'sodium_mg',
  1089: 'iron',
  1087: 'calcium',
  1090: 'magnesium',
  1095: 'zinc',
  1092: 'potassium',
  1103: 'selenium',
  1100: 'iodine',
  1106: 'vitamin_a', // RAE µg
  1114: 'vitamin_d', // D2 + D3 µg
  1178: 'vitamin_b12',
  1177: 'folate', // total µg
  1162: 'vitamin_c',
}

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

interface FdcSearchFood {
  fdcId: number
  description: string
  brandOwner?: string
  foodNutrients?: { nutrientId: number; value: number }[]
}

interface FdcFoodDetail {
  fdcId: number
  description: string
  brandOwner?: string
  servingSize?: number
  servingSizeUnit?: string
  householdServingFullText?: string
  foodNutrients?: { nutrient?: { id: number }; amount?: number }[]
}

function apiKey(): string {
  return Deno.env.get('FDC_API_KEY') ?? 'DEMO_KEY'
}

async function search(q: string): Promise<Response> {
  const url = new URL(`${FDC_BASE}/foods/search`)
  url.searchParams.set('api_key', apiKey())
  url.searchParams.set('query', q)
  url.searchParams.set('pageSize', '15')
  url.searchParams.set('dataType', 'Foundation,SR Legacy,Survey (FNDDS),Branded')
  const res = await fetch(url)
  if (!res.ok) return json({ error: `FDC search failed (${res.status})` }, 502)
  const data = (await res.json()) as { foods?: FdcSearchFood[] }
  const results = (data.foods ?? []).map((f) => ({
    fdcId: f.fdcId,
    name: f.description,
    brand: f.brandOwner ?? null,
    kcalPer100g: f.foodNutrients?.find((n) => n.nutrientId === 1008)?.value ?? null,
  }))
  return json({ results })
}

async function importFood(fdcId: number): Promise<Response> {
  const res = await fetch(`${FDC_BASE}/food/${fdcId}?api_key=${apiKey()}`)
  if (!res.ok) return json({ error: `FDC food fetch failed (${res.status})` }, 502)
  const detail = (await res.json()) as FdcFoodDetail

  // FDC reports amounts per 100g. Unknown nutrients are simply absent —
  // absence stays absence, never zero.
  const per: Record<string, { value: number }> = {}
  for (const entry of detail.foodNutrients ?? []) {
    const key = entry.nutrient?.id !== undefined ? NUTRIENT_IDS[entry.nutrient.id] : undefined
    if (!key || typeof entry.amount !== 'number') continue
    per[key] = { value: entry.amount }
  }
  if (per['sodium_mg']) {
    per['salt'] = { value: Math.round(per['sodium_mg'].value * 2.5) / 1000 }
    delete per['sodium_mg']
  }

  const gramsServing =
    typeof detail.servingSize === 'number' &&
    (detail.servingSizeUnit ?? '').toLowerCase().startsWith('g')
      ? detail.servingSize
      : null

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
  const { data, error } = await supabase
    .from('foods')
    .upsert(
      {
        name: detail.description,
        brand: detail.brandOwner ?? null,
        source: 'fdc',
        source_ref: String(detail.fdcId),
        per_100g: per,
        default_portion_g: gramsServing ?? 100,
        portion_label: detail.householdServingFullText ?? null,
      },
      { onConflict: 'source,source_ref' },
    )
    .select('id, name, brand, source, per_100g, default_portion_g, portion_label')
    .single()
  if (error) return json({ error: error.message }, 500)
  return json({ food: data })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  let body: { action?: string; q?: string; fdcId?: number }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  if (body.action === 'search' && typeof body.q === 'string' && body.q.trim()) {
    return search(body.q.trim())
  }
  if (body.action === 'import' && typeof body.fdcId === 'number') {
    return importFood(body.fdcId)
  }
  return json({ error: 'Unknown action' }, 400)
})
