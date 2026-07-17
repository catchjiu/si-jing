-- Period phase lasts 7 days by default.

UPDATE public.pair_settings
SET
  value = jsonb_set(value, '{period_length_days}', '7'::jsonb, true),
  updated_at = now()
WHERE key = 'queen_cycle';
