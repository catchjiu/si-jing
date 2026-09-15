-- Daddy/slut tasks live in lane=switch and never mix with Queen/slave (lane=home).

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS lane text NOT NULL DEFAULT 'home';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tasks_lane_check'
      AND conrelid = 'public.tasks'::regclass
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_lane_check
      CHECK (lane IN ('home', 'switch'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_lane_assigned_to_deadline
  ON public.tasks (lane, assigned_to, deadline);

CREATE INDEX IF NOT EXISTS idx_tasks_lane_status
  ON public.tasks (lane, status);

COMMENT ON COLUMN public.tasks.lane IS
  'home = Queen/slave duties; switch = Daddy/slut duties. Never mixed.';

CREATE OR REPLACE FUNCTION public.ensure_recurring_task_occurrences(look_ahead_days integer DEFAULT 7)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tmpl RECORD;
  d DATE;
  end_date DATE;
  key TEXT;
  created INT := 0;
  dl TIMESTAMPTZ;
  due_date DATE;
  day_of_month INT;
  last_day INT;
  v_lane TEXT;
BEGIN
  end_date := CURRENT_DATE + look_ahead_days;

  FOR tmpl IN
    SELECT *
    FROM public.tasks
    WHERE is_recurring = TRUE
      AND parent_task_id IS NULL
      AND recurrence_pattern IS NOT NULL
  LOOP
    v_lane := CASE WHEN tmpl.lane = 'switch' THEN 'switch' ELSE 'home' END;

    IF tmpl.recurrence_pattern = 'daily' THEN
      d := CURRENT_DATE;
      WHILE d <= end_date LOOP
        key := to_char(d, 'YYYY-MM-DD');
        IF NOT EXISTS (
          SELECT 1 FROM public.tasks t
          WHERE t.parent_task_id = tmpl.id AND t.occurrence_key = key
        ) THEN
          dl := timezone('UTC', d::timestamp + (tmpl.deadline AT TIME ZONE 'UTC')::time);
          INSERT INTO public.tasks (
            title, description, assigned_by, assigned_to, deadline, status,
            difficulty_level, is_recurring, recurrence_pattern,
            parent_task_id, occurrence_key, lane
          ) VALUES (
            tmpl.title, tmpl.description, tmpl.assigned_by, tmpl.assigned_to, dl, 'pending',
            tmpl.difficulty_level, FALSE, tmpl.recurrence_pattern,
            tmpl.id, key, v_lane
          );
          created := created + 1;
        END IF;
        d := d + 1;
      END LOOP;

    ELSIF tmpl.recurrence_pattern = 'weekly' THEN
      d := date_trunc('week', CURRENT_DATE::timestamp)::date;
      WHILE d <= end_date LOOP
        key := to_char(d, 'IYYY') || '-W' || lpad(to_char(d, 'IW'), 2, '0');
        IF NOT EXISTS (
          SELECT 1 FROM public.tasks t
          WHERE t.parent_task_id = tmpl.id AND t.occurrence_key = key
        ) THEN
          due_date := d + (EXTRACT(ISODOW FROM (tmpl.deadline AT TIME ZONE 'UTC'))::int - 1);
          dl := timezone('UTC', due_date::timestamp + (tmpl.deadline AT TIME ZONE 'UTC')::time);
          INSERT INTO public.tasks (
            title, description, assigned_by, assigned_to, deadline, status,
            difficulty_level, is_recurring, recurrence_pattern,
            parent_task_id, occurrence_key, lane
          ) VALUES (
            tmpl.title, tmpl.description, tmpl.assigned_by, tmpl.assigned_to, dl, 'pending',
            tmpl.difficulty_level, FALSE, tmpl.recurrence_pattern,
            tmpl.id, key, v_lane
          );
          created := created + 1;
        END IF;
        d := d + 7;
      END LOOP;

    ELSIF tmpl.recurrence_pattern = 'monthly' THEN
      d := date_trunc('month', CURRENT_DATE::timestamp)::date;
      WHILE d <= date_trunc('month', end_date::timestamp)::date LOOP
        key := to_char(d, 'YYYY-MM');
        IF NOT EXISTS (
          SELECT 1 FROM public.tasks t
          WHERE t.parent_task_id = tmpl.id AND t.occurrence_key = key
        ) THEN
          day_of_month := EXTRACT(DAY FROM (tmpl.deadline AT TIME ZONE 'UTC'))::int;
          last_day := EXTRACT(DAY FROM (date_trunc('month', d) + interval '1 month - 1 day'))::int;
          due_date := d + (LEAST(day_of_month, last_day) - 1);
          dl := timezone('UTC', due_date::timestamp + (tmpl.deadline AT TIME ZONE 'UTC')::time);
          INSERT INTO public.tasks (
            title, description, assigned_by, assigned_to, deadline, status,
            difficulty_level, is_recurring, recurrence_pattern,
            parent_task_id, occurrence_key, lane
          ) VALUES (
            tmpl.title, tmpl.description, tmpl.assigned_by, tmpl.assigned_to, dl, 'pending',
            tmpl.difficulty_level, FALSE, tmpl.recurrence_pattern,
            tmpl.id, key, v_lane
          );
          created := created + 1;
        END IF;
        d := (date_trunc('month', d) + interval '1 month')::date;
      END LOOP;
    END IF;
  END LOOP;

  RETURN created;
END;
$function$;

NOTIFY pgrst, 'reload schema';
