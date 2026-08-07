-- Outfit veto: purpose ("what this is for") + Queen can cancel open vetoes

ALTER TABLE public.jealousy_outfit_vetoes
  ADD COLUMN IF NOT EXISTS purpose TEXT;

UPDATE public.jealousy_outfit_vetoes
SET purpose = 'Outfit veto'
WHERE purpose IS NULL OR trim(purpose) = '';

ALTER TABLE public.jealousy_outfit_vetoes
  ALTER COLUMN purpose SET DEFAULT 'Outfit veto';

ALTER TABLE public.jealousy_outfit_vetoes
  ALTER COLUMN purpose SET NOT NULL;

ALTER TABLE public.jealousy_outfit_vetoes
  DROP CONSTRAINT IF EXISTS jealousy_outfit_vetoes_purpose_len;

ALTER TABLE public.jealousy_outfit_vetoes
  ADD CONSTRAINT jealousy_outfit_vetoes_purpose_len
  CHECK (char_length(trim(purpose)) > 0);

CREATE OR REPLACE FUNCTION public.create_jealousy_outfit_veto(
  p_options JSONB,
  p_prompt_template TEXT,
  p_purpose TEXT,
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
  v_purpose TEXT;
BEGIN
  IF public.current_user_role() <> 'queen' THEN
    RAISE EXCEPTION 'Only Queen can create outfit vetoes';
  END IF;

  v_purpose := NULLIF(trim(COALESCE(p_purpose, '')), '');
  IF v_purpose IS NULL THEN
    RAISE EXCEPTION 'Say what this outfit veto is for';
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
    purpose,
    prompt_template,
    denial_days,
    edge_debt
  ) VALUES (
    auth.uid(),
    v_slave_id,
    p_options,
    v_purpose,
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
    'Rank outfits for: ' || left(v_purpose, 80),
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
  purpose_text TEXT;
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

  winner_id := p_rank_order[1];

  SELECT o INTO winner
  FROM jsonb_array_elements(v.options) o
  WHERE (o->>'id')::uuid = winner_id
  LIMIT 1;

  winner_label := NULLIF(trim(COALESCE(winner->>'label', '')), '');
  IF winner_label IS NULL THEN
    winner_label := 'Outfit #' || (
      SELECT (ord)::text
      FROM jsonb_array_elements(v.options) WITH ORDINALITY AS t(o, ord)
      WHERE (o->>'id')::uuid = winner_id
      LIMIT 1
    );
  END IF;

  purpose_text := COALESCE(NULLIF(trim(v.purpose), ''), 'this');

  mission_prompt := v.prompt_template;
  mission_prompt := replace(mission_prompt, '{label}', winner_label);
  mission_prompt := replace(mission_prompt, '{outfit}', winner_label);
  mission_prompt := replace(mission_prompt, '{purpose}', purpose_text);

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
    left(purpose_text || ' · ' || winner_label, 80),
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
    'D picked ' || left(winner_label, 60) || ' for ' || left(purpose_text, 40),
    '/dashboard/jealousy?mission=' || mission_id::text
  );

  RETURN mission_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_jealousy_outfit_veto(p_veto_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.jealousy_outfit_vetoes%ROWTYPE;
BEGIN
  IF public.current_user_role() <> 'queen' THEN
    RAISE EXCEPTION 'Only Queen can delete outfit vetoes';
  END IF;

  SELECT * INTO v
  FROM public.jealousy_outfit_vetoes
  WHERE id = p_veto_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Outfit veto not found';
  END IF;
  IF v.created_by <> auth.uid() AND public.current_user_role() <> 'queen' THEN
    RAISE EXCEPTION 'Not your outfit veto';
  END IF;
  IF v.status <> 'open' THEN
    RAISE EXCEPTION 'Only open vetoes can be deleted';
  END IF;

  DELETE FROM public.jealousy_outfit_vetoes WHERE id = v.id;
  RETURN v.id;
END;
$$;

-- Drop old 4-arg overload if PostgREST still sees it
DROP FUNCTION IF EXISTS public.create_jealousy_outfit_veto(JSONB, TEXT, INT, INT);

GRANT EXECUTE ON FUNCTION public.create_jealousy_outfit_veto(JSONB, TEXT, TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rank_jealousy_outfit_veto(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_jealousy_outfit_veto(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
