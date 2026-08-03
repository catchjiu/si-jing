-- Weekly body rating snapshots + Queen reminder when a week is unrated.

CREATE TABLE public.body_rating_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rated_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rated_for UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  overall INT NOT NULL DEFAULT 0 CHECK (overall BETWEEN 0 AND 100),
  arms INT NOT NULL DEFAULT 0 CHECK (arms BETWEEN 0 AND 100),
  shoulders INT NOT NULL DEFAULT 0 CHECK (shoulders BETWEEN 0 AND 100),
  chest INT NOT NULL DEFAULT 0 CHECK (chest BETWEEN 0 AND 100),
  abs INT NOT NULL DEFAULT 0 CHECK (abs BETWEEN 0 AND 100),
  back INT NOT NULL DEFAULT 0 CHECK (back BETWEEN 0 AND 100),
  butt INT NOT NULL DEFAULT 0 CHECK (butt BETWEEN 0 AND 100),
  week_start DATE NOT NULL,
  rated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT body_rating_snapshots_unique UNIQUE (rated_for, week_start)
);

CREATE INDEX idx_body_rating_snapshots_rated_for_week
  ON public.body_rating_snapshots(rated_for, week_start DESC);

ALTER TABLE public.body_rating_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view relevant body_rating_snapshots"
  ON public.body_rating_snapshots FOR SELECT TO authenticated
  USING (
    rated_by = auth.uid()
    OR rated_for = auth.uid()
    OR public.current_user_role() = 'queen'
  );

CREATE POLICY "Queen can insert body_rating_snapshots"
  ON public.body_rating_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'queen' AND rated_by = auth.uid());

CREATE POLICY "Queen can update body_rating_snapshots"
  ON public.body_rating_snapshots FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'queen')
  WITH CHECK (public.current_user_role() = 'queen');

-- Backfill one snapshot per existing live rating (week of last update).
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
  rated_at
)
SELECT
  br.rated_by,
  br.rated_for,
  br.overall,
  br.arms,
  br.shoulders,
  br.chest,
  br.abs,
  br.back,
  br.butt,
  public.wishlist_week_start_pt(br.updated_at),
  br.updated_at
FROM public.body_ratings br
ON CONFLICT (rated_for, week_start) DO NOTHING;

CREATE OR REPLACE FUNCTION public.snapshot_body_rating_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week DATE;
BEGIN
  v_week := public.wishlist_week_start_pt(COALESCE(NEW.updated_at, now()));

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
    rated_at
  ) VALUES (
    NEW.rated_by,
    NEW.rated_for,
    NEW.overall,
    NEW.arms,
    NEW.shoulders,
    NEW.chest,
    NEW.abs,
    NEW.back,
    NEW.butt,
    v_week,
    COALESCE(NEW.updated_at, now())
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
    rated_at = EXCLUDED.rated_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_body_ratings_snapshot ON public.body_ratings;
CREATE TRIGGER trg_body_ratings_snapshot
  AFTER INSERT OR UPDATE ON public.body_ratings
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_body_rating_on_change();

-- Notify Queen once per week when slave has no rating snapshot for the current week.
CREATE OR REPLACE FUNCTION public.prompt_weekly_body_rating()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week DATE := public.wishlist_week_start_pt();
  v_href TEXT := '/dashboard/workouts?week=' || v_week::TEXT;
  v_slave RECORD;
  v_queen RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_slave IN
    SELECT id FROM public.users WHERE role = 'slave'
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.body_rating_snapshots s
      WHERE s.rated_for = v_slave.id
        AND s.week_start = v_week
    ) THEN
      CONTINUE;
    END IF;

    FOR v_queen IN
      SELECT id FROM public.users WHERE role = 'queen'
    LOOP
      IF EXISTS (
        SELECT 1
        FROM public.notifications n
        WHERE n.user_id = v_queen.id
          AND n.kind = 'body_rating_due'
          AND n.href = v_href
      ) THEN
        CONTINUE;
      END IF;

      INSERT INTO public.notifications (
        user_id,
        kind,
        title,
        body,
        href
      ) VALUES (
        v_queen.id,
        'body_rating_due',
        'Weekly body rating due',
        'Rate his physique for this week''s check-in.',
        v_href
      );

      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.prompt_weekly_body_rating() TO service_role;

NOTIFY pgrst, 'reload schema';
