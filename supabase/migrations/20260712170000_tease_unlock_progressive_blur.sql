-- Progressive blur reduction as each unlock task is completed
CREATE OR REPLACE FUNCTION public.maybe_unblur_tease_on_tasks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining INT;
  before_remaining INT;
  cur_blur INT;
  new_blur INT;
BEGIN
  IF NEW.completed_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO remaining
  FROM public.tease_unlock_tasks
  WHERE tease_id = NEW.tease_id
    AND completed_at IS NULL;

  IF remaining = 0 THEN
    UPDATE public.teases
    SET
      is_blurred = false,
      blur_amount = 0,
      unblurred_at = COALESCE(unblurred_at, NOW())
    WHERE id = NEW.tease_id;
    RETURN NEW;
  END IF;

  before_remaining := remaining + 1;
  SELECT COALESCE(blur_amount, 20) INTO cur_blur
  FROM public.teases
  WHERE id = NEW.tease_id;

  IF cur_blur <= 0 THEN
    cur_blur := 20;
  END IF;

  new_blur := GREATEST(
    1,
    CEIL(cur_blur::numeric * remaining / before_remaining)
  );

  UPDATE public.teases
  SET
    blur_amount = new_blur,
    is_blurred = true,
    unblurred_at = NULL
  WHERE id = NEW.tease_id;

  RETURN NEW;
END;
$$;
