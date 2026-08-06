-- Jealousy missions: Queen assigns written reactions from flirt/date activity

CREATE TABLE IF NOT EXISTS public.jealousy_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('flirt_guy', 'queen_date')),
  source_id UUID NOT NULL,
  source_label TEXT,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'completed', 'cancelled')),
  response_text TEXT,
  completed_at TIMESTAMPTZ,
  denial_days INT NOT NULL DEFAULT 0 CHECK (denial_days >= 0 AND denial_days <= 60),
  edge_debt INT NOT NULL DEFAULT 0 CHECK (edge_debt >= 0 AND edge_debt <= 50),
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT jealousy_missions_prompt_len CHECK (char_length(trim(prompt)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_jealousy_missions_assigned_status
  ON public.jealousy_missions (assigned_to, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jealousy_missions_source
  ON public.jealousy_missions (source_type, source_id);

ALTER TABLE public.jealousy_missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view jealousy missions" ON public.jealousy_missions;
CREATE POLICY "Users can view jealousy missions"
  ON public.jealousy_missions FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR public.current_user_role() = 'queen'
  );

DROP POLICY IF EXISTS "Queen can insert jealousy missions" ON public.jealousy_missions;
CREATE POLICY "Queen can insert jealousy missions"
  ON public.jealousy_missions FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'queen'
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Queen can update jealousy missions" ON public.jealousy_missions;
CREATE POLICY "Queen can update jealousy missions"
  ON public.jealousy_missions FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'queen')
  WITH CHECK (public.current_user_role() = 'queen');

DROP POLICY IF EXISTS "Slave can complete own jealousy missions" ON public.jealousy_missions;
CREATE POLICY "Slave can complete own jealousy missions"
  ON public.jealousy_missions FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'slave'
    AND assigned_to = auth.uid()
  )
  WITH CHECK (
    public.current_user_role() = 'slave'
    AND assigned_to = auth.uid()
  );

CREATE OR REPLACE FUNCTION public.set_jealousy_missions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jealousy_missions_updated_at ON public.jealousy_missions;
CREATE TRIGGER jealousy_missions_updated_at
  BEFORE UPDATE ON public.jealousy_missions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_jealousy_missions_updated_at();

CREATE OR REPLACE FUNCTION public.guard_jealousy_mission_slave_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.current_user_role() = 'slave' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
       OR NEW.source_type IS DISTINCT FROM OLD.source_type
       OR NEW.source_id IS DISTINCT FROM OLD.source_id
       OR NEW.prompt IS DISTINCT FROM OLD.prompt
       OR NEW.denial_days IS DISTINCT FROM OLD.denial_days
       OR NEW.edge_debt IS DISTINCT FROM OLD.edge_debt
       OR NEW.due_at IS DISTINCT FROM OLD.due_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Slave may only submit a jealousy mission response';
    END IF;
    IF OLD.status <> 'open' THEN
      RAISE EXCEPTION 'Mission is no longer open';
    END IF;
    IF NEW.status NOT IN ('open', 'completed') THEN
      RAISE EXCEPTION 'Invalid mission status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_jealousy_mission_slave_update ON public.jealousy_missions;
CREATE TRIGGER trg_guard_jealousy_mission_slave_update
  BEFORE UPDATE ON public.jealousy_missions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_jealousy_mission_slave_update();

CREATE OR REPLACE FUNCTION public.create_jealousy_mission(
  p_source_type TEXT,
  p_source_id UUID,
  p_prompt TEXT,
  p_source_label TEXT DEFAULT NULL,
  p_denial_days INT DEFAULT 0,
  p_edge_debt INT DEFAULT 0,
  p_due_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slave_id UUID;
  mission_id UUID;
  label TEXT;
BEGIN
  IF public.current_user_role() <> 'queen' THEN
    RAISE EXCEPTION 'Only Queen can create jealousy missions';
  END IF;

  IF p_source_type NOT IN ('flirt_guy', 'queen_date') THEN
    RAISE EXCEPTION 'Invalid source type';
  END IF;

  IF char_length(trim(COALESCE(p_prompt, ''))) = 0 THEN
    RAISE EXCEPTION 'Prompt required';
  END IF;

  SELECT id INTO v_slave_id FROM public.users WHERE role = 'slave' LIMIT 1;
  IF v_slave_id IS NULL THEN
    RAISE EXCEPTION 'No slave account found';
  END IF;

  label := NULLIF(trim(COALESCE(p_source_label, '')), '');
  IF label IS NULL AND p_source_type = 'flirt_guy' THEN
    SELECT name INTO label FROM public.flirt_guys WHERE id = p_source_id;
  ELSIF label IS NULL AND p_source_type = 'queen_date' THEN
    SELECT COALESCE(NULLIF(trim(title), ''), 'Date') INTO label
    FROM public.queen_dates WHERE id = p_source_id;
  END IF;

  INSERT INTO public.jealousy_missions (
    created_by,
    assigned_to,
    source_type,
    source_id,
    source_label,
    prompt,
    denial_days,
    edge_debt,
    due_at
  ) VALUES (
    auth.uid(),
    v_slave_id,
    p_source_type,
    p_source_id,
    label,
    trim(p_prompt),
    GREATEST(LEAST(COALESCE(p_denial_days, 0), 60), 0),
    GREATEST(LEAST(COALESCE(p_edge_debt, 0), 50), 0),
    p_due_at
  )
  RETURNING id INTO mission_id;

  RETURN mission_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_jealousy_mission(
  p_mission_id UUID,
  p_response TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m public.jealousy_missions%ROWTYPE;
  response_clean TEXT;
  queen_id UUID;
  base_end TIMESTAMPTZ;
  pts INT;
  rules JSONB;
BEGIN
  IF public.current_user_role() <> 'slave' THEN
    RAISE EXCEPTION 'Only D can complete jealousy missions';
  END IF;

  response_clean := trim(COALESCE(p_response, ''));
  IF char_length(response_clean) = 0 THEN
    RAISE EXCEPTION 'Response required';
  END IF;

  SELECT * INTO m
  FROM public.jealousy_missions
  WHERE id = p_mission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mission not found';
  END IF;

  IF m.assigned_to <> auth.uid() THEN
    RAISE EXCEPTION 'Not your mission';
  END IF;

  IF m.status <> 'open' THEN
    RAISE EXCEPTION 'Mission is not open';
  END IF;

  UPDATE public.jealousy_missions
  SET
    response_text = response_clean,
    status = 'completed',
    completed_at = NOW()
  WHERE id = m.id;

  -- Denial consequences (SECURITY DEFINER bypasses ledger revoke)
  IF m.edge_debt > 0 THEN
    INSERT INTO public.denial_ledger (id, edges_remaining, queen_note, updated_by)
    VALUES (
      1,
      m.edge_debt,
      'Jealousy mission: ' || left(COALESCE(m.source_label, m.source_type), 80),
      m.created_by
    )
    ON CONFLICT (id) DO UPDATE
    SET
      edges_remaining = public.denial_ledger.edges_remaining + EXCLUDED.edges_remaining,
      queen_note = EXCLUDED.queen_note,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW();
  END IF;

  IF m.denial_days > 0 THEN
    SELECT denial_ends_at INTO base_end FROM public.denial_ledger WHERE id = 1;
    base_end := GREATEST(COALESCE(base_end, NOW()), NOW());
    INSERT INTO public.denial_ledger (id, edges_remaining, denial_ends_at, queen_note, updated_by)
    VALUES (
      1,
      0,
      base_end + make_interval(days => m.denial_days),
      'Jealousy mission: ' || left(COALESCE(m.source_label, m.source_type), 80),
      m.created_by
    )
    ON CONFLICT (id) DO UPDATE
    SET
      denial_ends_at = GREATEST(COALESCE(public.denial_ledger.denial_ends_at, NOW()), NOW())
        + make_interval(days => m.denial_days),
      queen_note = EXCLUDED.queen_note,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW();
  END IF;

  -- Worship-style points
  SELECT value INTO rules FROM public.pair_settings WHERE key = 'points_rules';
  pts := COALESCE((rules->>'jealousy_mission')::int, (rules->>'worship_entry')::int, 5);
  IF pts <> 0 THEN
    INSERT INTO public.points_ledger (
      user_id, delta, reason, entity_type, entity_id, created_by
    ) VALUES (
      auth.uid(),
      pts,
      'Completed jealousy mission',
      'jealousy_mission',
      m.id,
      NULL
    );
  END IF;

  IF m.source_type = 'flirt_guy' THEN
    UPDATE public.flirt_guys
    SET jealousy_level = LEAST(100, jealousy_level + 5)
    WHERE id = m.source_id
      AND assigned_to = auth.uid();
  END IF;

  SELECT id INTO queen_id FROM public.users WHERE role = 'queen' LIMIT 1;
  IF queen_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, href)
    VALUES (
      queen_id,
      'jealousy_mission_done',
      'Jealousy mission completed',
      left(response_clean, 120),
      '/dashboard/jealousy?mission=' || m.id::text
    );
  END IF;

  RETURN m.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_jealousy_mission(TEXT, UUID, TEXT, TEXT, INT, INT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_jealousy_mission(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
