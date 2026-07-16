-- After work ends: return Queen to Available unless she manually overrode status.
-- During work: do not override manual busy/dating/available picks.

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
    monday := local_date - ((EXTRACT(DOW FROM local_date)::INTEGER + 6) % 7);
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
      -- Never override a manual status (busy, dating, or available off-schedule)
      IF COALESCE(cur_source, '') <> 'manual' THEN
        IF cur_avail IS NULL
           OR cur_avail IN ('available', 'working') THEN
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
      END IF;
    ELSE
      -- Work finished: back to Available if schedule put her in Working
      IF cur_avail = 'working' AND COALESCE(cur_source, '') = 'schedule' THEN
        UPDATE public.user_status
        SET
          availability = 'available',
          availability_source = NULL,
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
