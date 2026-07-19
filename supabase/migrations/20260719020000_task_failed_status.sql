-- Allow slave to mark a task failed (with apology submission).

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_status_check;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_status_check
  CHECK (
    status IN (
      'pending',
      'in_progress',
      'submitted',
      'approved',
      'rejected',
      'failed'
    )
  );

NOTIFY pgrst, 'reload schema';
