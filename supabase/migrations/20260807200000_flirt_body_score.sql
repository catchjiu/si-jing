-- Queen rates flirt guys: overall body score (0–100)

ALTER TABLE public.flirt_guys
  ADD COLUMN IF NOT EXISTS body_score INT NOT NULL DEFAULT 50
    CHECK (body_score BETWEEN 0 AND 100);

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
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Only jealousy may be updated by the assigned slave';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
