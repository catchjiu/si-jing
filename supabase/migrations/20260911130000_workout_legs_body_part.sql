-- Allow legs as a workout body part (exercises + form videos)

ALTER TABLE public.workout_sets
  DROP CONSTRAINT IF EXISTS workout_sets_body_part_check;

ALTER TABLE public.workout_sets
  ADD CONSTRAINT workout_sets_body_part_check
  CHECK (body_part IN ('arms', 'shoulders', 'chest', 'abs', 'back', 'legs', 'butt'));

ALTER TABLE public.workout_media
  DROP CONSTRAINT IF EXISTS workout_media_body_part_check;

ALTER TABLE public.workout_media
  ADD CONSTRAINT workout_media_body_part_check
  CHECK (
    body_part IS NULL
    OR body_part IN ('arms', 'shoulders', 'chest', 'abs', 'back', 'legs', 'butt')
  );

NOTIFY pgrst, 'reload schema';
