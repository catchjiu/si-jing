-- Queen weekly work schedule → auto-sets availability to working

ALTER TABLE public.user_status
  ADD COLUMN IF NOT EXISTS availability_source TEXT;

ALTER TABLE public.user_status
  DROP CONSTRAINT IF EXISTS user_status_availability_source_check;

ALTER TABLE public.user_status
  ADD CONSTRAINT user_status_availability_source_check
  CHECK (
    availability_source IS NULL
    OR availability_source IN ('manual', 'schedule')
  );

CREATE TABLE IF NOT EXISTS public.queen_work_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT queen_work_schedule_time_order CHECK (end_time > start_time),
  CONSTRAINT queen_work_schedule_unique_day UNIQUE (user_id, week_start, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_queen_work_schedule_user_week
  ON public.queen_work_schedule (user_id, week_start);

ALTER TABLE public.queen_work_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Queen manages own work schedule" ON public.queen_work_schedule;
CREATE POLICY "Queen manages own work schedule"
  ON public.queen_work_schedule
  FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'queen'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'queen'
    )
  );

DROP POLICY IF EXISTS "Authenticated can read queen work schedule" ON public.queen_work_schedule;
CREATE POLICY "Authenticated can read queen work schedule"
  ON public.queen_work_schedule
  FOR SELECT
  TO authenticated
  USING (true);

-- Monday (ISO) of the calendar week containing `d` in UTC date terms is not enough;
-- callers pass the Monday date already computed in the Queen's timezone.
CREATE OR REPLACE FUNCTION public.apply_queen_work_schedules()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INTEGER := 0;
  rec RECORD;
  tz TEXT;
  local_now TIMESTAMP;
  local_date DATE;
  monday DATE;
  dow SMALLINT;
  local_time TIME;
  in_window BOOLEAN;
  cur_avail TEXT;
  cur_source TEXT;
BEGIN
  FOR rec IN
    SELECT u.id AS queen_id
    FROM public.users u
    WHERE u.role = 'queen'
  LOOP
    -- Prefer timezone from this week's schedule rows; fall back to UTC
    SELECT s.timezone INTO tz
    FROM public.queen_work_schedule s
    WHERE s.user_id = rec.queen_id
    ORDER BY s.week_start DESC, s.updated_at DESC
    LIMIT 1;

    tz := COALESCE(tz, 'UTC');

    BEGIN
      local_now := (now() AT TIME ZONE tz);
    EXCEPTION WHEN OTHERS THEN
      local_now := (now() AT TIME ZONE 'UTC');
      tz := 'UTC';
    END;

    local_date := local_now::date;
    -- ISO Monday: date - ((dow+6)%7) where postgres DOW: 0=Sun..6=Sat
    monday := local_date - ((EXTRACT(DOW FROM local_date)::INTEGER + 6) % 7);
    -- Our day_of_week: 0=Mon .. 6=Sun
    dow := ((EXTRACT(DOW FROM local_date)::INTEGER + 6) % 7)::SMALLINT;
    local_time := local_now::time;

    SELECT EXISTS (
      SELECT 1
      FROM public.queen_work_schedule s
      WHERE s.user_id = rec.queen_id
        AND s.week_start = monday
        AND s.day_of_week = dow
        AND s.enabled = TRUE
        AND local_time >= s.start_time
        AND local_time < s.end_time
    ) INTO in_window;

    SELECT us.availability, us.availability_source
    INTO cur_avail, cur_source
    FROM public.user_status us
    WHERE us.user_id = rec.queen_id;

    IF in_window THEN
      -- Do not override busy/dating set manually
      IF cur_avail IS NULL
         OR cur_avail = 'available'
         OR cur_avail = 'working'
         OR COALESCE(cur_source, '') = 'schedule' THEN
        INSERT INTO public.user_status (
          user_id, availability, availability_source, updated_at
        )
        VALUES (
          rec.queen_id, 'working', 'schedule', now()
        )
        ON CONFLICT (user_id) DO UPDATE
        SET
          availability = EXCLUDED.availability,
          availability_source = EXCLUDED.availability_source,
          updated_at = EXCLUDED.updated_at;

        updated_count := updated_count + 1;
      END IF;
    ELSE
      -- Clear working only if schedule put her there
      IF cur_avail = 'working' AND COALESCE(cur_source, '') = 'schedule' THEN
        UPDATE public.user_status
        SET
          availability = 'available',
          availability_source = 'schedule',
          updated_at = now()
        WHERE user_id = rec.queen_id;

        updated_count := updated_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_queen_work_schedules() TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_queen_work_schedules() TO service_role;

NOTIFY pgrst, 'reload schema';
