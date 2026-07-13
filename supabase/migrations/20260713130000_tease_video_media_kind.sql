-- Video teases: media_kind discriminator (path stays in image_path)

ALTER TABLE public.teases
  ADD COLUMN IF NOT EXISTS media_kind TEXT NOT NULL DEFAULT 'image';

ALTER TABLE public.teases
  DROP CONSTRAINT IF EXISTS teases_media_kind_check;

ALTER TABLE public.teases
  ADD CONSTRAINT teases_media_kind_check
  CHECK (media_kind IN ('image', 'video'));

UPDATE public.teases
SET media_kind = 'image'
WHERE media_kind IS NULL OR media_kind = '';

CREATE OR REPLACE FUNCTION public.guard_tease_recipient_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.current_user_role() = 'queen' THEN
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
