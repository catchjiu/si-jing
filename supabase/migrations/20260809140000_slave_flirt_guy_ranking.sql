-- Include D as a special flirt_guys row; body_score syncs from current progress pic.
-- Queen sets the other scores (defaults 50 / 19cm). Ranking uses a composite of all meters.

ALTER TABLE public.flirt_guys
  ADD COLUMN IF NOT EXISTS is_slave BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS flirt_guys_one_slave_per_assignee
  ON public.flirt_guys (assigned_to)
  WHERE is_slave = true;

ALTER TABLE public.flirt_guys
  ALTER COLUMN dick_size_cm SET DEFAULT 19;

CREATE OR REPLACE FUNCTION public.guard_flirt_guy_slave_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.current_user_role() <> 'queen' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.photo_path IS DISTINCT FROM OLD.photo_path
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.interest_level IS DISTINCT FROM OLD.interest_level
       OR NEW.hotness_level IS DISTINCT FROM OLD.hotness_level
       OR NEW.face_score IS DISTINCT FROM OLD.face_score
       OR NEW.body_score IS DISTINCT FROM OLD.body_score
       OR NEW.dick_size_cm IS DISTINCT FROM OLD.dick_size_cm
       OR NEW.is_slave IS DISTINCT FROM OLD.is_slave
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Only jealousy may be updated by the assigned slave';
    END IF;
  END IF;

  IF OLD.is_slave AND NEW.is_slave IS DISTINCT FROM OLD.is_slave THEN
    RAISE EXCEPTION 'Cannot change is_slave flag';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_flirt_guy_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_slave THEN
    RAISE EXCEPTION 'Cannot delete the slave flirt card';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_flirt_guys_no_delete_slave ON public.flirt_guys;
CREATE TRIGGER trg_flirt_guys_no_delete_slave
  BEFORE DELETE ON public.flirt_guys
  FOR EACH ROW EXECUTE FUNCTION public.guard_flirt_guy_delete();

CREATE OR REPLACE FUNCTION public.sync_slave_flirt_body_score(p_slave_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_overall INT;
BEGIN
  SELECT p.rating_overall INTO v_overall
  FROM public.workout_weekly_pics p
  WHERE p.created_by = p_slave_id
    AND p.rating_overall IS NOT NULL
  ORDER BY p.week_start DESC, p.rated_at DESC NULLS LAST
  LIMIT 1;

  IF v_overall IS NULL THEN
    SELECT br.overall INTO v_overall
    FROM public.body_ratings br
    WHERE br.rated_for = p_slave_id;
  END IF;

  IF v_overall IS NULL THEN
    v_overall := 50;
  END IF;

  UPDATE public.flirt_guys
  SET
    body_score = v_overall,
    updated_at = now()
  WHERE assigned_to = p_slave_id
    AND is_slave = true
    AND body_score IS DISTINCT FROM v_overall;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_slave_flirt_guy()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slave RECORD;
  v_queen UUID;
  v_existing UUID;
  v_overall INT := 50;
  v_id UUID;
BEGIN
  SELECT id, username INTO v_slave
  FROM public.users
  WHERE role = 'slave'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_slave.id IS NULL THEN
    RAISE EXCEPTION 'No slave account found';
  END IF;

  SELECT id INTO v_queen
  FROM public.users
  WHERE role = 'queen'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_queen IS NULL THEN
    RAISE EXCEPTION 'No queen account found';
  END IF;

  SELECT id INTO v_existing
  FROM public.flirt_guys
  WHERE assigned_to = v_slave.id
    AND is_slave = true
  LIMIT 1;

  SELECT p.rating_overall INTO v_overall
  FROM public.workout_weekly_pics p
  WHERE p.created_by = v_slave.id
    AND p.rating_overall IS NOT NULL
  ORDER BY p.week_start DESC, p.rated_at DESC NULLS LAST
  LIMIT 1;

  IF v_overall IS NULL THEN
    SELECT br.overall INTO v_overall
    FROM public.body_ratings br
    WHERE br.rated_for = v_slave.id;
  END IF;

  IF v_overall IS NULL THEN
    v_overall := 50;
  END IF;

  IF v_existing IS NOT NULL THEN
    UPDATE public.flirt_guys
    SET
      name = COALESCE(NULLIF(trim(v_slave.username), ''), name),
      body_score = v_overall,
      updated_at = now()
    WHERE id = v_existing;
    RETURN v_existing;
  END IF;

  INSERT INTO public.flirt_guys (
    created_by,
    assigned_to,
    name,
    photo_path,
    status,
    interest_level,
    hotness_level,
    face_score,
    body_score,
    dick_size_cm,
    jealousy_level,
    is_slave
  ) VALUES (
    v_queen,
    v_slave.id,
    COALESCE(NULLIF(trim(v_slave.username), ''), 'Slave'),
    NULL,
    'looked',
    50,
    50,
    50,
    v_overall,
    19,
    50,
    true
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_slave_flirt_guy() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_slave_flirt_body_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_slave_flirt_body_score(UUID) TO service_role;

-- Keep slave flirt body in sync when Queen rates a progress pic.
CREATE OR REPLACE FUNCTION public.rate_weekly_progress_pic(
  p_pic_id UUID,
  p_overall INT,
  p_arms INT,
  p_shoulders INT,
  p_chest INT,
  p_abs INT,
  p_back INT,
  p_butt INT
)
RETURNS public.workout_weekly_pics
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pic public.workout_weekly_pics;
  v_queen UUID := auth.uid();
  v_latest public.workout_weekly_pics;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'queen' THEN
    RAISE EXCEPTION 'Only Queen can rate progress pics';
  END IF;

  IF p_overall IS NULL OR p_arms IS NULL OR p_shoulders IS NULL
     OR p_chest IS NULL OR p_abs IS NULL OR p_back IS NULL OR p_butt IS NULL THEN
    RAISE EXCEPTION 'All rating scores are required';
  END IF;

  IF p_overall NOT BETWEEN 0 AND 100
     OR p_arms NOT BETWEEN 0 AND 100
     OR p_shoulders NOT BETWEEN 0 AND 100
     OR p_chest NOT BETWEEN 0 AND 100
     OR p_abs NOT BETWEEN 0 AND 100
     OR p_back NOT BETWEEN 0 AND 100
     OR p_butt NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION 'Scores must be between 0 and 100';
  END IF;

  SELECT * INTO v_pic
  FROM public.workout_weekly_pics
  WHERE id = p_pic_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Progress pic not found';
  END IF;

  IF v_pic.file_path IS NULL THEN
    RAISE EXCEPTION 'Upload a photo before rating this week';
  END IF;

  UPDATE public.workout_weekly_pics
  SET
    rating_overall = p_overall,
    rating_arms = p_arms,
    rating_shoulders = p_shoulders,
    rating_chest = p_chest,
    rating_abs = p_abs,
    rating_back = p_back,
    rating_butt = p_butt,
    rated_by = v_queen,
    rated_at = v_now,
    updated_at = v_now
  WHERE id = p_pic_id
  RETURNING * INTO v_pic;

  INSERT INTO public.body_rating_snapshots (
    rated_by,
    rated_for,
    overall,
    arms,
    shoulders,
    chest,
    abs,
    back,
    butt,
    week_start,
    rated_at,
    weekly_pic_id
  ) VALUES (
    v_queen,
    v_pic.created_by,
    p_overall,
    p_arms,
    p_shoulders,
    p_chest,
    p_abs,
    p_back,
    p_butt,
    v_pic.week_start,
    v_now,
    v_pic.id
  )
  ON CONFLICT (rated_for, week_start) DO UPDATE SET
    rated_by = EXCLUDED.rated_by,
    overall = EXCLUDED.overall,
    arms = EXCLUDED.arms,
    shoulders = EXCLUDED.shoulders,
    chest = EXCLUDED.chest,
    abs = EXCLUDED.abs,
    back = EXCLUDED.back,
    butt = EXCLUDED.butt,
    rated_at = EXCLUDED.rated_at,
    weekly_pic_id = EXCLUDED.weekly_pic_id;

  SELECT * INTO v_latest
  FROM public.workout_weekly_pics
  WHERE created_by = v_pic.created_by
    AND rating_overall IS NOT NULL
  ORDER BY week_start DESC, rated_at DESC NULLS LAST
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.body_ratings (
      rated_by,
      rated_for,
      overall,
      arms,
      shoulders,
      chest,
      abs,
      back,
      butt,
      updated_at
    ) VALUES (
      v_queen,
      v_latest.created_by,
      v_latest.rating_overall,
      v_latest.rating_arms,
      v_latest.rating_shoulders,
      v_latest.rating_chest,
      v_latest.rating_abs,
      v_latest.rating_back,
      v_latest.rating_butt,
      COALESCE(v_latest.rated_at, v_now)
    )
    ON CONFLICT (rated_for) DO UPDATE SET
      rated_by = EXCLUDED.rated_by,
      overall = EXCLUDED.overall,
      arms = EXCLUDED.arms,
      shoulders = EXCLUDED.shoulders,
      chest = EXCLUDED.chest,
      abs = EXCLUDED.abs,
      back = EXCLUDED.back,
      butt = EXCLUDED.butt,
      updated_at = EXCLUDED.updated_at;

    PERFORM public.sync_slave_flirt_body_score(v_latest.created_by);
  END IF;

  RETURN v_pic;
END;
$$;

-- Seed the slave flirt card now.
DO $$
BEGIN
  PERFORM public.ensure_slave_flirt_guy();
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

NOTIFY pgrst, 'reload schema';
