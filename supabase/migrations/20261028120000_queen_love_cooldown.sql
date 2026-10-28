-- Slave-only wait between Hearts for Queen: 5 minutes (default) or 5 seconds.
-- Queen must not be able to read or write this in any way.

CREATE TABLE IF NOT EXISTS public.slave_private_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.slave_private_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.slave_private_settings FROM PUBLIC, anon, authenticated;

INSERT INTO public.slave_private_settings (key, value)
VALUES (
  'queen_love_cooldown',
  jsonb_build_object('seconds', 300)
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.queen_love_cooldown_seconds()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seconds INTEGER;
BEGIN
  SELECT (value->>'seconds')::integer
  INTO v_seconds
  FROM public.slave_private_settings
  WHERE key = 'queen_love_cooldown';

  IF v_seconds = 5 THEN
    RETURN 5;
  END IF;
  RETURN 300;
END;
$$;

REVOKE ALL ON FUNCTION public.queen_love_cooldown_seconds() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_queen_love_cooldown()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_home TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT home_role INTO v_home FROM public.users WHERE id = auth.uid();
  IF v_home IS DISTINCT FROM 'slave' THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'seconds', public.queen_love_cooldown_seconds()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_queen_love_cooldown(p_seconds integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_home TEXT;
  v_seconds INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT home_role INTO v_home FROM public.users WHERE id = auth.uid();
  IF v_home IS DISTINCT FROM 'slave' THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF p_seconds IS DISTINCT FROM 5 AND p_seconds IS DISTINCT FROM 300 THEN
    RAISE EXCEPTION 'Wait must be 5 seconds or 5 minutes';
  END IF;

  v_seconds := p_seconds;

  INSERT INTO public.slave_private_settings (key, value, updated_by, updated_at)
  VALUES (
    'queen_love_cooldown',
    jsonb_build_object('seconds', v_seconds),
    auth.uid(),
    now()
  )
  ON CONFLICT (key) DO UPDATE
    SET
      value = EXCLUDED.value,
      updated_by = EXCLUDED.updated_by,
      updated_at = EXCLUDED.updated_at;

  RETURN jsonb_build_object('ok', true, 'seconds', v_seconds);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_queen_love()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_last TIMESTAMPTZ;
  v_reset TIMESTAMPTZ;
  v_sum BIGINT := 0;
  v_days INTEGER := 0;
  v_avg NUMERIC := 0;
  v_today DATE := public.slave_calendar_date(now());
  v_role TEXT;
  v_home TEXT;
  v_cd INTEGER;
  v_payload jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role, home_role INTO v_role, v_home
  FROM public.users
  WHERE id = auth.uid();

  PERFORM public.ensure_queen_love_day_rollover();

  SELECT count, last_increment_at, reset_at
  INTO v_count, v_last, v_reset
  FROM public.pair_counters
  WHERE key = 'queen_love';

  IF NOT FOUND THEN
    v_count := 0;
    v_last := NULL;
    v_reset := now();
  END IF;

  SELECT COALESCE(SUM(heart_count), 0), COUNT(*)::INTEGER
  INTO v_sum, v_days
  FROM public.queen_love_days;

  -- Include today in the average.
  v_sum := v_sum + COALESCE(v_count, 0);
  v_days := v_days + 1;
  v_avg := ROUND((v_sum::NUMERIC / v_days::NUMERIC), 1);

  v_cd := public.queen_love_cooldown_seconds();

  v_payload := jsonb_build_object(
    'ok', true,
    'count', COALESCE(v_count, 0),
    'day_date', v_today,
    'daily_average', v_avg,
    'days_tracked', v_days,
    'timezone', 'Asia/Taipei'
  );

  -- Wait timestamps are only for whoever can send hearts (current slave).
  IF v_role = 'slave' THEN
    v_payload := v_payload || jsonb_build_object(
      'last_increment_at', v_last,
      'next_allowed_at', CASE
        WHEN v_last IS NULL THEN NULL
        ELSE v_last + make_interval(secs => v_cd)
      END
    );
  END IF;

  -- Cooldown choice is only visible to the home slave, never to Queen.
  IF v_home = 'slave' THEN
    v_payload := v_payload || jsonb_build_object('cooldown_seconds', v_cd);
  END IF;

  RETURN v_payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_queen_love()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT;
  v_count INTEGER;
  v_last TIMESTAMPTZ;
  v_wait_secs INTEGER;
  v_cd INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = v_uid;
  IF v_role <> 'slave' THEN
    RAISE EXCEPTION 'Only the slave can send Queen love';
  END IF;

  PERFORM public.assert_slave_can_mutate();
  PERFORM public.ensure_queen_love_day_rollover();

  v_cd := public.queen_love_cooldown_seconds();

  SELECT count, last_increment_at
  INTO v_count, v_last
  FROM public.pair_counters
  WHERE key = 'queen_love'
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.pair_counters (key, reset_at, count, last_increment_at, reset_by)
    VALUES ('queen_love', now(), 0, NULL, NULL);
    v_count := 0;
    v_last := NULL;
  END IF;

  IF v_last IS NOT NULL AND v_last > now() - make_interval(secs => v_cd) THEN
    v_wait_secs := GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (v_last + make_interval(secs => v_cd) - now())))::INTEGER
    );
    RAISE EXCEPTION 'Wait % more seconds before sending another heart', v_wait_secs;
  END IF;

  UPDATE public.pair_counters
  SET
    count = v_count + 1,
    last_increment_at = now(),
    reset_by = v_uid
  WHERE key = 'queen_love';

  RETURN public.get_queen_love();
END;
$$;

REVOKE ALL ON FUNCTION public.get_queen_love_cooldown() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_queen_love_cooldown(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_queen_love_cooldown() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_queen_love_cooldown(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
