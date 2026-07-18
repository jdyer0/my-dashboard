-- 0004_gym_coach_split.sql — progressive overload coach and weekly split.
-- Progression settings live on the exercise: the weight increment the kit
-- allows (2.5 kg plates, 2 kg dumbbell jumps) and the working rep range for
-- double progression. Split: one focus per weekday, plus a per-focus exercise
-- template ("Upper" is defined once and applies to every Upper day).

alter table public.exercises
  add column increment_kg numeric(5, 2) not null default 2.5 check (increment_kg > 0),
  add column rep_range_min integer not null default 8 check (rep_range_min > 0),
  add column rep_range_max integer not null default 12;

alter table public.exercises
  add constraint exercises_rep_range_check check (rep_range_max >= rep_range_min);

create table public.split_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6), -- 0 = Monday
  focus text not null check (focus in ('upper', 'lower', 'push', 'pull', 'legs', 'full_body', 'rest')),
  primary key (user_id, weekday)
);

create table public.split_template_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  focus text not null check (focus in ('upper', 'lower', 'push', 'pull', 'legs', 'full_body')),
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  position integer not null default 0,
  unique (user_id, focus, exercise_id)
);

alter table public.split_days enable row level security;
alter table public.split_template_exercises enable row level security;

create policy "split_days_select_own" on public.split_days for select using (user_id = auth.uid());
create policy "split_days_insert_own" on public.split_days for insert with check (user_id = auth.uid());
create policy "split_days_update_own" on public.split_days for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "split_days_delete_own" on public.split_days for delete using (user_id = auth.uid());

create policy "split_template_exercises_select_own" on public.split_template_exercises for select using (user_id = auth.uid());
create policy "split_template_exercises_insert_own" on public.split_template_exercises for insert with check (user_id = auth.uid());
create policy "split_template_exercises_update_own" on public.split_template_exercises for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "split_template_exercises_delete_own" on public.split_template_exercises for delete using (user_id = auth.uid());
