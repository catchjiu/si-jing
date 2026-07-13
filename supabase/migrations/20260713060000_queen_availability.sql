-- Queen availability status for slave dashboard

ALTER TABLE public.user_status
  ADD COLUMN IF NOT EXISTS availability TEXT;

UPDATE public.user_status
SET availability = 'available'
WHERE availability IS NULL
  AND user_id IN (SELECT id FROM public.users WHERE role = 'queen');

ALTER TABLE public.user_status
  DROP CONSTRAINT IF EXISTS user_status_availability_check;

ALTER TABLE public.user_status
  ADD CONSTRAINT user_status_availability_check
  CHECK (
    availability IS NULL
    OR availability IN ('working', 'busy', 'dating', 'available')
  );
