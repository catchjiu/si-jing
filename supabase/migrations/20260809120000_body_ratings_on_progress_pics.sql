-- Attach body ratings to each weekly progress pic so history is not overwritten.

ALTER TABLE public.workout_weekly_pics
  ADD COLUMN IF NOT EXISTS rating_overall INT CHECK (
    rating_overall IS NULL OR rating_overall BETWEEN 0 AND 100
  ),
  ADD COLUMN IF NOT EXISTS rating_arms INT CHECK (
    rating_arms IS NULL OR rating_arms BETWEEN 0 AND 100
  ),
  ADD COLUMN IF NOT EXISTS rating_shoulders INT CHECK (
    rating_shoulders IS NULL OR rating_shoulders BETWEEN 0 AND 100
  ),
  ADD COLUMN IF NOT EXISTS rating_chest INT CHECK (
    rating_chest IS NULL OR rating_chest BETWEEN 0 AND 100
  ),
  ADD COLUMN IF NOT EXISTS rating_abs INT CHECK (
    rating_abs IS NULL OR rating_abs BETWEEN 0 AND 100
  ),
  ADD COLUMN IF NOT EXISTS rating_back INT CHECK (
    rating_back IS NULL OR rating_back BETWEEN 0 AND 100
  ),
  ADD COLUMN IF NOT EXISTS rating_butt INT CHECK (
    rating_butt IS NULL OR rating_butt BETWEEN 0 AND 100
  ),
  ADD COLUMN IF NOT EXISTS rated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rated_at TIMESTAMPTZ;

ALTER TABLE public.body_rating_snapshots
  ADD COLUMN IF NOT EXISTS weekly_pic_id UUID REFERENCES public.workout_weekly_pics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_body_rating_snapshots_weekly_pic
  ON public.body_rating_snapshots(weekly_pic_id);

-- Stop live body_ratings updates from clobbering the current week's snapshot.
-- Snapshots are written explicitly when Queen rates a progress pic.
DROP TRIGGER IF EXISTS trg_body_ratings_snapshot ON public.body_ratings;

-- Backfill pic ratings + snapshot links from existing weekly snapshots.
UPDATE public.workout_weekly_pics p
SET
  rating_overall = s.overall,
  rating_arms = s.arms,
  rating_shoulders = s.shoulders,
  rating_chest = s.chest,
  rating_abs = s.abs,
  rating_back = s.back,
  rating_butt = s.butt,
  rated_by = s.rated_by,
  rated_at = s.rated_at
FROM public.body_rating_snapshots s
WHERE s.rated_for = p.created_by
  AND s.week_start = p.week_start
  AND p.rating_overall IS NULL;

UPDATE public.body_rating_snapshots s
SET weekly_pic_id = p.id
FROM public.workout_weekly_pics p
WHERE s.weekly_pic_id IS NULL
  AND p.created_by = s.rated_for
  AND p.week_start = s.week_start;

-- Rate a specific progress pic; keeps other weeks' ratings intact.
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

  -- Live body_ratings mirrors the most recent rated progress pic.
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
  END IF;

  RETURN v_pic;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rate_weekly_progress_pic(
  UUID, INT, INT, INT, INT, INT, INT, INT
) TO authenticated;

NOTIFY pgrst, 'reload schema';
