-- Progress pics over time: one dated photo per week
ALTER TABLE public.workout_weekly_pics
  ADD COLUMN IF NOT EXISTS taken_on DATE,
  ADD COLUMN IF NOT EXISTS file_path TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workout_weekly_pics'
      AND column_name = 'before_path'
  ) THEN
    UPDATE public.workout_weekly_pics SET
      taken_on = COALESCE(after_date, before_date, week_start),
      file_path = COALESCE(after_path, before_path);
  END IF;
END $$;

ALTER TABLE public.workout_weekly_pics
  DROP COLUMN IF EXISTS before_path,
  DROP COLUMN IF EXISTS after_path,
  DROP COLUMN IF EXISTS before_date,
  DROP COLUMN IF EXISTS after_date;
