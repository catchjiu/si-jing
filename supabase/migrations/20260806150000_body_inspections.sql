-- Weekly body inspection protocol (ratings + progress pic + Queen note)

CREATE TABLE IF NOT EXISTS public.body_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slave_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'awaiting_rating', 'reviewed', 'complete')),
  inspection_score INT CHECK (inspection_score IS NULL OR (inspection_score BETWEEN 0 AND 100)),
  queen_note TEXT,
  reply_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  slave_reply TEXT,
  slave_replied_at TIMESTAMPTZ,
  queen_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT body_inspections_week_unique UNIQUE (slave_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_body_inspections_week
  ON public.body_inspections (week_start DESC);

ALTER TABLE public.body_inspections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view body inspections" ON public.body_inspections;
CREATE POLICY "Users can view body inspections"
  ON public.body_inspections FOR SELECT TO authenticated
  USING (
    slave_id = auth.uid()
    OR public.current_user_role() = 'queen'
  );

DROP POLICY IF EXISTS "Queen can insert body inspections" ON public.body_inspections;
CREATE POLICY "Queen can insert body inspections"
  ON public.body_inspections FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'queen');

DROP POLICY IF EXISTS "Queen can update body inspections" ON public.body_inspections;
CREATE POLICY "Queen can update body inspections"
  ON public.body_inspections FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'queen')
  WITH CHECK (public.current_user_role() = 'queen');

DROP POLICY IF EXISTS "Slave can reply on body inspections" ON public.body_inspections;
CREATE POLICY "Slave can reply on body inspections"
  ON public.body_inspections FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'slave'
    AND slave_id = auth.uid()
  )
  WITH CHECK (
    public.current_user_role() = 'slave'
    AND slave_id = auth.uid()
  );

CREATE OR REPLACE FUNCTION public.set_body_inspections_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS body_inspections_updated_at ON public.body_inspections;
CREATE TRIGGER body_inspections_updated_at
  BEFORE UPDATE ON public.body_inspections
  FOR EACH ROW
  EXECUTE FUNCTION public.set_body_inspections_updated_at();

CREATE OR REPLACE FUNCTION public.guard_body_inspection_slave_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.current_user_role() = 'slave' THEN
    IF NEW.slave_id IS DISTINCT FROM OLD.slave_id
       OR NEW.week_start IS DISTINCT FROM OLD.week_start
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.inspection_score IS DISTINCT FROM OLD.inspection_score
       OR NEW.queen_note IS DISTINCT FROM OLD.queen_note
       OR NEW.reply_allowed IS DISTINCT FROM OLD.reply_allowed
       OR NEW.queen_reviewed_at IS DISTINCT FROM OLD.queen_reviewed_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Slave may only submit an inspection reply when allowed';
    END IF;
    IF NOT OLD.reply_allowed THEN
      RAISE EXCEPTION 'Queen has not allowed a reply yet';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_body_inspection_slave_update ON public.body_inspections;
CREATE TRIGGER trg_guard_body_inspection_slave_update
  BEFORE UPDATE ON public.body_inspections
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_body_inspection_slave_update();

CREATE OR REPLACE FUNCTION public.ensure_body_inspection_week(
  p_week_start DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slave_id UUID;
  week_key DATE;
  inspection_id UUID;
BEGIN
  week_key := COALESCE(p_week_start, public.wishlist_week_start_pt(NOW()));

  SELECT id INTO v_slave_id FROM public.users WHERE role = 'slave' LIMIT 1;
  IF v_slave_id IS NULL THEN
    RAISE EXCEPTION 'No slave account found';
  END IF;

  INSERT INTO public.body_inspections (slave_id, week_start, status)
  VALUES (v_slave_id, week_key, 'open')
  ON CONFLICT (slave_id, week_start) DO UPDATE
    SET updated_at = public.body_inspections.updated_at
  RETURNING id INTO inspection_id;

  RETURN inspection_id;
END;
$$;

-- Prompt slave when this week's progress pic is missing
CREATE OR REPLACE FUNCTION public.prompt_weekly_progress_pic()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  slave_rec RECORD;
  week_key DATE := public.wishlist_week_start_pt(NOW());
  prompted INT := 0;
  has_pic BOOLEAN;
BEGIN
  FOR slave_rec IN SELECT id FROM public.users WHERE role = 'slave' LOOP
    SELECT EXISTS (
      SELECT 1
      FROM public.workout_weekly_pics p
      WHERE p.created_by = slave_rec.id
        AND p.week_start = week_key
        AND p.file_path IS NOT NULL
        AND char_length(trim(p.file_path)) > 0
    ) INTO has_pic;

    IF NOT has_pic THEN
      PERFORM public.ensure_body_inspection_week(week_key);

      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = slave_rec.id
          AND n.kind = 'body_inspection_pic_due'
          AND n.created_at > NOW() - INTERVAL '2 days'
      ) THEN
        INSERT INTO public.notifications (user_id, kind, title, body, href)
        VALUES (
          slave_rec.id,
          'body_inspection_pic_due',
          'Weekly inspection photo due',
          'Upload this week''s progress pic for Queen''s inspection.',
          '/dashboard/workouts'
        );
        prompted := prompted + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN prompted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_body_inspection_week(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prompt_weekly_progress_pic() TO authenticated;

NOTIFY pgrst, 'reload schema';
