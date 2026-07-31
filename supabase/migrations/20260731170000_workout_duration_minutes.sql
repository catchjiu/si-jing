-- Manual workout duration (minutes)
ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS duration_minutes INT
  CHECK (duration_minutes IS NULL OR duration_minutes >= 0);

UPDATE public.workout_sessions
SET duration_minutes = GREATEST(
  0,
  ROUND(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60.0)
)::INT
WHERE duration_minutes IS NULL
  AND started_at IS NOT NULL
  AND ended_at IS NOT NULL
  AND ended_at >= started_at;

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
