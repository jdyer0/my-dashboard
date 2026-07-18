-- 0001_init.sql — Phase 0 foundation.
-- profiles: one row per user. sex and birth_date feed RNI targets in Phase 2,
-- height_cm feeds BMI in Phase 1 — filled once, up front.

create table public.profiles (
  user_id uuid primary key not null references auth.users (id) on delete cascade,
  display_name text,
  sex text check (sex in ('male', 'female')),
  birth_date date,
  height_cm numeric(5, 1) check (height_cm > 0),
  timezone text not null default 'Europe/London',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (user_id = auth.uid());

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (user_id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "profiles_delete_own"
  on public.profiles for delete
  using (user_id = auth.uid());
