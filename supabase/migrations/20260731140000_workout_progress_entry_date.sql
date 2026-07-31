-- Progress pics: dated entries (not locked to current week only)
ALTER TABLE public.workout_weekly_pics
  RENAME COLUMN week_start TO entry_date;

ALTER TABLE public.workout_weekly_pics
  DROP CONSTRAINT IF EXISTS workout_weekly_pics_unique;

ALTER TABLE public.workout_weekly_pics
  ADD CONSTRAINT workout_weekly_pics_unique UNIQUE (created_by, entry_date);

DROP INDEX IF EXISTS idx_workout_weekly_pics_created_by;
CREATE INDEX idx_workout_weekly_pics_created_by
  ON public.workout_weekly_pics(created_by, entry_date DESC);
