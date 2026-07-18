# Personal life dashboard — project spec

This file is the source of truth. Read it before every task. If a request conflicts with
this file, say so rather than silently deviating.

---

## 1. What this is

A single-user life dashboard PWA. Not a product, not multi-tenant, no onboarding flow, no
marketing pages, no team features. One person uses it, on an iPhone, from the home screen.

Four modules, built in this order:

| Phase | Module                                                      | Status |
| ----- | ----------------------------------------------------------- | ------ |
| 0     | Scaffold, design system, auth, shell                        | Built 2026-07-17, deployed 2026-07-18 |
| 1     | Gym — exercises, sessions, sets, e1RM, PRs                  | Built 2026-07-18, not yet deployed |
| 2     | Nutrition — food logging, macros + micronutrients vs UK RNI | Built 2026-07-18, not yet deployed |
| 3     | Finances — bank sync, transactions, balances                | —      |
| 4     | Goals — habits/streaks + long-term milestones               | —      |

Update the status column as phases land. Do not build ahead of the current phase. Do not
scaffold "for later" — no placeholder routes, no stub tables, no commented-out imports for
modules that don't exist yet.

---

## 2. Hard constraints

These are not preferences. Violating any of them breaks the app or costs real money.

**Never put secrets in the client.** The Enable Banking RSA private key, the Supabase
service role key, and the health webhook token must never appear in any file under `src/`,
in any `VITE_*` env var, or in the built bundle. Anything prefixed `VITE_` is public — treat
it as if it were printed on the homepage. Server-side secrets live only in Supabase Edge
Function secrets.

**Netlify is a static host and nothing else.** No Netlify Functions, no scheduled functions,
no edge functions. The free plan is credit-metered (300/month, hard cap, no auto-recharge)
and each production deploy costs 15 credits — roughly 20 deploys a month before the site
stops serving. Free-tier function timeout is 10s, which a bank sync would blow through
anyway. All server work goes to Supabase Edge Functions.

**Don't deploy to check your work.** Verify with `npm run dev` locally. Deploys are a
scarce resource. Never run a deploy command unless explicitly asked.

**No localStorage for anything that matters.** Supabase is the source of truth. Local
storage is for UI preferences only (last-selected tab, etc.). iOS evicts web storage from
inactive sites.

**Single user, but still enforce RLS.** Every table gets `user_id uuid not null references
auth.users(id)` and a row-level security policy of `user_id = auth.uid()`. No exceptions,
no "it's just me so I'll skip it."

---

## 3. Stack

- **React 18 + Vite + TypeScript** (strict mode on)
- **Tailwind CSS** — tokens defined in config, not arbitrary values scattered in JSX
- **Supabase** — Postgres, Auth, Edge Functions, Cron
- **Netlify** — static hosting only
- **PWA** — `vite-plugin-pwa`, add-to-home-screen, offline shell

No component library. No Redux/Zustand/Jotai unless a phase genuinely needs it — React
state and context are sufficient for a four-tab app. No date library heavier than
`date-fns`. Charts are hand-rolled SVG, not Recharts — see §5.

---

## 4. Design system

The look is "Jarvis, stripped of theatre." Dark canvas, monospaced numerals, hairline
geometry, one accent used only for live or on-target data. The restraint is the point — the theatrical
version reads as costume.

### Colour

Define these in `tailwind.config.js`. Never use a hex outside this list.

| Token            | Hex       | Use                                         |
| ---------------- | --------- | ------------------------------------------- |
| `canvas`         | `#0B0F10` | Page background                             |
| `surface`        | `#111819` | Cards, tiles                                |
| `surface-raised` | `#161F21` | Modals, sheets, pressed states              |
| `line`           | `#1E2A2C` | All borders, dividers, chart gridlines      |
| `line-bright`    | `#2A3A3D` | Hover borders, focused inputs               |
| `ink`            | `#E6EDEE` | Primary text, primary numerals              |
| `ink-dim`        | `#8A9A9D` | Secondary text                              |
| `ink-faint`      | `#5C6B6E` | Labels, captions, axis text                 |
| `live`           | `#2DD4BF` | Accent. On-target values, active state, PRs |
| `warn`           | `#E8A33D` | Below-target values                         |
| `alert`          | `#F87171` | Errors, destructive actions only            |

The accent is rationed. `live` appears where a number is on-target, live, or a personal
record — nowhere else. It is not a brand colour and must never be used decoratively, as a
card background, or on more than a few elements per screen. If a screen looks teal, it's
wrong.

There is no light mode. The app is dark in both system modes.

### Typography

- **IBM Plex Sans** — all UI text, labels, headings
- **IBM Plex Mono** — every numeral the user reads as data, without exception

The mono/sans split is the core device: it makes numbers read as instrumentation rather
than as prose. A step count, a weight, a percentage, a timestamp, a currency amount — mono.
A card title, a button, a body sentence — sans.

Always set `font-variant-numeric: tabular-nums` on mono numerals so counting animations and
live values don't cause horizontal jitter.

Self-host both via `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono`. Do not
link Google Fonts — it costs a render-blocking round trip on mobile.

Scale, and nothing between these:

| Role             | Size / weight           |
| ---------------- | ----------------------- |
| Screen title     | 22px / 500              |
| Card title       | 13px / 400, `ink`       |
| Primary metric   | 28px / 500 mono, `ink`  |
| Secondary metric | 17px / 400 mono, `ink`  |
| Label            | 11px / 400, `ink-faint` |
| Body             | 14px / 400, `ink-dim`   |

Two weights only: 400 and 500. Never 600 or 700 — heavy weights kill the instrument feel.
Sentence case everywhere. Never Title Case, never ALL CAPS.

### Geometry

- Borders: `0.5px solid line`. Never 1px, never 2px.
- Radius: `10px` on cards and tiles, `8px` on controls, `28px` on the app shell only.
- Card padding: `12px`. Tile padding: `10px 8px`.
- Grid gap: `8px` between tiles, `10px` between cards.
- No shadows. Ever. Elevation is communicated by `surface-raised`, not by blur.

### Motion — the signature

This is the one place to spend effort. Everything else is quiet so this can land.

**The boot sequence.** On dashboard mount, the interface comes online rather than appearing:

1. Cards cascade in — `translateY(8px) → 0`, `opacity 0 → 1`, 320ms, 60ms stagger
2. Numbers count up from zero over 600ms, ease-out, settling on the true value
3. Sparklines draw themselves left-to-right via `stroke-dashoffset`, 700ms, starting as
   their card lands
4. Progress bars sweep out via `transform: scaleX()` with `transform-origin: left`, 500ms,
   40ms stagger

The whole sequence completes in under 1.2s and never blocks interaction — the user can tap
through it. It runs **on mount only**, guarded by a ref. It must not re-run on every state
change, re-render, or tab switch. A dashboard that re-animates every time you touch it is
nauseating.

**Everything after boot is still.** Micro-interactions only:

- Hover/press: 150ms, `scale(0.98)` on press
- Route change: 200ms crossfade, no slide
- The sync dot: 2s opacity pulse loop, the only perpetual animation in the app
- Value changes after boot: 300ms tween, no re-run of the count-up

**Easing:** `cubic-bezier(0.16, 1, 0.3, 1)` for everything. Define it once as
`ease-instrument` in the Tailwind config. It decelerates hard — things arrive with weight
and settle, which is what sells "mechanical" over "bouncy."

**Animate `transform` and `opacity` only.** Never `width`, `height`, `top`, `left`, or
`margin` — they force layout on every frame and stutter on a phone.

**Respect `prefers-reduced-motion: reduce`:** durations drop to ~0ms, numbers render at
their final value immediately, sparklines render fully drawn. The content is never removed
or hidden — only the motion goes.

### Copy

Sentence case. Active voice, verb first. No filler.

- Buttons name the action: "Log set", not "Submit"
- Errors say what happened and what to do: "Sync failed. Reconnect your bank." Never
  "Error:", never an exception string, never an apology
- Empty states invite: "Log your first workout", not "No workouts yet"
- Never "successfully", never "please", never an exclamation mark

---

## 5. Charts

Hand-rolled inline SVG. No Recharts, no Chart.js, no D3. The app needs sparklines, simple
line charts, and horizontal bars — three components, maybe 150 lines total. A charting
library costs 50–200KB gzipped to render a polyline, and none of them will match the
design system without a fight.

Rules: `0.5px` gridlines in `line`, axis labels 11px mono in `ink-faint`, the series stroke
1.5px, no fills under lines, no dots except the final data point, no legends, no tooltips
on mobile (tap a point to select it instead).

---

## 6. Data conventions

- **Time**: store `timestamptz`, always UTC. Render in Europe/London. Never store a naive
  date for anything with a clock time.
- **Days**: a "day" for streaks and daily totals is the user's local calendar day, not a
  UTC day. Compute the boundary in Europe/London or the streak breaks at midnight BST.
- **Weight**: store kilograms as `numeric(6,2)`. Never float.
- **Money**: store minor units as `integer` (pence). Never float, never `numeric` with
  rounding at the edges.
- **Nutrients**: store per-100g values as `numeric`. `null` means unknown — it is not zero.
  This distinction is load-bearing (see §7).
- **Enums**: Postgres `text` with a `check` constraint, not native enums. Native enums are
  painful to alter.

### Migrations

Every schema change is a numbered SQL file in `supabase/migrations/`. Never edit the
database through the dashboard UI. Never edit a migration that has already been applied —
write a new one.

---

## 7. Integration notes

Written up front because each has a non-obvious failure mode that will cost hours.

### Health data (Phase 1+)

There is no web API for HealthKit and there never will be. Data arrives via the iOS
Shortcuts app: a "Find Health Samples" action reads the data, a shortcut POSTs JSON to a
Supabase Edge Function, and a Personal Automation fires it nightly.

- The endpoint authenticates with a bearer token in the header, checked against a Supabase
  secret. Not a query param — those land in logs.
- **Writes must be idempotent.** Upsert on `(user_id, metric, recorded_for_date)`. The
  shortcut will re-send overlapping windows and may run twice.
- iOS cannot read health data while the phone is locked, so syncs will silently miss some
  nights. The shortcut sends a trailing 7-day window, not just yesterday, so a missed night
  self-heals on the next run. Design for this rather than treating it as an error.

### Enable Banking (Phase 3)

Free "restricted production" — activated by whitelisting your own accounts, no contract or
KYB required. Gotchas:

- Auth is a JWT signed with an RSA private key. Max TTL 24h; generate per request. **Edge
  Function only** — the key never touches the client.
- **Grab all history on the very first sync** using `strategy=longest`. Full history is
  typically available only for about an hour after initial authorisation; after that most
  banks clamp to a 90-day rolling window. Miss it and it's gone until you re-authorise.
- Enable Banking stores nothing. Our Postgres is the only durable copy.
- Paginate on `continuation_key` until it comes back null. An empty transaction list plus a
  non-null key means _keep going_ — it does not mean done.
- Dedupe on `entry_reference`. It's unique per account, not globally — key on
  `(account_id, entry_reference)`. Exclude pending (`PDNG`) transactions from matching.
- Match accounts across sessions on `identification_hash`, never on the account id — ids are
  session-scoped and change on every re-auth.
- Consent expires at 180 days for most banks. Handle `EXPIRED_SESSION` (arrives as a 401)
  by surfacing a reconnect prompt. Warn in-app 14 days before expiry.
- Background fetches (no PSU headers) are capped around 4/day per bank. On
  `ASPSP_RATE_LIMIT_EXCEEDED`, back off 6 hours. Send PSU headers only when the user
  actually triggered the sync.

### Nutrition data (Phase 2)

Two sources:

- **CoFID** (McCance & Widdowson's, UK government) — ~3,300 UK foods and drinks, seeded into
  Postgres via a one-off ETL. Primary source: UK-accurate, instant local search, no rate
  limit.
- **USDA FoodData Central** — free API key, richer micronutrient coverage. Fallback for
  anything not in CoFID, and backfill for CoFID's gaps.

**The CoFID ETL is the trap.** The dataset marks unknown values as `N` and traces as `Tr`.
Coercing those to `0` makes the app confidently report deficiencies that don't exist. `N`
must become `null` and render as "no data" — not as a zero bar. `Tr` becomes `0` with a
trace flag. CoFID also lacks omega-3/6, folates, amino acids and vitamin D for many entries;
FDC backfills those.

Targets are **UK Reference Nutrient Intakes (RNI)**, not US RDAs. They differ meaningfully
on iron, folate and vitamin D. Seed an `rni_targets` table keyed by sex and age band.

---

## 8. Working style

- **Ask before inventing.** If this spec doesn't cover something that changes the schema or
  a dependency, ask rather than picking.
- **Small commits**, one concern each, conventional commit messages.
- **No new dependencies** without saying what it costs in KB and why hand-rolling is worse.
- **Types are not optional.** No `any`, no `@ts-ignore`. If a type is genuinely unknowable,
  `unknown` plus a narrowing guard.
- **Don't write tests for Phase 0.** From Phase 1, unit-test the pure logic only — e1RM
  maths, streak boundaries, nutrient aggregation, transaction dedupe. Do not test React
  rendering.
- **Touch-first.** Tap targets 44px minimum. Nothing depends on hover. Forms are usable
  one-thumbed.
- **Accessibility floor**: visible keyboard focus, real labels on inputs, `aria-label` on
  icon-only buttons, reduced motion respected. Never announce this in the UI — just do it.
