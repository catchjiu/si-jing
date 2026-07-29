-- Secure RPC for editing apartment fund contributions (works even before direct UPDATE grants).

DROP POLICY IF EXISTS "Queen updates apartment fund entries" ON public.queen_apartment_fund_entries;
CREATE POLICY "Queen updates apartment fund entries"
  ON public.queen_apartment_fund_entries FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'queen')
  WITH CHECK (public.current_user_role() = 'queen');

DROP POLICY IF EXISTS "Slave updates own apartment fund entries" ON public.queen_apartment_fund_entries;
CREATE POLICY "Slave updates own apartment fund entries"
  ON public.queen_apartment_fund_entries FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.current_user_role() = 'slave'
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.current_user_role() = 'slave'
  );

CREATE OR REPLACE FUNCTION public.update_queen_apartment_fund_entry(
  p_entry_id uuid,
  p_amount_ntd numeric,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.queen_apartment_fund_entries;
  v_role text;
BEGIN
  v_role := public.current_user_role();

  IF v_role NOT IN ('queen', 'slave') THEN
    RAISE EXCEPTION 'Not allowed to edit apartment fund entries';
  END IF;

  IF p_amount_ntd IS NULL OR p_amount_ntd <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  SELECT * INTO v_row
  FROM public.queen_apartment_fund_entries
  WHERE id = p_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contribution not found';
  END IF;

  IF v_role = 'slave' AND v_row.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'You can only edit your own contributions';
  END IF;

  UPDATE public.queen_apartment_fund_entries
  SET
    amount_ntd = p_amount_ntd,
    note = NULLIF(trim(COALESCE(p_note, '')), '')
  WHERE id = p_entry_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'user_id', v_row.user_id,
    'amount_ntd', v_row.amount_ntd,
    'note', v_row.note,
    'created_at', v_row.created_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_queen_apartment_fund_entry(uuid, numeric, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
