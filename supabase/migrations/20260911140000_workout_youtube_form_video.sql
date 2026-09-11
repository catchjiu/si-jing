-- Form videos can be an upload or a YouTube link

ALTER TABLE public.workout_media
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'upload',
  ADD COLUMN IF NOT EXISTS external_url TEXT;

ALTER TABLE public.workout_media
  DROP CONSTRAINT IF EXISTS workout_media_source_kind_check;

ALTER TABLE public.workout_media
  ADD CONSTRAINT workout_media_source_kind_check
  CHECK (source IN ('upload', 'youtube'));

ALTER TABLE public.workout_media
  ALTER COLUMN file_path DROP NOT NULL;

ALTER TABLE public.workout_media
  DROP CONSTRAINT IF EXISTS workout_media_source_payload_check;

ALTER TABLE public.workout_media
  ADD CONSTRAINT workout_media_source_payload_check
  CHECK (
    (
      source = 'upload'
      AND file_path IS NOT NULL
      AND char_length(trim(file_path)) > 0
      AND external_url IS NULL
    )
    OR (
      source = 'youtube'
      AND external_url IS NOT NULL
      AND char_length(trim(external_url)) > 0
    )
  );

NOTIFY pgrst, 'reload schema';
