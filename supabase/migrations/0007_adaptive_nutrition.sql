-- 0007_adaptive_nutrition.sql — the adaptive coach and hydration.
--
-- Targets stop being a number the user types and become a number the app
-- derives: daily scale weight is smoothed into a trend, the trend's slope
-- against logged intake back-calculates energy expenditure, and a weekly
-- check-in issues fresh calorie and macro targets. The user reviews and
-- accepts each check-in — nothing changes their targets behind their back.
--
-- Three new tables, all single-user with the usual user_id = auth.uid() RLS.

-- Daily scale weight -------------------------------------------------------
-- One weigh-in per London calendar day (CLAUDE.md §6): a weigh-in has no
-- meaningful clock time, so `day` is a plain date computed London-side and
-- the primary key makes re-logging the same day an upsert, not a duplicate.
-- Kilograms as numeric(6,2), never float.

create table public.weight_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  weight_kg numeric(6, 2) not null check (weight_kg > 0 and weight_kg < 500),
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

create index weight_log_user_day_idx on public.weight_log (user_id, day desc);

-- Hydration ----------------------------------------------------------------
-- Displayed in litres, stored in whole millilitres as an integer — the same
-- minor-unit rule money follows (§6), so totals never drift on rounding.
-- One row per drink so the day can be corrected a sip at a time.

create table public.hydration_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  logged_at timestamptz not null default now(),
  volume_ml integer not null check (volume_ml > 0 and volume_ml <= 5000),
  source text not null default 'manual' check (source in ('manual', 'meal'))
);

create index hydration_log_user_logged_idx on public.hydration_log (user_id, logged_at desc);

-- Issued targets -----------------------------------------------------------
-- One row per accepted check-in. Targets are a record, not a live formula:
-- they hold steady for the week so the diary doesn't move under the user's
-- feet as the day's weigh-in lands. expenditure_kcal and trend_weight_kg are
-- the inputs the targets were derived from, kept so a past check-in can be
-- explained. Both are null when the user set the targets by hand.

create table public.nutrition_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  effective_from date not null,
  kcal_target integer not null check (kcal_target > 0),
  protein_g_target numeric(5, 1) not null check (protein_g_target > 0),
  carb_g_target numeric(5, 1) not null check (carb_g_target >= 0),
  fat_g_target numeric(5, 1) not null check (fat_g_target > 0),
  expenditure_kcal integer check (expenditure_kcal > 0),
  trend_weight_kg numeric(6, 2) check (trend_weight_kg > 0),
  source text not null default 'coached' check (source in ('coached', 'manual')),
  created_at timestamptz not null default now(),
  unique (user_id, effective_from)
);

create index nutrition_programs_user_from_idx
  on public.nutrition_programs (user_id, effective_from desc);

-- Program settings ---------------------------------------------------------
-- The knobs the coach reads. goal_rate_kg_per_week is signed: negative loses
-- weight, zero maintains, positive gains. protein_g_per_kg and fat_pct_energy
-- shape how a calorie target splits into macros. The existing *_target columns
-- stay — they are the manual override, used when program_mode = 'manual'.

alter table public.nutrition_settings
  add column program_mode text not null default 'coached'
    check (program_mode in ('coached', 'manual')),
  add column goal_rate_kg_per_week numeric(4, 2) not null default 0
    check (goal_rate_kg_per_week between -1.5 and 1.5),
  add column protein_g_per_kg numeric(4, 2) not null default 1.8
    check (protein_g_per_kg between 0.8 and 3.5),
  add column fat_pct_energy numeric(4, 3) not null default 0.30
    check (fat_pct_energy between 0.15 and 0.60),
  add column hydration_target_ml integer not null default 2500
    check (hydration_target_ml between 500 and 8000);

-- RLS ----------------------------------------------------------------------

alter table public.weight_log enable row level security;
alter table public.hydration_log enable row level security;
alter table public.nutrition_programs enable row level security;

create policy "weight_log_select_own" on public.weight_log for select using (user_id = auth.uid());
create policy "weight_log_insert_own" on public.weight_log for insert with check (user_id = auth.uid());
create policy "weight_log_update_own" on public.weight_log for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "weight_log_delete_own" on public.weight_log for delete using (user_id = auth.uid());

create policy "hydration_log_select_own" on public.hydration_log for select using (user_id = auth.uid());
create policy "hydration_log_insert_own" on public.hydration_log for insert with check (user_id = auth.uid());
create policy "hydration_log_update_own" on public.hydration_log for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "hydration_log_delete_own" on public.hydration_log for delete using (user_id = auth.uid());

create policy "nutrition_programs_select_own" on public.nutrition_programs for select using (user_id = auth.uid());
create policy "nutrition_programs_insert_own" on public.nutrition_programs for insert with check (user_id = auth.uid());
create policy "nutrition_programs_update_own" on public.nutrition_programs for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "nutrition_programs_delete_own" on public.nutrition_programs for delete using (user_id = auth.uid());
