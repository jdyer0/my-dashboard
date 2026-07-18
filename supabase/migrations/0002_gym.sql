-- 0002_gym.sql — Phase 1: gym module.
-- exercises: the user's own exercise catalogue, built up as they log.
-- gym_sessions: one row per workout; ended_at null means in progress.
-- gym_sets: one row per set. e1RM is derived in the app, never stored.

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.gym_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz check (ended_at is null or ended_at >= started_at)
);

create table public.gym_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references public.gym_sessions (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  weight_kg numeric(6, 2) not null check (weight_kg >= 0),
  reps integer not null check (reps > 0),
  performed_at timestamptz not null default now()
);

create index gym_sessions_user_started_idx on public.gym_sessions (user_id, started_at desc);
create index gym_sets_user_exercise_idx on public.gym_sets (user_id, exercise_id, performed_at);
create index gym_sets_session_idx on public.gym_sets (session_id);

alter table public.exercises enable row level security;
alter table public.gym_sessions enable row level security;
alter table public.gym_sets enable row level security;

create policy "exercises_select_own" on public.exercises for select using (user_id = auth.uid());
create policy "exercises_insert_own" on public.exercises for insert with check (user_id = auth.uid());
create policy "exercises_update_own" on public.exercises for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "exercises_delete_own" on public.exercises for delete using (user_id = auth.uid());

create policy "gym_sessions_select_own" on public.gym_sessions for select using (user_id = auth.uid());
create policy "gym_sessions_insert_own" on public.gym_sessions for insert with check (user_id = auth.uid());
create policy "gym_sessions_update_own" on public.gym_sessions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "gym_sessions_delete_own" on public.gym_sessions for delete using (user_id = auth.uid());

create policy "gym_sets_select_own" on public.gym_sets for select using (user_id = auth.uid());
create policy "gym_sets_insert_own" on public.gym_sets for insert with check (user_id = auth.uid());
create policy "gym_sets_update_own" on public.gym_sets for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "gym_sets_delete_own" on public.gym_sets for delete using (user_id = auth.uid());
