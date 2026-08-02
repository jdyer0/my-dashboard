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
| 2     | Nutrition — adaptive coach, food logging, micros, hydration | Rebuilt 2026-08-01, not yet deployed |
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

The bottom tab bar stays at **four tabs**. Modules with more than one view use a segmented
sub-nav under the screen title, as Food does (Diary / Trends / Micros / Water).

### Desktop (added 2026-08-02)

The phone is still the design target, but the app is also opened in a browser, where a
phone-width column left most of the canvas empty. Past Tailwind's `lg` (1024px):

- The four tabs stand up into a **14rem left rail** — same four links, same component, CSS
  only. Nothing re-mounts on resize.
- `PAGE` (`shell/PageHeader.tsx`) drops its width clamp, so screens take the full canvas.
  Below `lg` the classes are byte-identical to what they were, so the phone is untouched.
- Card stacks split into two columns via `SPLIT` / `COL`. Cards keep their own `mt-*`
  rhythm inside a column; the first card of the second column needs `lg:mt-0`.
- Forms and segmented controls stay **capped** (`lg:max-w-*`). Filling the width applies to
  data, not to a date field — a sex toggle a metre wide reads as a layout someone forgot.

**Every pushed screen carries a back control**, rendered by `PageHeader` above the title.
It is an explicit `to`, never `navigate(-1)`: this is a home-screen PWA, so a deep link or
a cold start can leave no history to go back through.

**Settings commit on Save, not on keystroke or slider drag.** Typed edits and dragged
sliders are held in local draft state with a dirty flag; the button reads "Save …" while
dirty and "… saved" when not. Writing per keystroke sent a request per digit and made a
half-typed rep range look like a stored setting.

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
line charts, horizontal bars and one progress ring — four components, a few hundred lines
total. A charting library costs 50–200KB gzipped to render a polyline, and none of them
will match the design system without a fight.

Rules: `0.5px` gridlines in `line`, axis labels 11px mono in `ink-faint`, the series stroke
1.5px, no fills under lines, no dots except the final data point, no legends, no tooltips
on mobile (tap a point to select it instead).

The **ring** (`motion/Ring.tsx`, added 2026-08-01) is the one exception to "bars and lines
only". Calories-remaining is the single number the diary exists to show, and a ring reads
it at arm's length in a way a bar does not. It draws itself by `stroke-dashoffset` like the
sparklines, so it belongs to the boot cascade rather than sitting outside it. One ring per
screen, maximum — a screen of rings is a dashboard from 2014. Past 100% the ring holds full
and marks twelve o'clock; it never wraps a second lap.

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

Food logging is **chat-only** (decided 2026-07-19, replacing the earlier CoFID/FDC food
table). The user describes a meal in plain English and/or photographs it; the `meal-parse`
Edge Function (Gemini free tier, `gemini-flash-latest` — never pin a dated Gemini model)
splits it into items and estimates each portion's macro- and micronutrients directly. There
is no foods reference table, no CoFID ETL and no FDC lookup — the model's estimate is the
record.

- Each `food_log` row is self-contained: a name plus **absolute** nutrient amounts for the
  portion eaten, stored as `{nutrient_key: {value, is_trace}}` jsonb. Never per-100g.
- Editing an entry's grams rescales its stored nutrients proportionally — there is no
  source to re-derive them from. This is the **diary entry editor only**. The review list
  after a breakdown shows the estimated grams as read-only text (changed 2026-08-02):
  typing a gram figure you are also guessing at is slower than saying "a big bowl" and
  worth less than a photo. Correcting a portion means describing it again.
- **A photo is the portion input.** `meal-parse` accepts an optional inline image
  (`{data, mime_type}`, base64, JPEG/PNG/WebP). The client downscales to a 1024px edge and
  re-encodes as JPEG before sending — an untouched iPhone photo is ~4 MB for no gain, since
  Gemini tiles at 768px. Either text or an image is a complete request.
- **Thinking stays off**, and **the way you turn it off moves**. It is on by default and
  costs seconds of reasoning tokens before the first byte, on a task that is recall against
  a fixed schema. But the knob was renamed between model generations — 2.5 took
  `thinkingConfig.thinkingBudget` in tokens, 3.x takes `thinkingConfig.thinkingLevel` as a
  word — and `gemini-flash-latest` deliberately tracks whichever generation Google ships.
  Sending the wrong one returns a bare 400 `INVALID_ARGUMENT` naming no field (happened
  2026-08-02). `meal-parse` tries the shapes in order per request and falls back to letting
  the model think. Do not collapse this to one hard-coded field, and do not memoise the
  winner in module scope — that makes behaviour depend on which warm isolate served you,
  which is untraceable when it breaks.
- **The model spirals on unbounded decimals.** Every nutrient is an OpenAPI `NUMBER` with no
  precision bound, and asked for a trace amount the model would start long-dividing —
  `0.0054131578947368421…` — until the token ceiling cut the JSON in half, surfacing as a
  two-minute hang and "couldn't estimate that meal" (2026-08-02). Three things hold it, and
  all three matter: the prompt asks for 2 decimal places, `meal-parse` **rounds
  server-side** regardless of what came back, and `maxOutputTokens` is sized so that even a
  full runaway plus one retry finishes inside Supabase's **150s wall clock** — past that the
  worker is killed with `WORKER_RESOURCE_LIMIT`, which no error handler can dress up.
  Raising the ceiling to "leave headroom" makes failures slower, not rarer.
- **Fill in every nutrient.** Telling the model to omit trace amounts rather than write long
  decimals worked, and gutted the Micros screen — a fry-up came back with zinc and nothing
  else. Round instead of omitting. Absent means genuinely unknown, and 0 means the food
  really contains none.
- **Free-tier request quotas are per model, daily, and small.** `gemini-flash-latest`
  resolved to `gemini-3.6-flash` with a cap of **20 requests per day** (2026-08-02) — an
  afternoon of use exhausts it, and it resets at midnight Pacific, not on a rolling window.
  `meal-parse` therefore tries `MODELS` in quality order and falls back to
  `gemini-flash-lite-latest` on a 429, which has its own separate allowance. Both are
  aliases; never swap either for a dated id. A successful response carries which model
  answered, so degraded estimates are traceable to the fallback rather than looking like the
  coach getting worse.
- A nutrient the model omits is unknown: absent from the jsonb, rendered as "no data" —
  never a zero bar. The null-vs-zero distinction is still load-bearing.
- The Gemini key lives only in Edge Function secrets, sent in a header, never in the client.
  The image goes in the request body — never in a URL.

Micronutrient targets are **UK Reference Nutrient Intakes (RNI)**, not US RDAs. They differ
meaningfully on iron, folate and vitamin D. The `rni_targets` table is keyed by sex and age
band, and `nutrient_defs` names the tracked nutrient keys — the meal-parse schema mirrors it.

Drinks in a meal description also carry `water_ml`, which feeds the hydration log. Alcohol
is excluded; milk and juice count their water content, not their volume.

### The adaptive coach (Phase 2, added 2026-08-01)

Calorie and macro targets are **measured, not calculated from a formula**. The engine lives
in `lib/adaptive.ts`, is pure, and is unit-tested — no Harris-Benedict, no activity
multiplier, no height-and-age guess.

- **Trend weight** is a gap-aware EWMA (α 0.15/day, ~4-day half-life) over daily weigh-ins.
  The compounding across gaps is load-bearing: a weigh-in after a fortnight away must count
  as new information, not as yesterday's. The trend is always computed over full history and
  clipped afterwards — windowing first leaves the smoother cold-started and reads a
  systematically shallow slope.
- **Expenditure** is energy balance: `mean intake − (trend slope kg/day × 7,700)`. Only days
  with a food log count toward mean intake; an unlogged day is unknown, never a zero-calorie
  day. Reported with a standard error combining slope scatter and intake variance. Returns
  **null** rather than a shaky number below 10 logged days, 4 weigh-ins, or a 10-day span.
- **Targets** come from expenditure plus the goal rate's energy cost, floored at 1,200 kcal
  and at 65% of expenditure. Protein is pinned to trend bodyweight and defended first, fat
  takes its share of energy above an essential floor of 0.5 g/kg, carbohydrate absorbs the
  remainder.
- **Check-ins are proposed, never applied.** The coach computes fresh targets each Monday and
  offers them on the diary; the user accepts with one tap. Targets that changed on their own
  between opening the app and logging lunch would be worse than stale ones. Accepted
  check-ins are rows in `nutrition_programs`, keyed on the effective Monday so accepting
  twice is idempotent.
- Manual mode remains: the user sets the four numbers and the coach only observes.

### Hydration (Phase 2)

Displayed in **litres**, stored as **integer millilitres** — the same minor-unit rule money
follows, so a day of 250 ml glasses totals exactly 2.000 L. Default target 2,500 ml,
editable, with a suggestion of ~35 ml per kg of trend weight.

Water is the one place the null-vs-zero distinction does **not** apply: an unlogged glass and
an undrunk one are the same thing, so a day with no entries is a real zero. Streaks forgive
an incomplete today — a day still in progress hasn't failed yet.

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
