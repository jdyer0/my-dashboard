# Phase 4 — goals

Paste this into Claude Code once Phase 3 is syncing reliably. This phase lands last on
purpose: it reads from the other three modules rather than inventing its own data.

---

Read `CLAUDE.md` first. Phases 0–3 are done. Build Phase 4 — goals — and finish the app.

Two distinct concepts, and the design must not blur them:
- **Habits** — recurring, streak-based. "Gym 3× a week." "Log food every day."
- **Milestones** — one-off targets with progress. "Bench 100kg." "£5,000 saved."

The distinguishing feature of this module: goals should measure themselves wherever the
data already exists. A gym-attendance habit checks the `workouts` table. A bench-press
milestone reads e1RM from `personal_records`. A savings milestone reads `balances`. Manual
tick-boxes are the fallback for things the app can't see (reading, stretching), not the
default.

## Schema

Migration `0005_goals.sql`. RLS as always.

**`habits`**
`id`, `user_id`, `name`, `metric_source` (check: `manual|workouts|food_log|steps`),
`target_per_week` int (1–7), `is_archived` bool default false, `created_at`.
- `workouts`: a day counts if a workout with `ended_at` exists that day
- `food_log`: a day counts if ≥1 meal was logged that day
- `steps`: a day counts if health-synced steps ≥ a `threshold` int column (nullable,
  required only for this source)
- `manual`: a day counts if ticked

**`habit_ticks`** — manual habits only
`id`, `habit_id`, `date` date, unique on `(habit_id, date)`.

**`milestones`**
`id`, `user_id`, `name`,
`metric_source` (check: `manual|e1rm|weight|balance|savings_delta`),
`exercise_id` nullable (required when source is `e1rm`),
`account_id` nullable (used when source is `balance`; null = all accounts),
`start_value` numeric, `target_value` numeric, `current_value` numeric,
`direction` (check: `increase|decrease`) — a weight-loss goal decreases; progress maths
must respect direction rather than assuming up is good,
`target_date` date nullable, `achieved_at` timestamptz nullable, `created_at`.

Auto-sourced `current_value` refreshes when the underlying data changes — compute on read
(a view or query), don't build a sync pipeline between our own tables.

## Streak and progress logic

Pure functions in `src/lib/goals.ts`, unit-tested — this module is mostly edge cases:

- Weekly habits: a week is Mon–Sun in Europe/London. The streak is consecutive weeks
  hitting target. The CURRENT week counts as alive if the target is still reachable
  (2/3 done on Thursday = alive; 1/3 on Sunday = broken).
- Daily-equivalent (`target_per_week = 7`): streak in days, with the current day not
  counting against until it's over.
- Milestone progress: `(current − start) / (target − start)`, clamped 0–1, direction-aware.
- Achievement: crossing the target sets `achieved_at` once. It never un-achieves — if the
  value slips back, the milestone stays achieved. A quiet `live` mark, consistent with how
  PRs celebrate. No confetti.
- A milestone with a `target_date` shows required pace vs actual pace ("needs +1.2kg/month,
  trending +0.8") — this is the single most motivating number in the module, in mono,
  `live`/`warn` by whether pace is sufficient.

## Screens

**Goals screen** — lives inside the Overview tab as a section, not a fifth tab. Four tabs
is the design; don't add one.
- Habits: name, this week as seven dots (filled/today/empty), current streak in mono.
  Manual habits get a tap-to-tick on today's dot. Auto habits' dots are read-only and
  labelled with their source.
- Milestones: name, `<Bar>` progress, current → target in mono, pace line if target_date
  set.
- Archived habits and achieved milestones fold into a collapsed history section.

**Create flows** — one screen each, minimal:
- Habit: name, source, target/week, threshold if steps
- Milestone: name, source, exercise/account picker when relevant, start (prefilled from
  current data when auto-sourced), target, direction, optional date

**Overview integration** — the final dashboard state:
- The goals section shows the 2–3 most at-risk-or-active items, not everything
- The boot sequence covers the full dashboard: metric tiles, gym, food, money, goals
  cascade in as one orchestrated sequence. This screen is the whole point of the app —
  spend real effort making the boot feel right end to end, then confirm it still completes
  under 1.2s with real data.

## Constraints

- No notifications, no reminders, no email nudges. iOS PWA notification support is not
  worth its complexity for one user; the dashboard being good is the reminder.
- No sharing, no gamification beyond streaks, no points, no badges.
- Don't rebuild any aggregation that exists — reuse the gym/nutrition/finance query logic.
- Unit-test the streak edge cases hard: week boundaries, DST transitions (the March/October
  Europe/London shifts WILL break naive date maths), the still-reachable rule, direction-
  aware progress.
- Don't deploy.

## When you're done

Confirm tests pass — including a DST-boundary test — update the status table in `CLAUDE.md`
marking all phases done, and stop.

Then, as the very last thing, give me a punch-list of what to verify by hand on the phone:
the ten things most likely to be subtly wrong that automated checks can't see.
