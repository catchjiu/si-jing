-- Special tasks (1-3) that unlock a tease image when all are completed
CREATE TABLE public.tease_unlock_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tease_id UUID NOT NULL REFERENCES public.teases(id) ON DELETE CASCADE,
  sort_order SMALLINT NOT NULL CHECK (sort_order BETWEEN 1 AND 3),
  label TEXT NOT NULL CHECK (char_length(trim(label)) > 0),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tease_id, sort_order)
);

CREATE INDEX idx_tease_unlock_tasks_tease_id ON public.tease_unlock_tasks(tease_id);

ALTER TABLE public.tease_unlock_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view unlock tasks on relevant teases"
  ON public.tease_unlock_tasks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.teases t
      WHERE t.id = tease_unlock_tasks.tease_id
        AND (
          t.sent_by = auth.uid()
          OR t.sent_to = auth.uid()
          OR public.current_user_role() = 'queen'
        )
    )
  );

CREATE POLICY "Queen can create unlock tasks"
  ON public.tease_unlock_tasks FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'queen');

CREATE POLICY "Queen can update unlock tasks"
  ON public.tease_unlock_tasks FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'queen')
  WITH CHECK (public.current_user_role() = 'queen');

CREATE POLICY "Queen can delete unlock tasks"
  ON public.tease_unlock_tasks FOR DELETE TO authenticated
  USING (public.current_user_role() = 'queen');

CREATE POLICY "Slave can complete unlock tasks"
  ON public.tease_unlock_tasks FOR UPDATE TO authenticated
  USING (
    completed_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.teases t
      WHERE t.id = tease_unlock_tasks.tease_id
        AND t.sent_to = auth.uid()
    )
  )
  WITH CHECK (
    completed_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.teases t
      WHERE t.id = tease_unlock_tasks.tease_id
        AND t.sent_to = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.guard_tease_unlock_task_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.current_user_role() <> 'queen' THEN
    IF NEW.label IS DISTINCT FROM OLD.label
       OR NEW.sort_order IS DISTINCT FROM OLD.sort_order
       OR NEW.tease_id IS DISTINCT FROM OLD.tease_id THEN
      RAISE EXCEPTION 'Only completed_at may be updated by the recipient';
    END IF;
    IF OLD.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Task already completed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_tease_unlock_task_fields
  BEFORE UPDATE ON public.tease_unlock_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_tease_unlock_task_fields();

CREATE OR REPLACE FUNCTION public.maybe_unblur_tease_on_tasks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.completed_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tease_unlock_tasks
    WHERE tease_id = NEW.tease_id AND completed_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tease_unlock_tasks WHERE tease_id = NEW.tease_id
  ) THEN
    RETURN NEW;
  END IF;

  UPDATE public.teases
  SET
    is_blurred = false,
    blur_amount = 0,
    unblurred_at = COALESCE(unblurred_at, NOW())
  WHERE id = NEW.tease_id
    AND is_blurred = true;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_maybe_unblur_tease_on_tasks
  AFTER UPDATE OF completed_at ON public.tease_unlock_tasks
  FOR EACH ROW
  WHEN (NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL)
  EXECUTE FUNCTION public.maybe_unblur_tease_on_tasks();
