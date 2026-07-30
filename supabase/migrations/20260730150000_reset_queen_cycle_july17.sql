-- Restore period tracker after accidental reset (last start → 2026-07-17)
UPDATE public.pair_settings
SET
  value = jsonb_build_object(
    'last_period_start', '2026-07-17',
    'cycle_length_days', 28,
    'period_length_days', 7,
    'remind_slave', true
  ),
  updated_at = now()
WHERE key = 'queen_cycle';
