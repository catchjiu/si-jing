-- Unlock tasks update tease blur via trigger; guard was blocking that for the slave session.

CREATE OR REPLACE FUNCTION public.guard_tease_recipient_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.current_user_role() = 'queen' THEN
    RETURN NEW;
  END IF;

  -- maybe_unblur_tease_on_tasks() sets this for the transaction only
  IF current_setting('app.tease_unlock_blur_update', true) = 'on' THEN
    IF NEW.sent_by IS DISTINCT FROM OLD.sent_by
       OR NEW.sent_to IS DISTINCT FROM OLD.sent_to
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.message IS DISTINCT FROM OLD.message
       OR NEW.image_path IS DISTINCT FROM OLD.image_path
       OR NEW.media_kind IS DISTINCT FROM OLD.media_kind
       OR NEW.unlocks_at IS DISTINCT FROM OLD.unlocks_at
       OR NEW.unlocked_notified_at IS DISTINCT FROM OLD.unlocked_notified_at
       OR NEW.view_duration_seconds IS DISTINCT FROM OLD.view_duration_seconds
       OR NEW.viewed_at IS DISTINCT FROM OLD.viewed_at
       OR NEW.view_started_at IS DISTINCT FROM OLD.view_started_at
       OR NEW.expired_at IS DISTINCT FROM OLD.expired_at
       OR NEW.screenshot_flagged_at IS DISTINCT FROM OLD.screenshot_flagged_at
       OR NEW.reaction_score IS DISTINCT FROM OLD.reaction_score
       OR NEW.reacted_at IS DISTINCT FROM OLD.reacted_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.latitude IS DISTINCT FROM OLD.latitude
       OR NEW.longitude IS DISTINCT FROM OLD.longitude
       OR NEW.accuracy_m IS DISTINCT FROM OLD.accuracy_m
       OR NEW.location_source IS DISTINCT FROM OLD.location_source THEN
      RAISE EXCEPTION 'Only blur unlock fields may be updated by unlock tasks';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.sent_by IS DISTINCT FROM OLD.sent_by
     OR NEW.sent_to IS DISTINCT FROM OLD.sent_to
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.image_path IS DISTINCT FROM OLD.image_path
     OR NEW.media_kind IS DISTINCT FROM OLD.media_kind
     OR NEW.unlocks_at IS DISTINCT FROM OLD.unlocks_at
     OR NEW.unlocked_notified_at IS DISTINCT FROM OLD.unlocked_notified_at
     OR NEW.is_blurred IS DISTINCT FROM OLD.is_blurred
     OR NEW.blur_amount IS DISTINCT FROM OLD.blur_amount
     OR NEW.unblurred_at IS DISTINCT FROM OLD.unblurred_at
     OR NEW.view_duration_seconds IS DISTINCT FROM OLD.view_duration_seconds
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.latitude IS DISTINCT FROM OLD.latitude
     OR NEW.longitude IS DISTINCT FROM OLD.longitude
     OR NEW.accuracy_m IS DISTINCT FROM OLD.accuracy_m
     OR NEW.location_source IS DISTINCT FROM OLD.location_source THEN
    RAISE EXCEPTION 'Only view and reaction fields may be updated by the recipient';
  END IF;

  RETURN NEW;
END;
$$;

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

  PERFORM set_config('app.tease_unlock_blur_update', 'on', true);

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

NOTIFY pgrst, 'reload schema';
