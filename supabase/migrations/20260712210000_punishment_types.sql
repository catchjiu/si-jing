-- Four new punishment types: task_debt, date_timeout, orgasm_ban, privilege_freeze

ALTER TABLE public.punishments DROP CONSTRAINT IF EXISTS punishments_punishment_type_check;
ALTER TABLE public.punishments ADD CONSTRAINT punishments_punishment_type_check
  CHECK (punishment_type = ANY (ARRAY[
    'contact_restriction'::text,
    'custom'::text,
    'task_debt'::text,
    'date_timeout'::text,
    'orgasm_ban'::text,
    'privilege_freeze'::text
  ]));

ALTER TABLE public.punishments DROP CONSTRAINT IF EXISTS punishments_duration_minutes_check;
ALTER TABLE public.punishments ADD CONSTRAINT punishments_duration_minutes_check
  CHECK (duration_minutes >= 0);

ALTER TABLE public.punishments
  ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clearance_mode TEXT NOT NULL DEFAULT 'timed';

ALTER TABLE public.punishments DROP CONSTRAINT IF EXISTS punishments_clearance_mode_check;
ALTER TABLE public.punishments ADD CONSTRAINT punishments_clearance_mode_check
  CHECK (clearance_mode = ANY (ARRAY['timed'::text, 'task_debt'::text]));

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS punishment_id UUID REFERENCES public.punishments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_punishment_id ON public.tasks(punishment_id);

CREATE OR REPLACE FUNCTION public.complete_expired_punishments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INT;
BEGIN
  UPDATE public.punishments
  SET status = 'completed'
  WHERE status = 'active'
    AND clearance_mode = 'timed'
    AND ends_at <= NOW();
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_active_punishment(
  p_user UUID DEFAULT auth.uid(),
  p_type TEXT DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.punishments p
    WHERE p.issued_to = p_user
      AND p.status = 'active'
      AND (p_type IS NULL OR p.punishment_type = p_type)
      AND (
        (p.clearance_mode = 'task_debt')
        OR (p.clearance_mode = 'timed' AND p.ends_at > NOW())
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_punishment_effect(
  p_user UUID DEFAULT auth.uid(),
  p_effect TEXT DEFAULT 'contact'
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.punishments p
    WHERE p.issued_to = p_user
      AND p.status = 'active'
      AND (
        (p.clearance_mode = 'task_debt')
        OR (p.clearance_mode = 'timed' AND p.ends_at > NOW())
      )
      AND (
        (p_effect = 'contact' AND p.punishment_type IN ('contact_restriction', 'privilege_freeze'))
        OR (p_effect = 'rewards' AND p.punishment_type = 'privilege_freeze')
        OR (p_effect = 'tease_reveal' AND p.punishment_type = 'privilege_freeze')
        OR (p_effect = 'date_post' AND p.punishment_type = 'date_timeout')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.evaluate_task_debt(p_punishment_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  required INT;
  approved INT;
  p RECORD;
BEGIN
  SELECT * INTO p FROM public.punishments WHERE id = p_punishment_id;
  IF NOT FOUND OR p.status <> 'active' OR p.clearance_mode <> 'task_debt' THEN
    RETURN false;
  END IF;

  required := COALESCE((p.config->>'tasks_required')::int, 0);
  IF required <= 0 THEN
    RETURN false;
  END IF;

  SELECT COUNT(*) INTO approved
  FROM public.tasks
  WHERE punishment_id = p_punishment_id
    AND status = 'approved';

  IF approved >= required THEN
    UPDATE public.punishments
    SET status = 'completed'
    WHERE id = p_punishment_id
      AND status = 'active';
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_active_contact_restriction(
  target_id UUID DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_punishment_effect(target_id, 'contact');
$$;

CREATE OR REPLACE FUNCTION public.guard_punishment_slave_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.current_user_role() <> 'queen' THEN
    IF NEW.issued_by IS DISTINCT FROM OLD.issued_by
       OR NEW.issued_to IS DISTINCT FROM OLD.issued_to
       OR NEW.punishment_type IS DISTINCT FROM OLD.punishment_type
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
       OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
       OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.lifted_at IS DISTINCT FROM OLD.lifted_at
       OR NEW.config IS DISTINCT FROM OLD.config
       OR NEW.clearance_mode IS DISTINCT FROM OLD.clearance_mode
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Only acknowledged_at may be updated by the recipient';
    END IF;
    IF OLD.acknowledged_at IS NOT NULL THEN
      RAISE EXCEPTION 'Already acknowledged';
    END IF;
    IF NEW.acknowledged_at IS NULL THEN
      RAISE EXCEPTION 'acknowledged_at required';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_punishment_slave_update ON public.punishments;
CREATE TRIGGER trg_guard_punishment_slave_update
  BEFORE UPDATE ON public.punishments
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_punishment_slave_update();

DROP POLICY IF EXISTS "Slave can acknowledge punishments" ON public.punishments;
CREATE POLICY "Slave can acknowledge punishments"
  ON public.punishments FOR UPDATE TO authenticated
  USING (
    issued_to = auth.uid()
    AND status = 'active'
    AND punishment_type = 'orgasm_ban'
    AND acknowledged_at IS NULL
  )
  WITH CHECK (
    issued_to = auth.uid()
    AND acknowledged_at IS NOT NULL
  );

DROP POLICY IF EXISTS "Slave can create date_posts" ON public.date_posts;
CREATE POLICY "Slave can create date_posts"
  ON public.date_posts FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.queen_dates d
      WHERE d.id = date_posts.date_id
        AND d.assigned_to = auth.uid()
    )
    AND NOT public.has_punishment_effect(auth.uid(), 'date_post')
  );

DROP POLICY IF EXISTS "Users can create requests" ON public.requests;
DROP POLICY IF EXISTS "Slave can create requests" ON public.requests;
CREATE POLICY "Users can create requests"
  ON public.requests FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND (
      public.current_user_role() = 'queen'
      OR NOT public.has_punishment_effect(auth.uid(), 'contact')
    )
  );

DROP POLICY IF EXISTS "Users can send messages on their requests" ON public.request_messages;
DROP POLICY IF EXISTS "Users can send request messages" ON public.request_messages;
DROP POLICY IF EXISTS "Participants can send request_messages" ON public.request_messages;
CREATE POLICY "Users can send messages on their requests"
  ON public.request_messages FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = request_messages.request_id
        AND (r.requested_by = auth.uid() OR public.current_user_role() = 'queen')
        AND r.status <> 'withdrawn'
    )
    AND (
      public.current_user_role() = 'queen'
      OR NOT public.has_punishment_effect(auth.uid(), 'contact')
    )
  );

GRANT EXECUTE ON FUNCTION public.has_active_punishment(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_punishment_effect(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_task_debt(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_contact_restriction(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_expired_punishments() TO authenticated;
