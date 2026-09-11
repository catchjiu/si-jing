-- Queen training track: slave plans, Queen logs. Exercise demo video + comments.

ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS athlete_role TEXT NOT NULL DEFAULT 'slave'
  CHECK (athlete_role IN ('slave', 'queen'));

CREATE INDEX IF NOT EXISTS idx_workout_sessions_athlete_role
  ON public.workout_sessions(athlete_role, performed_at DESC);

ALTER TABLE public.workout_media
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'session'
    CHECK (scope IN ('session', 'exercise')),
  ADD COLUMN IF NOT EXISTS exercise_name TEXT,
  ADD COLUMN IF NOT EXISTS body_part TEXT
    CHECK (
      body_part IS NULL
      OR body_part IN ('arms', 'shoulders', 'chest', 'abs', 'back', 'butt')
    );

UPDATE public.workout_media
SET scope = 'session'
WHERE scope IS NULL;

ALTER TABLE public.workout_media
  DROP CONSTRAINT IF EXISTS workout_media_exercise_scope_check;

ALTER TABLE public.workout_media
  ADD CONSTRAINT workout_media_exercise_scope_check
  CHECK (
    (
      scope = 'session'
      AND exercise_name IS NULL
      AND body_part IS NULL
    )
    OR (
      scope = 'exercise'
      AND char_length(trim(exercise_name)) > 0
      AND body_part IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_workout_media_exercise
  ON public.workout_media(session_id, scope, exercise_name);

CREATE OR REPLACE FUNCTION public.guard_workout_session_queen_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.current_user_role() = 'queen' AND NEW.created_by IS DISTINCT FROM auth.uid() THEN
    IF COALESCE(OLD.athlete_role, 'slave') = 'queen' THEN
      IF NEW.created_by IS DISTINCT FROM OLD.created_by
         OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
         OR NEW.athlete_role IS DISTINCT FROM OLD.athlete_role
         OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Queen may not change ownership of workout_sessions';
      END IF;
      RETURN NEW;
    END IF;

    IF NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
       OR NEW.performed_at IS DISTINCT FROM OLD.performed_at
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.started_at IS DISTINCT FROM OLD.started_at
       OR NEW.ended_at IS DISTINCT FROM OLD.ended_at
       OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.athlete_role IS DISTINCT FROM OLD.athlete_role
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Queen may only update reaction fields on workout_sessions';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Queen can insert sets on her workouts" ON public.workout_sets;
CREATE POLICY "Queen can insert sets on her workouts"
  ON public.workout_sets FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'queen'
    AND EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = workout_sets.session_id
        AND s.athlete_role = 'queen'
    )
  );

DROP POLICY IF EXISTS "Queen can update sets on her workouts" ON public.workout_sets;
CREATE POLICY "Queen can update sets on her workouts"
  ON public.workout_sets FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'queen'
    AND EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = workout_sets.session_id
        AND s.athlete_role = 'queen'
    )
  );

DROP POLICY IF EXISTS "Queen can insert media on her workouts" ON public.workout_media;
CREATE POLICY "Queen can insert media on her workouts"
  ON public.workout_media FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'queen'
    AND EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = workout_media.session_id
        AND s.athlete_role = 'queen'
    )
  );

CREATE TABLE IF NOT EXISTS public.workout_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT workout_comments_content_len CHECK (char_length(trim(content)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_workout_comments_session
  ON public.workout_comments(session_id, created_at ASC);

ALTER TABLE public.workout_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view workout comments" ON public.workout_comments;
CREATE POLICY "Users can view workout comments"
  ON public.workout_comments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = workout_comments.session_id
        AND (
          s.created_by = auth.uid()
          OR s.assigned_to = auth.uid()
          OR public.current_user_role() = 'queen'
        )
    )
  );

DROP POLICY IF EXISTS "Queen and slave can send workout comments" ON public.workout_comments;
CREATE POLICY "Queen and slave can send workout comments"
  ON public.workout_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.current_user_role() IN ('queen', 'slave')
    AND EXISTS (
      SELECT 1 FROM public.workout_sessions s
      WHERE s.id = workout_comments.session_id
        AND (
          s.created_by = auth.uid()
          OR s.assigned_to = auth.uid()
          OR public.current_user_role() = 'queen'
        )
    )
  );

DROP POLICY IF EXISTS "Authors and queen can delete workout comments" ON public.workout_comments;
CREATE POLICY "Authors and queen can delete workout comments"
  ON public.workout_comments FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.current_user_role() = 'queen'
  );

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.workout_comments;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE public.direct_messages
  DROP CONSTRAINT IF EXISTS direct_messages_attachment_type_check;

ALTER TABLE public.direct_messages
  ADD CONSTRAINT direct_messages_attachment_type_check
  CHECK (
    attachment_type IS NULL
    OR attachment_type IN (
      'tease', 'task', 'punishment', 'reward', 'request',
      'date', 'journal', 'submission', 'wishlist', 'worship',
      'worship_assignment', 'denial', 'jealousy_mission', 'story', 'fart',
      'creep', 'workout'
    )
  );

NOTIFY pgrst, 'reload schema';
