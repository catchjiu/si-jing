-- Queen love: reset at end of slave's day (Asia/Taipei); keep daily average.

CREATE TABLE IF NOT EXISTS public.queen_love_days (
  day_date DATE PRIMARY KEY,
  heart_count INTEGER NOT NULL DEFAULT 0 CHECK (heart_count >= 0),
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.queen_love_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read queen_love_days" ON public.queen_love_days;
CREATE POLICY "Authenticated can read queen_love_days"
  ON public.queen_love_days FOR SELECT TO authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.queen_love_days FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.slave_calendar_date(p_ts TIMESTAMPTZ DEFAULT now())
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (p_ts AT TIME ZONE 'Asia/Taipei')::date;
$$;

CREATE OR REPLACE FUNCTION public.ensure_queen_love_day_rollover()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := public.slave_calendar_date(now());
  v_count INTEGER;
  v_reset TIMESTAMPTZ;
  v_day DATE;
BEGIN
  SELECT count, reset_at
  INTO v_count, v_reset
  FROM public.pair_counters
  WHERE key = 'queen_love'
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.pair_counters (key, reset_at, count, last_increment_at, reset_by)
    VALUES ('queen_love', now(), 0, NULL, NULL);
    RETURN;
  END IF;

  v_day := public.slave_calendar_date(v_reset);

  IF v_day < v_today THEN
    INSERT INTO public.queen_love_days (day_date, heart_count, closed_at)
    VALUES (v_day, COALESCE(v_count, 0), now())
    ON CONFLICT (day_date) DO UPDATE
      SET
        heart_count = EXCLUDED.heart_count,
        closed_at = EXCLUDED.closed_at;

    UPDATE public.pair_counters
    SET
      count = 0,
      last_increment_at = NULL,
      reset_at = now()
    WHERE key = 'queen_love';
  END IF;
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

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

  RETURN jsonb_build_object(
    'ok', true,
    'count', COALESCE(v_count, 0),
    'last_increment_at', v_last,
    'next_allowed_at', CASE
      WHEN v_last IS NULL THEN NULL
      ELSE v_last + interval '5 minutes'
    END,
    'day_date', v_today,
    'daily_average', v_avg,
    'days_tracked', v_days,
    'timezone', 'Asia/Taipei'
  );
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

  IF v_last IS NOT NULL AND v_last > now() - interval '5 minutes' THEN
    v_wait_secs := GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (v_last + interval '5 minutes' - now())))::INTEGER
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

CREATE OR REPLACE FUNCTION public.reset_queen_love()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.current_user_role() <> 'queen' THEN
    RAISE EXCEPTION 'Only the Queen can reset the love counter';
  END IF;

  PERFORM public.ensure_queen_love_day_rollover();

  UPDATE public.pair_counters
  SET
    count = 0,
    last_increment_at = NULL,
    reset_at = now(),
    reset_by = v_uid
  WHERE key = 'queen_love';

  IF NOT FOUND THEN
    INSERT INTO public.pair_counters (key, reset_at, count, last_increment_at, reset_by)
    VALUES ('queen_love', now(), 0, NULL, v_uid);
  END IF;

  RETURN public.get_queen_love();
END;
$$;

REVOKE ALL ON FUNCTION public.slave_calendar_date(TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_queen_love_day_rollover() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_queen_love() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_queen_love() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_queen_love() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.slave_calendar_date(TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_queen_love_day_rollover() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_queen_love() TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_queen_love() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_queen_love() TO authenticated;

NOTIFY pgrst, 'reload schema';
