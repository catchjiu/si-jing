-- Prevent slave from changing Queen-only date fields (thoughts, featured video)

CREATE OR REPLACE FUNCTION public.guard_queen_date_slave_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.current_user_role() <> 'queen' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.thoughts_text IS DISTINCT FROM OLD.thoughts_text
       OR NEW.youtube_url IS DISTINCT FROM OLD.youtube_url THEN
      RAISE EXCEPTION 'Only reaction fields may be updated by the recipient';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
