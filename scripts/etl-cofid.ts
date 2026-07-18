/**
 * One-off ETL: seeds the foods table from the CoFID 2021 workbook.
 *
 * Never shipped to the client, never imported by client code. Run locally:
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/etl-cofid.ts [path-to-xlsx] [--dry-run]
 *
 * The workbook (4.4 MB, not committed — data/ is gitignored) comes from:
 * https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid
 * Download the "McCance and Widdowson's Composition of Foods Integrated
 * Dataset 2021" Excel file to data/cofid-2021.xlsx.
 *
 * Load-bearing rules (CLAUDE.md §7):
 *   N  (unknown) -> the nutrient key is absent from per_100g. NOT zero.
 *   Tr (trace)   -> value 0 with is_trace: true.
 *   Values are per 100g (per 100ml for alcoholic drinks — CoFID's convention).
 *   CoFID food codes are kept as source_ref for traceability.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

interface NutrientValue {
  value: number
  is_trace?: boolean
}
type Per100g = Record<string, NutrientValue>

// CoFID's row-1 column codes are stable identifiers; header labels are not.
// sheet -> code -> our nutrient key. Salt and fibre are derived below.
const SHEET_CODES: Record<string, Record<string, string>> = {
  '1.3 Proximates': {
    KCALS: 'energy_kcal',
    PROT: 'protein',
    CHO: 'carbohydrate',
    TOTSUG: 'sugars',
    FAT: 'fat',
    SATFOD: 'saturates', // per 100g food, not per 100g fatty acids
    AOACFIB: 'fibre',
    ENGFIB: 'fibre_nsp', // fallback when AOAC fibre is unknown
  },
  '1.4 Inorganics': {
    NA: 'sodium_mg', // converted to salt below
    K: 'potassium',
    CA: 'calcium',
    MG: 'magnesium',
    FE: 'iron',
    ZN: 'zinc',
    SE: 'selenium',
    I: 'iodine',
  },
  '1.5 Vitamins': {
    RETEQU: 'vitamin_a', // retinol equivalents, µg
    VITD: 'vitamin_d',
    VITB12: 'vitamin_b12',
    FOLT: 'folate',
    VITC: 'vitamin_c',
  },
}

function parseCell(raw: unknown): NutrientValue | null {
  if (raw === null || raw === undefined) return null
  const text = String(raw).trim()
  if (text === '' || text === 'N') return null
  if (text === 'Tr') return { value: 0, is_trace: true }
  const n = Number(text)
  if (!Number.isFinite(n)) return null // footnote markers etc. are unknowns
  return { value: n }
}

interface SheetTable {
  codeToCol: Map<string, number>
  rowsByFoodCode: Map<string, unknown[]>
  names: Map<string, string>
}

function readSheet(wb: XLSX.WorkBook, sheetName: string): SheetTable {
  const sheet = wb.Sheets[sheetName]
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`)
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false })
  const codes = rows[1] ?? []
  const codeToCol = new Map<string, number>()
  codes.forEach((code, col) => {
    if (typeof code === 'string' && code.trim()) codeToCol.set(code.trim(), col)
  })
  const rowsByFoodCode = new Map<string, unknown[]>()
  const names = new Map<string, string>()
  for (let r = 3; r < rows.length; r++) {
    const row = rows[r]
    if (!row) continue
    const code = typeof row[0] === 'string' ? row[0].trim() : ''
    if (!code) continue
    rowsByFoodCode.set(code, row)
    if (typeof row[1] === 'string') names.set(code, row[1].trim())
  }
  return { codeToCol, rowsByFoodCode, names }
}

function buildFoods(workbookPath: string) {
  const wb = XLSX.read(readFileSync(workbookPath))
  const sheets = Object.keys(SHEET_CODES).map((name) => ({
    name,
    mapping: SHEET_CODES[name],
    table: readSheet(wb, name),
  }))

  const proximates = sheets[0].table
  const foods: { name: string; source: string; source_ref: string; per_100g: Per100g }[] = []
  let traceValues = 0
  let unknownValues = 0

  for (const [foodCode, foodName] of proximates.names) {
    const raw: Record<string, NutrientValue | null> = {}
    for (const { mapping, table } of sheets) {
      const row = table.rowsByFoodCode.get(foodCode)
      if (!row) continue
      for (const [code, key] of Object.entries(mapping)) {
        const col = table.codeToCol.get(code)
        if (col === undefined) throw new Error(`Column code ${code} missing`)
        raw[key] = parseCell(row[col])
      }
    }

    const per: Per100g = {}
    for (const [key, value] of Object.entries(raw)) {
      if (key === 'sodium_mg' || key === 'fibre_nsp') continue
      if (value) per[key] = value
    }
    // AOAC fibre preferred; NSP fills in where AOAC is unknown.
    if (!per.fibre && raw.fibre_nsp) per.fibre = raw.fibre_nsp
    // Salt g = sodium mg × 2.5 / 1000. A trace of sodium is a trace of salt.
    if (raw.sodium_mg) {
      per.salt = raw.sodium_mg.is_trace
        ? { value: 0, is_trace: true }
        : { value: Math.round(raw.sodium_mg.value * 2.5) / 1000 }
    }

    for (const v of Object.values(per)) if (v.is_trace) traceValues++
    unknownValues += 21 - Object.keys(per).length

    foods.push({ name: foodName, source: 'cofid', source_ref: foodCode, per_100g: per })
  }

  return { foods, traceValues, unknownValues }
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const workbookPath = args.find((a) => !a.startsWith('--')) ?? 'data/cofid-2021.xlsx'

  const { foods, traceValues, unknownValues } = buildFoods(workbookPath)
  console.log(`Parsed ${foods.length} foods from ${workbookPath}`)
  console.log(`  trace values: ${traceValues}, unknown (omitted) values: ${unknownValues}`)

  if (dryRun) {
    console.log('Dry run — nothing written.')
    return
  }

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.')
  }
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  const chunkSize = 500
  let written = 0
  for (let i = 0; i < foods.length; i += chunkSize) {
    const chunk = foods.slice(i, i + chunkSize)
    const { error } = await supabase
      .from('foods')
      .upsert(chunk, { onConflict: 'source,source_ref' })
    if (error) throw new Error(`Upsert failed at chunk ${i / chunkSize}: ${error.message}`)
    written += chunk.length
    console.log(`  upserted ${written}/${foods.length}`)
  }
  console.log(`Done. ${written} foods seeded.`)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
