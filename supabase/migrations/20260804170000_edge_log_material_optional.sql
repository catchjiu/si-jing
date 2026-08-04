-- Edge logs: optional material photo, proof photo required, log anytime.

ALTER TABLE public.edge_logs
  ADD COLUMN IF NOT EXISTS material_path TEXT;

CREATE OR REPLACE FUNCTION public.slave_log_edge(
  p_image_path TEXT,
  p_note TEXT DEFAULT NULL,
  p_material_path TEXT DEFAULT NULL
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
  v_material TEXT;
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
    RAISE EXCEPTION 'Edge log requires a proof photo';
  END IF;

  v_note := nullif(btrim(COALESCE(p_note, '')), '');
  IF v_note IS NOT NULL AND char_length(v_note) > 300 THEN
    RAISE EXCEPTION 'Note must be 300 characters or fewer';
  END IF;

  v_material := nullif(btrim(COALESCE(p_material_path, '')), '');

  SELECT * INTO v_row FROM public.denial_ledger WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.denial_ledger (id, edges_remaining)
    VALUES (1, 0)
    RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.edge_logs (logged_by, image_path, material_path, note)
  VALUES (v_uid, btrim(p_image_path), v_material, v_note)
  RETURNING id INTO v_log_id;

  IF v_row.edges_remaining > 0 THEN
    UPDATE public.denial_ledger
    SET
      edges_remaining = edges_remaining - 1,
      updated_at = now(),
      updated_by = v_uid
    WHERE id = 1;
  ELSE
    UPDATE public.denial_ledger
    SET
      updated_at = now(),
      updated_by = v_uid
    WHERE id = 1;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'log_id', v_log_id,
    'ledger', public.get_denial_ledger()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.slave_log_edge(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.slave_log_edge(TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
