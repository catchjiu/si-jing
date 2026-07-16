-- Worship entries: distinguish images and videos (uploads and linked teases)

ALTER TABLE public.worship_entries
  ADD COLUMN IF NOT EXISTS media_kind TEXT NOT NULL DEFAULT 'image';

ALTER TABLE public.worship_entries
  DROP CONSTRAINT IF EXISTS worship_entries_media_kind_check;
ALTER TABLE public.worship_entries
  ADD CONSTRAINT worship_entries_media_kind_check
  CHECK (media_kind IN ('image', 'video'));

CREATE OR REPLACE FUNCTION public.guard_worship_queen_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.current_user_role() <> 'queen' THEN
    RETURN NEW;
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.gallery_id IS DISTINCT FROM OLD.gallery_id
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.image_path IS DISTINCT FROM OLD.image_path
     OR NEW.media_kind IS DISTINCT FROM OLD.media_kind
     OR NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket
     OR NEW.source_type IS DISTINCT FROM OLD.source_type
     OR NEW.source_id IS DISTINCT FROM OLD.source_id
     OR NEW.love_level IS DISTINCT FROM OLD.love_level
     OR NEW.latitude IS DISTINCT FROM OLD.latitude
     OR NEW.longitude IS DISTINCT FROM OLD.longitude
     OR NEW.accuracy_m IS DISTINCT FROM OLD.accuracy_m
     OR NEW.location_source IS DISTINCT FROM OLD.location_source
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    RAISE EXCEPTION 'Queen may only update viewed_at on worship entries';
  END IF;

  RETURN NEW;
END;
$$;
