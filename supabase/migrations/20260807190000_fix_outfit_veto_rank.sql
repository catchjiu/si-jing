-- Fix outfit veto ranking: accept JSONB rank order (PostgREST-friendly) and
-- harden id validation so ranking succeeds reliably from the slave client.

ALTER TABLE public.jealousy_outfit_vetoes
  ADD COLUMN IF NOT EXISTS purpose TEXT;

UPDATE public.jealousy_outfit_vetoes
SET purpose = 'Outfit veto'
WHERE purpose IS NULL OR trim(purpose) = '';

ALTER TABLE public.jealousy_outfit_vetoes
  ALTER COLUMN purpose SET DEFAULT 'Outfit veto';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.jealousy_outfit_vetoes
    WHERE purpose IS NULL
  ) THEN
    UPDATE public.jealousy_outfit_vetoes
    SET purpose = 'Outfit veto'
    WHERE purpose IS NULL;
  END IF;

  BEGIN
    ALTER TABLE public.jealousy_outfit_vetoes
      ALTER COLUMN purpose SET NOT NULL;
  EXCEPTION
    WHEN others THEN
      NULL;
  END;
END;
$$;

ALTER TABLE public.jealousy_missions
  DROP CONSTRAINT IF EXISTS jealousy_missions_source_type_check;

ALTER TABLE public.jealousy_missions
  ADD CONSTRAINT jealousy_missions_source_type_check
  CHECK (source_type IN ('flirt_guy', 'queen_date', 'outfit_veto'));

DROP FUNCTION IF EXISTS public.rank_jealousy_outfit_veto(UUID, UUID[]);

CREATE OR REPLACE FUNCTION public.rank_jealousy_outfit_veto(
  p_veto_id UUID,
  p_rank_order JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.jealousy_outfit_vetoes%ROWTYPE;
  opt_ids TEXT[];
  rank_ids TEXT[];
  winner_id_text TEXT;
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

  IF p_rank_order IS NULL OR jsonb_typeof(p_rank_order) <> 'array' THEN
    RAISE EXCEPTION 'Rank every outfit exactly once';
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

  SELECT array_agg(trim(o->>'id') ORDER BY ord)
  INTO opt_ids
  FROM jsonb_array_elements(v.options) WITH ORDINALITY AS t(o, ord);

  SELECT array_agg(trim(elem) ORDER BY ord)
  INTO rank_ids
  FROM jsonb_array_elements_text(p_rank_order) WITH ORDINALITY AS t(elem, ord);

  n := coalesce(array_length(opt_ids, 1), 0);

  IF n < 2 OR n > 3 THEN
    RAISE EXCEPTION 'Outfit veto has invalid options';
  END IF;

  IF rank_ids IS NULL OR array_length(rank_ids, 1) IS DISTINCT FROM n THEN
    RAISE EXCEPTION 'Rank every outfit exactly once';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(rank_ids) AS x(id)
    WHERE id IS NULL OR id = '' OR NOT (id = ANY (opt_ids))
  ) THEN
    RAISE EXCEPTION 'Invalid ranking';
  END IF;

  IF (
    SELECT count(DISTINCT x.id)
    FROM unnest(rank_ids) AS x(id)
  ) <> n THEN
    RAISE EXCEPTION 'Invalid ranking';
  END IF;

  winner_id_text := rank_ids[1];
  winner_id := winner_id_text::uuid;

  SELECT o INTO winner
  FROM jsonb_array_elements(v.options) o
  WHERE trim(o->>'id') = winner_id_text
  LIMIT 1;

  winner_label := NULLIF(trim(COALESCE(winner->>'label', '')), '');
  IF winner_label IS NULL THEN
    winner_label := 'Outfit #' || (
      SELECT (ord)::text
      FROM jsonb_array_elements(v.options) WITH ORDINALITY AS t(o, ord)
      WHERE trim(o->>'id') = winner_id_text
      LIMIT 1
    );
  END IF;

  purpose_text := COALESCE(NULLIF(trim(v.purpose), ''), 'this');

  mission_prompt := v.prompt_template;
  mission_prompt := replace(mission_prompt, '{label}', winner_label);
  mission_prompt := replace(mission_prompt, '{outfit}', winner_label);
  mission_prompt := replace(mission_prompt, '{purpose}', purpose_text);

  IF char_length(trim(mission_prompt)) = 0 THEN
    RAISE EXCEPTION 'Mission prompt is empty after template substitution';
  END IF;

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
    slave_rank_order = (
      SELECT array_agg(x::uuid)
      FROM unnest(rank_ids) AS x
    ),
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

GRANT EXECUTE ON FUNCTION public.rank_jealousy_outfit_veto(UUID, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
