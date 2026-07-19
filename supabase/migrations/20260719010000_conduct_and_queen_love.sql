-- Conduct level (bad boy ↔ good boy) + Queen love counter

INSERT INTO public.pair_settings (key, value, updated_at)
VALUES (
  'conduct_level',
  '{"level": 4}'::jsonb,
  now()
)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.pair_counters
  DROP CONSTRAINT IF EXISTS pair_counters_key_check;

ALTER TABLE public.pair_counters
  ADD CONSTRAINT pair_counters_key_check
  CHECK (key IN ('last_cum', 'queen_love'));

ALTER TABLE public.pair_counters
  ADD COLUMN IF NOT EXISTS count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.pair_counters
  ADD COLUMN IF NOT EXISTS last_increment_at TIMESTAMPTZ;

INSERT INTO public.pair_counters (key, reset_at, count)
VALUES ('queen_love', now(), 0)
ON CONFLICT (key) DO NOTHING;

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
  WHERE key = 'queen_love'
  RETURNING count, last_increment_at INTO v_count, v_last;

  RETURN jsonb_build_object(
    'ok', true,
    'count', v_count,
    'last_increment_at', v_last,
    'next_allowed_at', v_last + interval '5 minutes'
  );
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

  RETURN jsonb_build_object('ok', true, 'count', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.increment_queen_love() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_queen_love() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_queen_love() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_queen_love() TO authenticated;

NOTIFY pgrst, 'reload schema';
