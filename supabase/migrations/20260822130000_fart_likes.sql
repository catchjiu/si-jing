-- Lifetime likes for Fart Tracker (same tap as Queen love, no daily reset).

ALTER TABLE public.pair_counters
  DROP CONSTRAINT IF EXISTS pair_counters_key_check;

ALTER TABLE public.pair_counters
  ADD CONSTRAINT pair_counters_key_check
  CHECK (key IN ('last_cum', 'queen_love', 'fart_likes'));

INSERT INTO public.pair_counters (key, reset_at, count)
VALUES ('fart_likes', now(), 0)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_fart_likes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_last TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT count, last_increment_at
  INTO v_count, v_last
  FROM public.pair_counters
  WHERE key = 'fart_likes';

  IF NOT FOUND THEN
    v_count := 0;
    v_last := NULL;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'count', COALESCE(v_count, 0),
    'last_increment_at', v_last,
    'next_allowed_at', CASE
      WHEN v_last IS NULL THEN NULL
      ELSE v_last + interval '5 minutes'
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_fart_likes()
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
    RAISE EXCEPTION 'Only the slave can like a fart';
  END IF;

  PERFORM public.assert_slave_can_mutate();

  SELECT count, last_increment_at
  INTO v_count, v_last
  FROM public.pair_counters
  WHERE key = 'fart_likes'
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.pair_counters (key, reset_at, count, last_increment_at, reset_by)
    VALUES ('fart_likes', now(), 0, NULL, NULL);
    v_count := 0;
    v_last := NULL;
  END IF;

  IF v_last IS NOT NULL AND v_last > now() - interval '5 minutes' THEN
    v_wait_secs := GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (v_last + interval '5 minutes' - now())))::INTEGER
    );
    RAISE EXCEPTION 'Wait % more seconds before sending another like', v_wait_secs;
  END IF;

  UPDATE public.pair_counters
  SET
    count = v_count + 1,
    last_increment_at = now(),
    reset_by = v_uid
  WHERE key = 'fart_likes'
  RETURNING count, last_increment_at INTO v_count, v_last;

  RETURN jsonb_build_object(
    'ok', true,
    'count', v_count,
    'last_increment_at', v_last,
    'next_allowed_at', v_last + interval '5 minutes'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_fart_likes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_fart_likes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fart_likes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_fart_likes() TO authenticated;

NOTIFY pgrst, 'reload schema';
