-- Geotag columns for teases, rewards, and submission images

ALTER TABLE public.teases
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS accuracy_m DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_source TEXT;

ALTER TABLE public.teases DROP CONSTRAINT IF EXISTS teases_location_source_check;
ALTER TABLE public.teases ADD CONSTRAINT teases_location_source_check
  CHECK (location_source IS NULL OR location_source = ANY (ARRAY['exif'::text, 'device'::text]));

ALTER TABLE public.rewards
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS accuracy_m DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_source TEXT;

ALTER TABLE public.rewards DROP CONSTRAINT IF EXISTS rewards_location_source_check;
ALTER TABLE public.rewards ADD CONSTRAINT rewards_location_source_check
  CHECK (location_source IS NULL OR location_source = ANY (ARRAY['exif'::text, 'device'::text]));

ALTER TABLE public.submission_media
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS accuracy_m DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_source TEXT;

ALTER TABLE public.submission_media DROP CONSTRAINT IF EXISTS submission_media_location_source_check;
ALTER TABLE public.submission_media ADD CONSTRAINT submission_media_location_source_check
  CHECK (location_source IS NULL OR location_source = ANY (ARRAY['exif'::text, 'device'::text]));
