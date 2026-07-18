# Phase 2 — nutrition

Paste this into Claude Code once Phase 1 is working on your phone and you've logged at
least one real workout.

---

Read `CLAUDE.md` first. Phases 0 and 1 are done. Build Phase 2 — nutrition — and nothing
else.

The goal: I log what I ate and drank manually, and the app shows me macros and
micronutrients against UK targets — including the deficiencies I'd otherwise never notice.

The same speed rule as the gym applies: logging a meal happens standing in the kitchen. If
finding and adding a food takes more than ~10 seconds, I'll stop logging within a fortnight
and the module dies. Search speed and sensible defaults matter more than any chart.

## Data sources — read CLAUDE.md §7 before writing any of this

**CoFID is primary.** Download McCance & Widdowson's CoFID dataset (published by PHE/FSA as
an Excel workbook) and write a one-off ETL script (`scripts/etl-cofid.ts`, run with tsx,
never shipped to the client) that seeds it into Postgres.

The ETL rules are load-bearing:
- `N` (unknown) becomes `null`. NOT zero. A null renders as "no data" in the UI, never as
  an empty bar. If you coerce N to 0, the app will confidently report deficiencies that
  don't exist, which is worse than useless.
- `Tr` (trace) becomes `0` with `is_trace = true` on the value.
- Values are per 100g. Store them per 100g; scale at query time.
- Keep CoFID's food codes as `source_ref` so data can be traced back.

**USDA FoodData Central is the fallback** — for foods not in CoFID, and to backfill
micronutrients CoFID lacks (vitamin D in many entries, omega-3s, folate detail). It needs a
free API key: `FDC_API_KEY`, used only inside an Edge Function (`food-search-fdc`) that
proxies the search — the key never ships to the client. When I pick an FDC food, copy its
nutrient profile into our `foods` table so it's local forever after (search once, own it).

## Schema

Migration `0003_nutrition.sql`. RLS everywhere as usual — except `foods` and
`nutrient_defs` and `rni_targets`, which are shared reference data: readable by any
authenticated user, writable only via the ETL/Edge Function (service role).

**`nutrient_defs`** — the nutrient dictionary
`id`, `key` (e.g. `protein`, `vitamin_d`, `iron`), `display_name`, `unit` (`g|mg|µg|kcal`),
`kind` (check: `macro|micro`), `sort_order`.
Seed: energy, protein, carbohydrate, of which sugars, fat, of which saturates, fibre, salt —
then iron, calcium, magnesium, zinc, potassium, selenium, iodine, vitamin A, vitamin D,
vitamin B12, folate, vitamin C. That set covers what CoFID + FDC can actually populate.
Don't add nutrients neither source provides.

**`foods`**
`id`, `name`, `brand` nullable, `source` (check: `cofid|fdc|custom`), `source_ref`,
`per_100g` jsonb — `{nutrient_key: {value, is_trace}}` with nulls simply absent from the
object, `default_portion_g`, `portion_label` (e.g. "1 slice", "1 medium"), `created_by`
nullable (set for custom foods only), `search_text` tsvector generated column.
GIN index on `search_text`, plus a trigram index on `name` for fuzzy matching
(`pg_trgm` extension).

**`food_log`**
`id`, `user_id`, `food_id`, `logged_at` timestamptz, `meal` (check:
`breakfast|lunch|dinner|snack`), `amount_g` numeric, `created_at`.

**`rni_targets`** — UK Reference Nutrient Intakes, NOT US RDAs
`id`, `nutrient_key`, `sex` (check: `male|female`), `age_min`, `age_max`, `value`, `unit`.
Seed from the UK government dietary recommendations (SACN/COMA). The user's target is
looked up from `profiles.sex` and `profiles.birth_date`. If either is missing, the
nutrition screens show a one-time prompt to fill in the profile rather than guessing.

Energy and macro targets are different from RNIs: default kcal to the UK guideline
(2500 male / 2000 female) but make it user-overridable in a `nutrition_settings` row
(`user_id`, `kcal_target`, `protein_g_target` nullable — protein default 0.75g/kg if
weight is known from health data, else the RNI).

## Screens

**Food tab (index)** — today, at a glance:
- Kcal consumed vs target as the primary metric (`<CountUp>`), `live` when within ±10%,
  `warn` outside
- The four macros as `<Bar>`s with grams and % of target
- The meal list for today, grouped breakfast/lunch/dinner/snack, each entry showing name,
  portion, kcal. Tap to edit amount or delete.
- One primary button: "Log food"

**Log food flow** — the critical path, optimise it ruthlessly:
1. Search field, autofocused. Local Postgres search-as-you-type against CoFID (target
   under ~150ms perceived). Recents and frequents shown before any typing — most people eat
   the same 20 foods.
2. If local results are thin, a "Search more foods" row triggers the FDC Edge Function.
3. Pick a food → portion screen: `amount_g` prefilled with the default portion, quick-tap
   chips for ×0.5 / ×1 / ×1.5 / ×2, meal defaulting by time of day (before 11am breakfast,
   11–3 lunch, 3–9 dinner, else snack). One tap on "Log" if the defaults are right.
4. "Create custom food" from the search screen for anything unfindable: name, portion, and
   whatever macro fields I know. Micros left blank are null, not zero.

**Micronutrients screen** — the payoff:
- Each micro as a row: name, 7-day average intake vs RNI as a `<Bar>`, percentage in mono.
  `live` at ≥90%, `warn` below 50%, `ink` between.
- 7-day average, not today. Micros fluctuate wildly day to day; a daily view would be
  permanently alarming and meaningless. Label it "7-day average" explicitly.
- Foods with null for a nutrient are excluded from that nutrient's average, and if more
  than half of logged foods lack data for a nutrient, show "insufficient data" instead of
  a number. Never present a number built mostly from missing values.
- Tapping a nutrient shows which logged foods contributed most to it — genuinely useful for
  "what do I eat to fix this".

**Overview tile** — replace a placeholder tile: kcal today vs target, plus the single
worst micro from the 7-day view if any is under 50% ("Vitamin D 31%", `warn`).

## Aggregation logic

Pure functions in `src/lib/nutrition.ts`, unit-tested:
- Scale per-100g to amount, preserving null vs zero vs trace
- Daily totals per nutrient with the null-exclusion rule
- 7-day averages with the insufficient-data rule
- Target lookup from sex + age band

Days follow the Europe/London rule from CLAUDE.md §6 — a meal logged at 00:30 belongs to
the new day.

## Constraints

- The ETL script runs locally with the service role key from env — it is never bundled,
  never deployed, never imported by client code.
- `pg_trgm` needs enabling in the migration: `create extension if not exists pg_trgm;`
- No barcode scanning, no photo recognition, no AI food estimation, no water tracking,
  no fasting timers. If one seems essential, ask.
- No new client dependencies. Search debouncing is ten lines, not a library.
- Don't deploy. Don't touch finance or goals.

## When you're done

Show me the migration and the ETL script, tell me the exact command to run the ETL and
roughly how many foods it seeded, confirm tests pass, update the status table in
`CLAUDE.md`, and stop.
