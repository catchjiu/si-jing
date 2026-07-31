-- Remove unused Shop; add Workout Tracker

-- Drop shop
DROP FUNCTION IF EXISTS public.purchase_shop_item(UUID);
DROP TABLE IF EXISTS public.shop_purchases CASCADE;
DROP TABLE IF EXISTS public.shop_items CASCADE;

ALTER TABLE public.direct_messages
  DROP CONSTRAINT IF EXISTS direct_messages_attachment_type_check;

ALTER TABLE public.direct_messages
  ADD CONSTRAINT direct_messages_attachment_type_check
  CHECK (
    attachment_type IS NULL
    OR attachment_type IN (
      'tease', 'task', 'punishment', 'reward', 'request',
      'date', 'journal', 'submission', 'wishlist', 'worship',
      'worship_assignment', 'denial'
    )
  );

-- Body ratings (Queen rates slave 0–100)
CREATE TABLE public.body_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rated_by UUID NOT NULL REFERENCES public.users(id),
  rated_for UUID NOT NULL REFERENCES public.users(id),
  overall INT NOT NULL DEFAULT 0 CHECK (overall BETWEEN 0 AND 100),
  arms INT NOT NULL DEFAULT 0 CHECK (arms BETWEEN 0 AND 100),
  shoulders INT NOT NULL DEFAULT 0 CHECK (shoulders BETWEEN 0 AND 100),
  chest INT NOT NULL DEFAULT 0 CHECK (chest BETWEEN 0 AND 100),
  abs INT NOT NULL DEFAULT 0 CHECK (abs BETWEEN 0 AND 100),
  back INT NOT NULL DEFAULT 0 CHECK (back BETWEEN 0 AND 100),
  butt INT NOT NULL DEFAULT 0 CHECK (butt BETWEEN 0 AND 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT body_ratings_rated_for_unique UNIQUE (rated_for)
);

CREATE INDEX idx_body_ratings_rated_for ON public.body_ratings(rated_for);

ALTER TABLE public.body_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view relevant body_ratings"
  ON public.body_ratings FOR SELECT TO authenticated
  USING (
    rated_by = auth.uid()
    OR rated_for = auth.uid()
    OR public.current_user_role() = 'queen'
  );

CREATE POLICY "Queen can insert body_ratings"
  ON public.body_ratings FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'queen' AND rated_by = auth.uid());

CREATE POLICY "Queen can update body_ratings"
  ON public.body_ratings FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'queen')
  WITH CHECK (public.current_user_role() = 'queen');

CREATE POLICY "Queen can delete body_ratings"
  ON public.body_ratings FOR DELETE TO authenticated
  USING (public.current_user_role() = 'queen');

CREATE OR REPLACE FUNCTION public.touch_body_ratings_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_body_ratings_updated_at
  BEFORE UPDATE ON public.body_ratings
  FOR EACH ROW EXECUTE FUNCTION public.touch_body_ratings_updated_at();

-- Workout sessions
CREATE TABLE public.workout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.users(id),
  assigned_to UUID NOT NULL REFERENCES public.users(id),
  performed_at DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_minutes INT CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
  queen_impressed INT CHECK (queen_impressed IS NULL OR queen_impressed BETWEEN 0 AND 100),
  queen_note TEXT,
  queen_reacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workout_sessions_created_by ON public.workout_sessions(created_by, performed_at DESC);
CREATE INDEX idx_workout_sessions_assigned_to ON public.workout_sessions(assigned_to, performed_at DESC);

ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view relevant workout_sessions"
  ON public.workout_sessions FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR public.current_user_role() = 'queen'
  );

CREATE POLICY "Slave can insert workout_sessions"
  ON public.workout_sessions FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.current_user_role() = 'slave'
  );

CREATE POLICY "Slave can update own workout_sessions"
  ON public.workout_sessions FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND public.current_user_role() = 'slave')
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Queen can update workout_sessions reactions"
  ON public.workout_sessions FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'queen')
  WITH CHECK (public.current_user_role() = 'queen');

CREATE POLICY "Slave can delete own workout_sessions"
  ON public.workout_sessions FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.current_user_role() = 'queen');

CREATE OR REPLACE FUNCTION public.guard_workout_session_queen_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.current_user_role() = 'queen' AND NEW.created_by IS DISTINCT FROM auth.uid() THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
       OR NEW.performed_at IS DISTINCT FROM OLD.performed_at
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.started_at IS DISTINCT FROM OLD.started_at
       OR NEW.ended_at IS DISTINCT FROM OLD.ended_at
       OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Queen may only update reaction fields on workout_sessions';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_workout_session_queen_update
  BEFORE UPDATE ON public.workout_sessions
  FOR EACH ROW EXECUTE FUNCTION public.guard_workout_session_queen_update();

-- Workout sets
CREATE TABLE public.workout_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  body_part TEXT NOT NULL CHECK (body_part IN ('arms','shoulders','chest','abs','back','butt')),
  exercise_name TEXT NOT NULL,
  set_number INT NOT NULL DEFAULT 1 CHECK (set_number >= 1),
  reps INT NOT NULL DEFAULT 1 CHECK (reps >= 1),
  weight NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (weight >= 0),
  unit TEXT NOT NULL DEFAULT 'kg',
  sort_order INT NOT NULL DEFAULT 0,
  is_pr BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workout_sets_exercise_len CHECK (char_length(trim(exercise_name)) > 0)
);

CREATE INDEX idx_workout_sets_session ON public.workout_sets(session_id, sort_order, set_number);
CREATE INDEX idx_workout_sets_exercise ON public.workout_sets(exercise_name, body_part);

ALTER TABLE public.workout_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view workout_sets on relevant sessions"
  ON public.workout_sets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = workout_sets.session_id
        AND (
          s.created_by = auth.uid()
          OR s.assigned_to = auth.uid()
          OR public.current_user_role() = 'queen'
        )
    )
  );

CREATE POLICY "Slave can insert workout_sets"
  ON public.workout_sets FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'slave'
    AND EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = workout_sets.session_id AND s.created_by = auth.uid()
    )
  );

CREATE POLICY "Slave can update workout_sets"
  ON public.workout_sets FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'slave'
    AND EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = workout_sets.session_id AND s.created_by = auth.uid()
    )
  );

CREATE POLICY "Slave or queen can delete workout_sets"
  ON public.workout_sets FOR DELETE TO authenticated
  USING (
    public.current_user_role() = 'queen'
    OR EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = workout_sets.session_id AND s.created_by = auth.uid()
    )
  );

-- Workout media
CREATE TABLE public.workout_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  media_kind TEXT NOT NULL CHECK (media_kind IN ('image', 'video')),
  file_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workout_media_session ON public.workout_media(session_id, created_at);

ALTER TABLE public.workout_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view workout_media on relevant sessions"
  ON public.workout_media FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = workout_media.session_id
        AND (
          s.created_by = auth.uid()
          OR s.assigned_to = auth.uid()
          OR public.current_user_role() = 'queen'
        )
    )
  );

CREATE POLICY "Slave can insert workout_media"
  ON public.workout_media FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'slave'
    AND EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = workout_media.session_id AND s.created_by = auth.uid()
    )
  );

CREATE POLICY "Slave or queen can delete workout_media"
  ON public.workout_media FOR DELETE TO authenticated
  USING (
    public.current_user_role() = 'queen'
    OR EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = workout_media.session_id AND s.created_by = auth.uid()
    )
  );

-- Weekly progress pics over time (one dated photo per week)
CREATE TABLE public.workout_weekly_pics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.users(id),
  week_start DATE NOT NULL,
  taken_on DATE,
  file_path TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workout_weekly_pics_unique UNIQUE (created_by, week_start)
);

CREATE INDEX idx_workout_weekly_pics_created_by
  ON public.workout_weekly_pics(created_by, week_start DESC);

ALTER TABLE public.workout_weekly_pics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view workout_weekly_pics"
  ON public.workout_weekly_pics FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.current_user_role() = 'queen'
  );

CREATE POLICY "Slave can insert workout_weekly_pics"
  ON public.workout_weekly_pics FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.current_user_role() = 'slave');

CREATE POLICY "Slave can update own workout_weekly_pics"
  ON public.workout_weekly_pics FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Slave or queen can delete workout_weekly_pics"
  ON public.workout_weekly_pics FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.current_user_role() = 'queen');

CREATE OR REPLACE FUNCTION public.touch_workout_weekly_pics_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_workout_weekly_pics_updated_at
  BEFORE UPDATE ON public.workout_weekly_pics
  FOR EACH ROW EXECUTE FUNCTION public.touch_workout_weekly_pics_updated_at();

-- Storage
INSERT INTO storage.buckets (id, name, public)
VALUES ('workouts', 'workouts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can upload workouts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'workouts');

CREATE POLICY "Authenticated can view workouts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'workouts');

CREATE POLICY "Owners and queen can delete workouts files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'workouts'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR public.current_user_role() = 'queen'
    )
  );

NOTIFY pgrst, 'reload schema';
