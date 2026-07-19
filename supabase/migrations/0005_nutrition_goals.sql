-- 0005_nutrition_goals.sql — make carbohydrate and fat goals editable.
-- kcal_target and protein_g_target already exist (0003). Carbs and fat were
-- derived from calories; store explicit gram targets so they can be overridden.
-- Null still means "use the derived default", never zero.

alter table public.nutrition_settings
  add column carb_g_target numeric(5, 1) check (carb_g_target > 0),
  add column fat_g_target numeric(5, 1) check (fat_g_target > 0);
