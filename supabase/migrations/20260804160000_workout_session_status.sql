-- Workout session lifecycle: plan ahead, log in progress, complete, or skip (rest day)

ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed'
  CHECK (status IN ('planned', 'in_progress', 'completed', 'skipped'));

UPDATE public.workout_sessions SET status = 'completed' WHERE status IS NULL;

CREATE INDEX IF NOT EXISTS idx_workout_sessions_status
  ON public.workout_sessions(created_by, status, performed_at DESC);

-- Queen guard: status is slave-owned metadata, not a reaction field
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
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Queen may only update reaction fields on workout_sessions';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
