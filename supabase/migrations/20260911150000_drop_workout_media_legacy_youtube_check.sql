-- An earlier YouTube attempt left workout_media_source_check, which
-- still required file_path for media_kind=video and blocked link saves.

ALTER TABLE public.workout_media
  DROP CONSTRAINT IF EXISTS workout_media_source_check;

ALTER TABLE public.workout_media
  DROP COLUMN IF EXISTS youtube_url;

NOTIFY pgrst, 'reload schema';
