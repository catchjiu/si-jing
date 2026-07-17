-- Queen period / cycle tracker (pair_settings) + notify slave that it started today.

INSERT INTO public.pair_settings (key, value, updated_at)
VALUES (
  'queen_cycle',
  jsonb_build_object(
    'last_period_start', '2026-07-17',
    'cycle_length_days', 28,
    'period_length_days', 5,
    'remind_slave', true
  ),
  now()
)
ON CONFLICT (key) DO UPDATE
SET
  value = EXCLUDED.value,
  updated_at = now();

DO $$
DECLARE
  v_slave UUID;
BEGIN
  SELECT id INTO v_slave
  FROM public.users
  WHERE role = 'slave'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_slave IS NOT NULL THEN
    PERFORM public.notify_user(
      v_slave,
      'period_active',
      'Be extra nice to your Queen',
      'Her period started today. Soften up — comfort, patience, and care.',
      '/dashboard',
      'queen_cycle',
      NULL
    );
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
