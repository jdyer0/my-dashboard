-- 0006_chat_only_logging.sql — food logging goes through the chat coach only.
-- The meal-parse Edge Function now estimates macro- and micronutrients itself,
-- so the foods reference table (CoFID/FDC/custom) goes away. Each food_log row
-- becomes self-contained: a name and the absolute nutrient amounts for the
-- portion eaten, as {nutrient_key: {value, is_trace}}. A nutrient the coach
-- omitted is absent — unknown, never zero (CLAUDE.md §7 still applies).
--
-- Existing entries are preserved by snapshotting their food's per-100g values
-- scaled to the logged amount before the foods table is dropped.

alter table public.food_log
  add column name text,
  add column nutrients jsonb not null default '{}'::jsonb;

update public.food_log fl
set
  name = f.name,
  nutrients = coalesce(
    (
      select jsonb_object_agg(
        e.key,
        case
          when (e.value ->> 'is_trace')::boolean
            then jsonb_build_object('value', 0, 'is_trace', true)
          else jsonb_build_object(
            'value', round((e.value ->> 'value')::numeric * fl.amount_g / 100, 4)
          )
        end
      )
      from jsonb_each(f.per_100g) e
    ),
    '{}'::jsonb
  )
from public.foods f
where f.id = fl.food_id;

alter table public.food_log
  alter column name set not null,
  drop column food_id;

alter table public.food_log
  add constraint food_log_name_not_blank check (length(trim(name)) > 0);

drop table public.foods;
