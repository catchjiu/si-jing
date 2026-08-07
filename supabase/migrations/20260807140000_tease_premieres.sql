-- Burned + Timed Premiere teases (one-shot viewing)

ALTER TABLE public.teases
  ADD COLUMN IF NOT EXISTS premiere_kind TEXT
    CHECK (premiere_kind IS NULL OR premiere_kind IN ('burned', 'timed')),
  ADD COLUMN IF NOT EXISTS premiere_window_minutes INTEGER
    CHECK (
      premiere_window_minutes IS NULL
      OR (premiere_window_minutes >= 5 AND premiere_window_minutes <= 60)
    ),
  ADD COLUMN IF NOT EXISTS premiere_closes_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS premiere_denial_days INTEGER NOT NULL DEFAULT 1
    CHECK (premiere_denial_days >= 0 AND premiere_denial_days <= 7),
  ADD COLUMN IF NOT EXISTS burned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS burn_reason TEXT
    CHECK (
      burn_reason IS NULL
      OR burn_reason IN ('played', 'early_exit', 'looked_away', 'missed_window')
    );

CREATE INDEX IF NOT EXISTS idx_teases_premiere_closes
  ON public.teases (premiere_closes_at)
  WHERE premiere_kind = 'timed' AND burned_at IS NULL;

CREATE OR REPLACE FUNCTION public.apply_premiere_denial(
  p_days INTEGER,
  p_note TEXT,
  p_updated_by UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_end TIMESTAMPTZ;
BEGIN
  IF p_days IS NULL OR p_days <= 0 THEN
    RETURN;
  END IF;

  SELECT denial_ends_at INTO base_end FROM public.denial_ledger WHERE id = 1;
  base_end := GREATEST(COALESCE(base_end, NOW()), NOW());

  INSERT INTO public.denial_ledger (id, edges_remaining, denial_ends_at, queen_note, updated_by)
  VALUES (
    1,
    0,
    base_end + make_interval(days => p_days),
    left(NULLIF(trim(COALESCE(p_note, '')), ''), 200),
    p_updated_by
  )
  ON CONFLICT (id) DO UPDATE
  SET
    denial_ends_at = GREATEST(COALESCE(public.denial_ledger.denial_ends_at, NOW()), NOW())
      + make_interval(days => p_days),
    queen_note = COALESCE(
      EXCLUDED.queen_note,
      public.denial_ledger.queen_note
    ),
    updated_by = EXCLUDED.updated_by,
    updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.start_premiere_session(p_tease_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.teases%ROWTYPE;
  v_uid UUID := auth.uid();
  v_role TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = v_uid;
  IF v_role <> 'slave' THEN
    RAISE EXCEPTION 'Only D can start a premiere session';
  END IF;

  SELECT * INTO t FROM public.teases WHERE id = p_tease_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Premiere not found';
  END IF;
  IF t.sent_to <> v_uid THEN
    RAISE EXCEPTION 'Not your premiere';
  END IF;
  IF t.premiere_kind IS NULL THEN
    RAISE EXCEPTION 'Not a premiere tease';
  END IF;
  IF t.burned_at IS NOT NULL OR t.expired_at IS NOT NULL THEN
    RAISE EXCEPTION 'This premiere is already burned';
  END IF;
  IF t.image_path IS NULL THEN
    RAISE EXCEPTION 'Premiere has no media';
  END IF;
  IF t.is_blurred THEN
    RAISE EXCEPTION 'Premiere is not ready yet';
  END IF;
  IF t.unlocks_at > NOW() THEN
    RAISE EXCEPTION 'Premiere has not opened yet';
  END IF;
  IF t.premiere_kind = 'timed'
     AND t.premiere_closes_at IS NOT NULL
     AND t.premiere_closes_at < NOW() THEN
    RAISE EXCEPTION 'Premiere window has closed';
  END IF;

  UPDATE public.teases
  SET
    viewed_at = COALESCE(viewed_at, NOW()),
    view_started_at = NOW()
  WHERE id = t.id;

  RETURN jsonb_build_object(
    'ok', true,
    'tease_id', t.id,
    'premiere_kind', t.premiere_kind,
    'premiere_closes_at', t.premiere_closes_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_premiere_session(
  p_tease_id UUID,
  p_reason TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.teases%ROWTYPE;
  v_uid UUID := auth.uid();
  v_role TEXT;
  v_reason TEXT := lower(trim(COALESCE(p_reason, '')));
  v_note TEXT;
  v_penalize BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = v_uid;
  IF v_role NOT IN ('slave', 'queen') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF v_reason NOT IN ('played', 'early_exit', 'looked_away', 'missed_window') THEN
    RAISE EXCEPTION 'Invalid burn reason';
  END IF;

  SELECT * INTO t FROM public.teases WHERE id = p_tease_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Premiere not found';
  END IF;
  IF t.premiere_kind IS NULL THEN
    RAISE EXCEPTION 'Not a premiere tease';
  END IF;
  IF v_role = 'slave' AND t.sent_to <> v_uid THEN
    RAISE EXCEPTION 'Not your premiere';
  END IF;
  IF v_role = 'queen' AND t.sent_by <> v_uid THEN
    RAISE EXCEPTION 'Not your premiere';
  END IF;

  IF t.burned_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_burned', true,
      'burn_reason', t.burn_reason,
      'burned_at', t.burned_at
    );
  END IF;

  UPDATE public.teases
  SET
    burned_at = NOW(),
    burn_reason = v_reason,
    expired_at = COALESCE(expired_at, NOW())
  WHERE id = t.id;

  v_penalize := v_reason IN ('early_exit', 'looked_away', 'missed_window')
    AND COALESCE(t.premiere_denial_days, 0) > 0;

  IF v_penalize THEN
    v_note := CASE v_reason
      WHEN 'missed_window' THEN 'Missed timed premiere'
      WHEN 'looked_away' THEN 'Looked away during premiere'
      ELSE 'Left premiere early'
    END;
    PERFORM public.apply_premiere_denial(
      t.premiere_denial_days,
      v_note,
      COALESCE(t.sent_by, v_uid)
    );
  END IF;

  INSERT INTO public.notifications (user_id, kind, title, body, href)
  VALUES (
    t.sent_by,
    'premiere_burned',
    CASE
      WHEN v_reason = 'played' THEN 'Premiere watched'
      WHEN v_reason = 'missed_window' THEN 'Premiere missed'
      ELSE 'Premiere burned'
    END,
    CASE
      WHEN v_reason = 'played' THEN 'D finished your premiere.'
      WHEN v_reason = 'missed_window' THEN 'D missed the premiere window.'
      WHEN v_reason = 'looked_away' THEN 'D looked away — premiere burned.'
      ELSE 'D left the premiere early — burned.'
    END,
    '/dashboard/teases?tease=' || t.id::text
  );

  INSERT INTO public.notifications (user_id, kind, title, body, href)
  VALUES (
    t.sent_to,
    'premiere_burned',
    'Premiere burned',
    CASE
      WHEN v_reason = 'played' THEN 'That premiere is gone forever.'
      WHEN v_reason = 'missed_window' THEN 'You missed the premiere window.'
      WHEN v_reason = 'looked_away' THEN 'You looked away — premiere burned.'
      ELSE 'You left early — premiere burned.'
    END,
    CASE
      WHEN v_penalize THEN '/dashboard/denial'
      ELSE '/dashboard/teases?tease=' || t.id::text
    END
  );

  RETURN jsonb_build_object(
    'ok', true,
    'already_burned', false,
    'burn_reason', v_reason,
    'penalized', v_penalize,
    'denial_days', CASE WHEN v_penalize THEN t.premiere_denial_days ELSE 0 END
  );
END;
$$;

-- Cron-safe miss flagger (no auth.uid / role check)
CREATE OR REPLACE FUNCTION public.flag_missed_premieres()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.teases%ROWTYPE;
  n INTEGER := 0;
  v_note TEXT;
BEGIN
  FOR t IN
    SELECT *
    FROM public.teases
    WHERE premiere_kind = 'timed'
      AND burned_at IS NULL
      AND premiere_closes_at IS NOT NULL
      AND premiere_closes_at < NOW()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.teases
    SET
      burned_at = NOW(),
      burn_reason = 'missed_window',
      expired_at = COALESCE(expired_at, NOW())
    WHERE id = t.id;

    IF COALESCE(t.premiere_denial_days, 0) > 0 THEN
      v_note := 'Missed timed premiere';
      PERFORM public.apply_premiere_denial(
        t.premiere_denial_days,
        v_note,
        t.sent_by
      );
    END IF;

    INSERT INTO public.notifications (user_id, kind, title, body, href)
    VALUES
      (
        t.sent_by,
        'premiere_burned',
        'Premiere missed',
        'D missed the premiere window.',
        '/dashboard/teases?tease=' || t.id::text
      ),
      (
        t.sent_to,
        'premiere_burned',
        'Premiere burned',
        'You missed the premiere window.',
        '/dashboard/denial'
      );

    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_premiere_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_premiere_session(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flag_missed_premieres() TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_premiere_denial(INTEGER, TEXT, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
