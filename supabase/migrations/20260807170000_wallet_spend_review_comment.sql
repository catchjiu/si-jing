-- Queen can leave a comment when approving or denying wallet spend requests

ALTER TABLE public.wallet_spend_requests
  ADD COLUMN IF NOT EXISTS review_comment TEXT;

CREATE OR REPLACE FUNCTION public.review_wallet_spend(
  p_request_id UUID,
  p_approve BOOLEAN,
  p_review_comment TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.wallet_spend_requests%ROWTYPE;
  v_slave UUID;
  v_comment TEXT := NULLIF(trim(COALESCE(p_review_comment, '')), '');
  v_body TEXT;
BEGIN
  IF public.current_user_role() <> 'queen' THEN
    RAISE EXCEPTION 'Only Queen can review wallet begs';
  END IF;

  SELECT * INTO r
  FROM public.wallet_spend_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'Request already reviewed';
  END IF;

  IF NOT p_approve THEN
    UPDATE public.wallet_spend_requests
    SET
      status = 'denied',
      reviewed_by = auth.uid(),
      reviewed_at = NOW(),
      review_comment = v_comment
    WHERE id = r.id;

    v_body := 'Queen denied your spend request.';
    IF v_comment IS NOT NULL THEN
      v_body := v_body || ' “' || v_comment || '”';
    END IF;

    INSERT INTO public.notifications (user_id, kind, title, body, href)
    VALUES (
      r.requested_by,
      'wallet_spend_denied',
      'Wallet beg denied',
      v_body,
      '/dashboard/wishlist'
    );
    RETURN r.id;
  END IF;

  v_slave := r.requested_by;

  IF r.kind = 'wishlist_purchase' THEN
    PERFORM public.admin_record_wishlist_purchase_for_slave(
      v_slave,
      r.wishlist_item_id,
      r.price_usd,
      r.target_status,
      r.fulfillment_notes
    );
  ELSIF r.kind = 'apartment_fund' THEN
    INSERT INTO public.queen_apartment_fund_entries (user_id, amount_ntd, note)
    VALUES (v_slave, r.amount_ntd, r.note);
  END IF;

  UPDATE public.wallet_spend_requests
  SET
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = NOW(),
    review_comment = v_comment
  WHERE id = r.id;

  v_body := 'Queen approved your spend request.';
  IF v_comment IS NOT NULL THEN
    v_body := v_body || ' “' || v_comment || '”';
  END IF;

  INSERT INTO public.notifications (user_id, kind, title, body, href)
  VALUES (
    r.requested_by,
    'wallet_spend_approved',
    'Wallet beg approved',
    v_body,
    '/dashboard/wishlist'
  );

  RETURN r.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_wallet_spend(UUID, BOOLEAN, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
