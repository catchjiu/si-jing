-- Edge debt / denial ledger: Queen sets edges + denial days; slave logs proof.
-- Orgasm permission requests blocked until balance is clear.

CREATE TABLE IF NOT EXISTS public.denial_ledger (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  edges_remaining INTEGER NOT NULL DEFAULT 0 CHECK (edges_remaining >= 0),
  denial_ends_at TIMESTAMPTZ,
  queen_note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

INSERT INTO public.denial_ledger (id, edges_remaining)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.edge_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  logged_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS edge_logs_created_at_idx
  ON public.edge_logs (created_at DESC);

ALTER TABLE public.denial_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edge_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read denial_ledger" ON public.denial_ledger;
CREATE POLICY "Authenticated can read denial_ledger"
  ON public.denial_ledger FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated can read edge_logs" ON public.edge_logs;
CREATE POLICY "Authenticated can read edge_logs"
  ON public.edge_logs FOR SELECT TO authenticated
  USING (true);

-- Mutations go through SECURITY DEFINER RPCs only.
REVOKE INSERT, UPDATE, DELETE ON public.denial_ledger FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.edge_logs FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.denial_balance_clear()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(
      (
        SELECT
          edges_remaining = 0
          AND (denial_ends_at IS NULL OR denial_ends_at <= now())
        FROM public.denial_ledger
        WHERE id = 1
      ),
      true
    );
$$;

CREATE OR REPLACE FUNCTION public.can_request_orgasm()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.denial_balance_clear();
$$;

CREATE OR REPLACE FUNCTION public.get_denial_ledger()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.denial_ledger;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_row FROM public.denial_ledger WHERE id = 1;
  IF NOT FOUND THEN
    INSERT INTO public.denial_ledger (id, edges_remaining)
    VALUES (1, 0)
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'edges_remaining', v_row.edges_remaining,
    'denial_ends_at', v_row.denial_ends_at,
    'queen_note', v_row.queen_note,
    'updated_at', v_row.updated_at,
    'balance_clear', public.denial_balance_clear(),
    'can_request_orgasm', public.can_request_orgasm()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.queen_add_edge_debt(
  p_edges INTEGER,
  p_note TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.denial_ledger;
  v_note TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF public.current_user_role() <> 'queen' THEN
    RAISE EXCEPTION 'Only the Queen can add edge debt';
  END IF;
  IF p_edges IS NULL OR p_edges < 1 OR p_edges > 100 THEN
    RAISE EXCEPTION 'Add between 1 and 100 edges';
  END IF;

  v_note := nullif(btrim(COALESCE(p_note, '')), '');

  UPDATE public.denial_ledger
  SET
    edges_remaining = edges_remaining + p_edges,
    queen_note = COALESCE(v_note, queen_note),
    updated_at = now(),
    updated_by = v_uid
  WHERE id = 1
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    INSERT INTO public.denial_ledger (id, edges_remaining, queen_note, updated_by)
    VALUES (1, p_edges, v_note, v_uid)
    RETURNING * INTO v_row;
  END IF;

  RETURN public.get_denial_ledger();
END;
$$;

CREATE OR REPLACE FUNCTION public.queen_add_denial_days(
  p_days INTEGER,
  p_note TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.denial_ledger;
  v_note TEXT;
  v_base TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF public.current_user_role() <> 'queen' THEN
    RAISE EXCEPTION 'Only the Queen can add denial days';
  END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN
    RAISE EXCEPTION 'Add between 1 and 365 denial days';
  END IF;

  v_note := nullif(btrim(COALESCE(p_note, '')), '');

  SELECT * INTO v_row FROM public.denial_ledger WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.denial_ledger (id, edges_remaining)
    VALUES (1, 0)
    RETURNING * INTO v_row;
  END IF;

  v_base := CASE
    WHEN v_row.denial_ends_at IS NOT NULL AND v_row.denial_ends_at > now()
      THEN v_row.denial_ends_at
    ELSE now()
  END;

  UPDATE public.denial_ledger
  SET
    denial_ends_at = v_base + make_interval(days => p_days),
    queen_note = COALESCE(v_note, queen_note),
    updated_at = now(),
    updated_by = v_uid
  WHERE id = 1;

  RETURN public.get_denial_ledger();
END;
$$;

CREATE OR REPLACE FUNCTION public.queen_clear_denial_ledger(
  p_clear_edges BOOLEAN DEFAULT TRUE,
  p_clear_days BOOLEAN DEFAULT TRUE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF public.current_user_role() <> 'queen' THEN
    RAISE EXCEPTION 'Only the Queen can clear the denial ledger';
  END IF;

  UPDATE public.denial_ledger
  SET
    edges_remaining = CASE WHEN p_clear_edges THEN 0 ELSE edges_remaining END,
    denial_ends_at = CASE WHEN p_clear_days THEN NULL ELSE denial_ends_at END,
    queen_note = CASE
      WHEN p_clear_edges AND p_clear_days THEN NULL
      ELSE queen_note
    END,
    updated_at = now(),
    updated_by = v_uid
  WHERE id = 1;

  IF NOT FOUND THEN
    INSERT INTO public.denial_ledger (id, edges_remaining, updated_by)
    VALUES (1, 0, v_uid);
  END IF;

  RETURN public.get_denial_ledger();
END;
$$;

CREATE OR REPLACE FUNCTION public.slave_log_edge(
  p_image_path TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.denial_ledger;
  v_note TEXT;
  v_log_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF public.current_user_role() <> 'slave' THEN
    RAISE EXCEPTION 'Only D can log edges';
  END IF;

  PERFORM public.assert_slave_can_mutate();

  IF p_image_path IS NULL OR btrim(p_image_path) = '' THEN
    RAISE EXCEPTION 'Edge log requires a photo';
  END IF;

  v_note := nullif(btrim(COALESCE(p_note, '')), '');
  IF v_note IS NOT NULL AND char_length(v_note) > 300 THEN
    RAISE EXCEPTION 'Note must be 300 characters or fewer';
  END IF;

  SELECT * INTO v_row FROM public.denial_ledger WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.denial_ledger (id, edges_remaining)
    VALUES (1, 0)
    RETURNING * INTO v_row;
  END IF;

  IF v_row.edges_remaining <= 0 THEN
    RAISE EXCEPTION 'No edge debt remaining to log';
  END IF;

  INSERT INTO public.edge_logs (logged_by, image_path, note)
  VALUES (v_uid, btrim(p_image_path), v_note)
  RETURNING id INTO v_log_id;

  UPDATE public.denial_ledger
  SET
    edges_remaining = edges_remaining - 1,
    updated_at = now(),
    updated_by = v_uid
  WHERE id = 1;

  RETURN jsonb_build_object(
    'ok', true,
    'log_id', v_log_id,
    'ledger', public.get_denial_ledger()
  );
END;
$$;

ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_request_type_check;
ALTER TABLE public.requests ADD CONSTRAINT requests_request_type_check
  CHECK (request_type = ANY (ARRAY[
    'contact'::text, 'mercy'::text, 'reward'::text, 'general'::text,
    'directive'::text, 'question'::text, 'orgasm'::text
  ]));

DROP POLICY IF EXISTS "Users can create requests" ON public.requests;
CREATE POLICY "Users can create requests"
  ON public.requests FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND (
      public.current_user_role() = 'queen'
      OR (
        NOT public.has_punishment_effect(auth.uid(), 'contact')
        AND (
          request_type <> 'orgasm'
          OR public.can_request_orgasm()
        )
      )
    )
  );

REVOKE ALL ON FUNCTION public.denial_balance_clear() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_request_orgasm() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_denial_ledger() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.queen_add_edge_debt(INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.queen_add_denial_days(INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.queen_clear_denial_ledger(BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.slave_log_edge(TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.denial_balance_clear() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_request_orgasm() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_denial_ledger() TO authenticated;
GRANT EXECUTE ON FUNCTION public.queen_add_edge_debt(INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.queen_add_denial_days(INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.queen_clear_denial_ledger(BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.slave_log_edge(TEXT, TEXT) TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.denial_ledger;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
