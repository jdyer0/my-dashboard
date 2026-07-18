# Phase 1 — gym

Paste this into Claude Code once Phase 0 is merged and you've signed in successfully.

---

Read `CLAUDE.md` first. Phase 0 is done. Build Phase 1 — the gym module — and nothing else.

The goal: I can log a workout one-thumbed while sitting on a bench between sets, and over
time the app shows me whether I'm actually getting stronger.

That framing drives every decision here. Logging happens mid-workout, tired, one hand, in a
loud room. If logging a set takes more than two taps, the module has failed and I'll go back
to the notes app.

## Schema

Migration `0002_gym.sql`. RLS on every table, `user_id = auth.uid()`.

**`exercises`** — the library
`id`, `user_id`, `name`, `category` (check: `push|pull|legs|core|cardio`), `primary_muscle`,
`equipment` (check: `barbell|dumbbell|machine|cable|bodyweight|other`), `is_custom`,
`created_at`. Unique on `(user_id, lower(name))`.

Seed ~40 common compound and accessory lifts on first run. I want to log a bench press
without adding it myself. Seed them as `is_custom = false`.

**`workouts`** — a session
`id`, `user_id`, `started_at`, `ended_at` (nullable — a workout in progress has no end),
`notes`, `created_at`.

**`workout_sets`**
`id`, `workout_id` (cascade delete), `exercise_id`, `set_index`, `weight_kg`
`numeric(6,2)`, `reps` int, `rpe` `numeric(3,1)` nullable, `is_warmup` bool default false,
`completed_at`.

**`personal_records`**
`id`, `user_id`, `exercise_id`, `kind` (check: `e1rm|max_weight|max_reps|max_volume`),
`value` numeric, `achieved_at`, `source_set_id`. Index on `(user_id, exercise_id, kind,
achieved_at desc)`.

## The e1RM maths

Epley: `e1RM = weight × (1 + reps / 30)`.

Put it in `src/lib/strength.ts` as a pure function and unit-test it. Rules:

- `reps === 1` returns `weight` exactly. Don't let the formula add 3.3%.
- `reps > 12` returns `null`, not a number. Epley degrades badly in high-rep ranges and a
  20-rep set producing a fake 1RM will pollute every chart downstream. A set that can't
  produce a trustworthy estimate produces none.
- `reps < 1` or `weight <= 0` returns `null`.
- Warm-up sets never produce an e1RM and never trigger a PR.

Round e1RM to 1 decimal for display, keep full precision in the database.

## PR detection

After a set is saved, check it against the existing records for that exercise. A new PR
writes a row to `personal_records` — the table is an append-only history, not a
single-current-value cache. I want to see the progression of my PRs over time.

Four kinds: `e1rm`, `max_weight` (heaviest weight at any reps), `max_reps` (most reps at any
weight), `max_volume` (weight × reps in a single set).

Do this in a Postgres trigger, not client-side. If I ever log from a second device or
backfill data, the client-side version would silently miss records.

A PR shows a `live`-coloured marker on the set. That is the only celebration — no confetti,
no modal, no toast that blocks the next set. A quiet mark I notice on my own.

## Screens

**Gym tab (index)** — recent workouts as a list, each row showing date, duration, exercise
count, total volume, and a `live` dot if it contained a PR. One primary button: "Start
workout".

**Active workout** — the screen that matters. Optimise it ruthlessly.

- Add an exercise → searchable list, recents first. Fuzzy match on name.
- For each exercise, previous session's sets shown in `ink-faint` directly above the input.
  I should never have to remember or navigate to find what I did last time — it's the single
  most useful thing on the screen.
- Logging a set: weight and reps pre-filled from the previous set of this exercise in this
  session. Most sets repeat. Tapping "Log set" with no edits is the common case and must be
  one tap.
- Numeric inputs use `inputmode="decimal"` so iOS shows the number pad, not the QWERTY
  keyboard.
- A visible running duration since `started_at`.
- Rest timer: starts automatically on logging a set, counts up, shows the gap since the last
  set. Don't build notifications or background timers — iOS PWAs can't do them reliably and
  the attempt isn't worth it.
- "Finish workout" sets `ended_at`.
- A workout in progress must survive a page reload and an app switch. iOS aggressively
  suspends PWAs. Persist the in-progress workout to Postgres as it goes rather than holding
  it in memory — the row exists from the moment I tap "Start workout", with `ended_at` null.

**Exercise detail** — the payoff screen.

- e1RM over time as a `<Sparkline>`, drawing on boot
- Current PRs, all four kinds, each with the date achieved
- Full set history, grouped by session
- A stat: change in e1RM over the last 8 weeks, `live` if up, `warn` if down

**Overview tile** — replace one Phase 0 placeholder with a real gym tile: sessions this
week, and the most recent PR if there was one in the last 7 days.

## Reuse, don't rebuild

Every number is `<CountUp>`. Every trend is `<Sparkline>`. The screens register with
`<BootSequence>`. If you find yourself writing a new animation primitive, stop — either
Phase 0's is wrong and we fix it there, or you don't need it.

## Constraints

- No new dependencies without justifying the KB cost first.
- Unit-test `strength.ts` and the PR-detection logic. Don't test React rendering.
- Don't deploy.
- Don't touch nutrition, finance, or goals. Don't create their tables.
- Don't build workout templates, programme builders, supersets, or social features. If you
  think one is essential, ask — don't add it.

## When you're done

Show me the migration, confirm the tests pass, and tell me how to apply it. Then update the
status table in `CLAUDE.md` and stop.
