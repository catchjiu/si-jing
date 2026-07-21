-- Queen (and D) can comment on individual edge log entries.

CREATE TABLE IF NOT EXISTS public.edge_log_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edge_log_id UUID NOT NULL REFERENCES public.edge_logs(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_edge_log_comments_log_created
  ON public.edge_log_comments (edge_log_id, created_at ASC);

ALTER TABLE public.edge_log_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view edge log comments" ON public.edge_log_comments;
CREATE POLICY "Authenticated can view edge log comments"
  ON public.edge_log_comments FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Queen and slave can comment on edge logs" ON public.edge_log_comments;
CREATE POLICY "Queen and slave can comment on edge logs"
  ON public.edge_log_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.current_user_role() IN ('queen', 'slave')
  );

CREATE OR REPLACE FUNCTION public.queen_set_denial_note(p_note TEXT DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_note TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF public.current_user_role() <> 'queen' THEN
    RAISE EXCEPTION 'Only the Queen can update the denial note';
  END IF;

  v_note := nullif(btrim(COALESCE(p_note, '')), '');
  IF v_note IS NOT NULL AND char_length(v_note) > 300 THEN
    RAISE EXCEPTION 'Note must be 300 characters or fewer';
  END IF;

  UPDATE public.denial_ledger
  SET
    queen_note = v_note,
    updated_at = now(),
    updated_by = v_uid
  WHERE id = 1;

  IF NOT FOUND THEN
    INSERT INTO public.denial_ledger (id, edges_remaining, queen_note, updated_by)
    VALUES (1, 0, v_note, v_uid);
  END IF;

  RETURN public.get_denial_ledger();
END;
$$;

REVOKE ALL ON FUNCTION public.queen_set_denial_note(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queen_set_denial_note(TEXT) TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.edge_log_comments;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
