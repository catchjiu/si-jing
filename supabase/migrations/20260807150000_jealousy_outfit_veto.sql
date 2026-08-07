-- Outfit veto: Queen posts 2–3 outfits; D ranks which hurts most → jealousy mission

ALTER TABLE public.jealousy_missions
  DROP CONSTRAINT IF EXISTS jealousy_missions_source_type_check;

ALTER TABLE public.jealousy_missions
  ADD CONSTRAINT jealousy_missions_source_type_check
  CHECK (source_type IN ('flirt_guy', 'queen_date', 'outfit_veto'));

CREATE TABLE IF NOT EXISTS public.jealousy_outfit_vetoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'ranked', 'cancelled')),
  -- [{ "id": "uuid", "image_path": "...", "label": "optional" }]
  options JSONB NOT NULL,
  slave_rank_order UUID[],
  winning_option_id UUID,
  mission_id UUID REFERENCES public.jealousy_missions(id) ON DELETE SET NULL,
  prompt_template TEXT NOT NULL,
  denial_days INT NOT NULL DEFAULT 0 CHECK (denial_days >= 0 AND denial_days <= 60),
  edge_debt INT NOT NULL DEFAULT 0 CHECK (edge_debt >= 0 AND edge_debt <= 50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT jealousy_outfit_vetoes_options_len CHECK (
    jsonb_typeof(options) = 'array'
    AND jsonb_array_length(options) BETWEEN 2 AND 3
  ),
  CONSTRAINT jealousy_outfit_vetoes_prompt_len CHECK (
    char_length(trim(prompt_template)) > 0
  )
);

CREATE INDEX IF NOT EXISTS idx_jealousy_outfit_vetoes_assigned
  ON public.jealousy_outfit_vetoes (assigned_to, status, created_at DESC);

ALTER TABLE public.jealousy_outfit_vetoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view outfit vetoes" ON public.jealousy_outfit_vetoes;
CREATE POLICY "Users can view outfit vetoes"
  ON public.jealousy_outfit_vetoes FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR public.current_user_role() = 'queen'
  );

DROP POLICY IF EXISTS "Queen can insert outfit vetoes" ON public.jealousy_outfit_vetoes;
CREATE POLICY "Queen can insert outfit vetoes"
  ON public.jealousy_outfit_vetoes FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'queen'
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Queen can update outfit vetoes" ON public.jealousy_outfit_vetoes;
CREATE POLICY "Queen can update outfit vetoes"
  ON public.jealousy_outfit_vetoes FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'queen')
  WITH CHECK (public.current_user_role() = 'queen');

-- Recreate create_jealousy_mission to allow outfit_veto (Queen-direct assigns)
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

  IF p_source_type NOT IN ('flirt_guy', 'queen_date', 'outfit_veto') THEN
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
  ELSIF label IS NULL AND p_source_type = 'outfit_veto' THEN
    label := 'Outfit veto';
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

CREATE OR REPLACE FUNCTION public.create_jealousy_outfit_veto(
  p_options JSONB,
  p_prompt_template TEXT,
  p_denial_days INT DEFAULT 0,
  p_edge_debt INT DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slave_id UUID;
  veto_id UUID;
  opt JSONB;
  seen INT := 0;
BEGIN
  IF public.current_user_role() <> 'queen' THEN
    RAISE EXCEPTION 'Only Queen can create outfit vetoes';
  END IF;

  IF jsonb_typeof(p_options) <> 'array'
     OR jsonb_array_length(p_options) < 2
     OR jsonb_array_length(p_options) > 3 THEN
    RAISE EXCEPTION 'Upload 2 or 3 outfit options';
  END IF;

  FOR opt IN SELECT * FROM jsonb_array_elements(p_options)
  LOOP
    IF NULLIF(trim(COALESCE(opt->>'id', '')), '') IS NULL THEN
      RAISE EXCEPTION 'Each option needs an id';
    END IF;
    IF NULLIF(trim(COALESCE(opt->>'image_path', '')), '') IS NULL THEN
      RAISE EXCEPTION 'Each option needs an image';
    END IF;
    seen := seen + 1;
  END LOOP;

  IF char_length(trim(COALESCE(p_prompt_template, ''))) = 0 THEN
    RAISE EXCEPTION 'Prompt template required';
  END IF;

  SELECT id INTO v_slave_id FROM public.users WHERE role = 'slave' LIMIT 1;
  IF v_slave_id IS NULL THEN
    RAISE EXCEPTION 'No slave account found';
  END IF;

  INSERT INTO public.jealousy_outfit_vetoes (
    created_by,
    assigned_to,
    options,
    prompt_template,
    denial_days,
    edge_debt
  ) VALUES (
    auth.uid(),
    v_slave_id,
    p_options,
    trim(p_prompt_template),
    GREATEST(LEAST(COALESCE(p_denial_days, 0), 60), 0),
    GREATEST(LEAST(COALESCE(p_edge_debt, 0), 50), 0)
  )
  RETURNING id INTO veto_id;

  INSERT INTO public.notifications (user_id, kind, title, body, href)
  VALUES (
    v_slave_id,
    'outfit_veto',
    'Outfit veto',
    'Rank which outfit would hurt most — Queen wears the winner.',
    '/dashboard/jealousy?veto=' || veto_id::text
  );

  RETURN veto_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rank_jealousy_outfit_veto(
  p_veto_id UUID,
  p_rank_order UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.jealousy_outfit_vetoes%ROWTYPE;
  opt_ids UUID[];
  winner_id UUID;
  winner JSONB;
  winner_label TEXT;
  mission_prompt TEXT;
  mission_id UUID;
  n INT;
BEGIN
  IF public.current_user_role() <> 'slave' THEN
    RAISE EXCEPTION 'Only D can rank outfit vetoes';
  END IF;

  SELECT * INTO v
  FROM public.jealousy_outfit_vetoes
  WHERE id = p_veto_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Outfit veto not found';
  END IF;
  IF v.assigned_to <> auth.uid() THEN
    RAISE EXCEPTION 'Not your outfit veto';
  END IF;
  IF v.status <> 'open' THEN
    RAISE EXCEPTION 'This veto is already settled';
  END IF;

  SELECT array_agg((o->>'id')::uuid)
  INTO opt_ids
  FROM jsonb_array_elements(v.options) o;

  n := coalesce(array_length(opt_ids, 1), 0);
  IF p_rank_order IS NULL OR array_length(p_rank_order, 1) IS DISTINCT FROM n THEN
    RAISE EXCEPTION 'Rank every outfit exactly once';
  END IF;

  -- Must be a permutation of option ids
  IF (
    SELECT count(*) FROM unnest(p_rank_order) x
  ) <> n
  OR (
    SELECT count(DISTINCT x) FROM unnest(p_rank_order) x
  ) <> n
  OR EXISTS (
    SELECT 1 FROM unnest(p_rank_order) x
    WHERE NOT (x = ANY (opt_ids))
  ) THEN
    RAISE EXCEPTION 'Invalid ranking';
  END IF;

  -- First in rank = hurts most = Queen wears it
  winner_id := p_rank_order[1];

  SELECT o INTO winner
  FROM jsonb_array_elements(v.options) o
  WHERE (o->>'id')::uuid = winner_id
  LIMIT 1;

  winner_label := NULLIF(trim(COALESCE(winner->>'label', '')), '');
  IF winner_label IS NULL THEN
    winner_label := 'the outfit you ranked as most hurtful';
  END IF;

  mission_prompt := replace(
    replace(v.prompt_template, '{label}', winner_label),
    '{outfit}',
    winner_label
  );

  INSERT INTO public.jealousy_missions (
    created_by,
    assigned_to,
    source_type,
    source_id,
    source_label,
    prompt,
    denial_days,
    edge_debt
  ) VALUES (
    v.created_by,
    v.assigned_to,
    'outfit_veto',
    v.id,
    'Outfit: ' || left(winner_label, 80),
    mission_prompt,
    v.denial_days,
    v.edge_debt
  )
  RETURNING id INTO mission_id;

  UPDATE public.jealousy_outfit_vetoes
  SET
    status = 'ranked',
    slave_rank_order = p_rank_order,
    winning_option_id = winner_id,
    mission_id = mission_id,
    updated_at = NOW()
  WHERE id = v.id;

  INSERT INTO public.notifications (user_id, kind, title, body, href)
  VALUES (
    v.created_by,
    'outfit_veto_ranked',
    'Outfit veto ranked',
    'D picked: ' || left(winner_label, 100),
    '/dashboard/jealousy?mission=' || mission_id::text
  );

  RETURN mission_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_jealousy_outfit_veto(JSONB, TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rank_jealousy_outfit_veto(UUID, UUID[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
