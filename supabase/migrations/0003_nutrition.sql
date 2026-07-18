-- 0003_nutrition.sql — Phase 2: nutrition.
-- nutrient_defs, foods, rni_targets are shared reference data: readable by any
-- authenticated user, written only by the ETL / Edge Function (service role) —
-- except custom foods, which a user creates and owns via created_by.
-- per_100g holds {nutrient_key: {value, is_trace}}; unknown nutrients are
-- simply absent — null is never coerced to zero (CLAUDE.md §7).

create extension if not exists pg_trgm;

create table public.nutrient_defs (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  display_name text not null,
  unit text not null check (unit in ('g', 'mg', 'µg', 'kcal')),
  kind text not null check (kind in ('macro', 'micro')),
  sort_order integer not null
);

create table public.foods (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  brand text,
  source text not null check (source in ('cofid', 'fdc', 'custom')),
  source_ref text,
  per_100g jsonb not null default '{}'::jsonb,
  default_portion_g numeric(6, 1) not null default 100 check (default_portion_g > 0),
  portion_label text,
  created_by uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  search_text tsvector generated always as (
    to_tsvector('english', name || ' ' || coalesce(brand, ''))
  ) stored,
  unique (source, source_ref),
  check (source != 'custom' or created_by is not null)
);

create index foods_search_idx on public.foods using gin (search_text);
create index foods_name_trgm_idx on public.foods using gin (name gin_trgm_ops);

create table public.food_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  food_id uuid not null references public.foods (id) on delete restrict,
  logged_at timestamptz not null default now(),
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  amount_g numeric(7, 1) not null check (amount_g > 0),
  created_at timestamptz not null default now()
);

create index food_log_user_logged_idx on public.food_log (user_id, logged_at desc);

create table public.rni_targets (
  id uuid primary key default gen_random_uuid(),
  nutrient_key text not null references public.nutrient_defs (key),
  sex text not null check (sex in ('male', 'female')),
  age_min integer not null,
  age_max integer not null check (age_max >= age_min),
  value numeric not null,
  unit text not null,
  unique (nutrient_key, sex, age_min)
);

create table public.nutrition_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  kcal_target integer check (kcal_target > 0),
  protein_g_target numeric(5, 1) check (protein_g_target > 0)
);

-- RLS ---------------------------------------------------------------------

alter table public.nutrient_defs enable row level security;
alter table public.foods enable row level security;
alter table public.food_log enable row level security;
alter table public.rni_targets enable row level security;
alter table public.nutrition_settings enable row level security;

create policy "nutrient_defs_select_authed" on public.nutrient_defs
  for select to authenticated using (true);

create policy "rni_targets_select_authed" on public.rni_targets
  for select to authenticated using (true);

create policy "foods_select_authed" on public.foods
  for select to authenticated using (true);
create policy "foods_insert_own_custom" on public.foods
  for insert to authenticated
  with check (source = 'custom' and created_by = auth.uid());
create policy "foods_update_own_custom" on public.foods
  for update to authenticated
  using (source = 'custom' and created_by = auth.uid())
  with check (source = 'custom' and created_by = auth.uid());
create policy "foods_delete_own_custom" on public.foods
  for delete to authenticated
  using (source = 'custom' and created_by = auth.uid());

create policy "food_log_select_own" on public.food_log for select using (user_id = auth.uid());
create policy "food_log_insert_own" on public.food_log for insert with check (user_id = auth.uid());
create policy "food_log_update_own" on public.food_log for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "food_log_delete_own" on public.food_log for delete using (user_id = auth.uid());

create policy "nutrition_settings_select_own" on public.nutrition_settings for select using (user_id = auth.uid());
create policy "nutrition_settings_insert_own" on public.nutrition_settings for insert with check (user_id = auth.uid());
create policy "nutrition_settings_update_own" on public.nutrition_settings for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "nutrition_settings_delete_own" on public.nutrition_settings for delete using (user_id = auth.uid());

-- Seed: nutrient dictionary ------------------------------------------------
-- Only nutrients CoFID + FDC can actually populate (PHASE-2 spec).

insert into public.nutrient_defs (key, display_name, unit, kind, sort_order) values
  ('energy_kcal',  'Energy',       'kcal', 'macro', 10),
  ('protein',      'Protein',      'g',    'macro', 20),
  ('carbohydrate', 'Carbohydrate', 'g',    'macro', 30),
  ('sugars',       'Sugars',       'g',    'macro', 40),
  ('fat',          'Fat',          'g',    'macro', 50),
  ('saturates',    'Saturates',    'g',    'macro', 60),
  ('fibre',        'Fibre',        'g',    'macro', 70),
  ('salt',         'Salt',         'g',    'macro', 80),
  ('iron',         'Iron',         'mg',   'micro', 110),
  ('calcium',      'Calcium',      'mg',   'micro', 120),
  ('magnesium',    'Magnesium',    'mg',   'micro', 130),
  ('zinc',         'Zinc',         'mg',   'micro', 140),
  ('potassium',    'Potassium',    'mg',   'micro', 150),
  ('selenium',     'Selenium',     'µg',   'micro', 160),
  ('iodine',       'Iodine',       'µg',   'micro', 170),
  ('vitamin_a',    'Vitamin A',    'µg',   'micro', 180),
  ('vitamin_d',    'Vitamin D',    'µg',   'micro', 190),
  ('vitamin_b12',  'Vitamin B12',  'µg',   'micro', 200),
  ('folate',       'Folate',       'µg',   'micro', 210),
  ('vitamin_c',    'Vitamin C',    'mg',   'micro', 220);

-- Seed: UK Reference Nutrient Intakes --------------------------------------
-- COMA Dietary Reference Values (1991) with the SACN 2016 vitamin D update.
-- Adult bands only — this is a single-user app and the user is an adult.
-- Iron drops for women over 50; protein shifts slightly with age.

insert into public.rni_targets (nutrient_key, sex, age_min, age_max, value, unit) values
  ('protein',     'male',   19,  50, 55.5, 'g'),
  ('protein',     'male',   51, 120, 53.3, 'g'),
  ('protein',     'female', 19,  50, 45.0, 'g'),
  ('protein',     'female', 51, 120, 46.5, 'g'),
  ('iron',        'male',   19, 120, 8.7,  'mg'),
  ('iron',        'female', 19,  50, 14.8, 'mg'),
  ('iron',        'female', 51, 120, 8.7,  'mg'),
  ('calcium',     'male',   19, 120, 700,  'mg'),
  ('calcium',     'female', 19, 120, 700,  'mg'),
  ('magnesium',   'male',   19, 120, 300,  'mg'),
  ('magnesium',   'female', 19, 120, 270,  'mg'),
  ('zinc',        'male',   19, 120, 9.5,  'mg'),
  ('zinc',        'female', 19, 120, 7.0,  'mg'),
  ('potassium',   'male',   19, 120, 3500, 'mg'),
  ('potassium',   'female', 19, 120, 3500, 'mg'),
  ('selenium',    'male',   19, 120, 75,   'µg'),
  ('selenium',    'female', 19, 120, 60,   'µg'),
  ('iodine',      'male',   19, 120, 140,  'µg'),
  ('iodine',      'female', 19, 120, 140,  'µg'),
  ('vitamin_a',   'male',   19, 120, 700,  'µg'),
  ('vitamin_a',   'female', 19, 120, 600,  'µg'),
  ('vitamin_d',   'male',   19, 120, 10,   'µg'),
  ('vitamin_d',   'female', 19, 120, 10,   'µg'),
  ('vitamin_b12', 'male',   19, 120, 1.5,  'µg'),
  ('vitamin_b12', 'female', 19, 120, 1.5,  'µg'),
  ('folate',      'male',   19, 120, 200,  'µg'),
  ('folate',      'female', 19, 120, 200,  'µg'),
  ('vitamin_c',   'male',   19, 120, 40,   'mg'),
  ('vitamin_c',   'female', 19, 120, 40,   'mg');
