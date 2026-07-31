-- Default workout set weight unit to kg
ALTER TABLE public.workout_sets
  ALTER COLUMN unit SET DEFAULT 'kg';

UPDATE public.workout_sets
SET unit = 'kg'
WHERE unit = 'lbs';
