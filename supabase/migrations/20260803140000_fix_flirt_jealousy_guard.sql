-- Fix: allow slave jealousy saves when touch_flirt_guys_updated_at bumps updated_at

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
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Only jealousy may be updated by the assigned slave';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
