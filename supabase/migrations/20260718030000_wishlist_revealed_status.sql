-- Revealed = gift arrived and collected; visible to Queen; listed under "Gifts bought for Queen".

ALTER TABLE public.wishlist_items
  DROP CONSTRAINT IF EXISTS wishlist_items_status_check;

ALTER TABLE public.wishlist_items
  ADD CONSTRAINT wishlist_items_status_check
  CHECK (status IN ('new', 'seen', 'idea', 'ordered', 'fulfilled', 'revealed'));

-- Already-arrived fulfilled gifts become Revealed.
UPDATE public.wishlist_items
SET
  status = 'revealed',
  updated_at = now()
WHERE item_kind = 'slave_gift'
  AND arrived_at IS NOT NULL
  AND status = 'fulfilled';

CREATE OR REPLACE FUNCTION public.mark_wishlist_arrived(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item public.wishlist_items;
  v_was_secret BOOLEAN := false;
  v_title TEXT;
  v_was_idea BOOLEAN := false;
BEGIN
  IF public.current_user_role() <> 'queen' THEN
    RAISE EXCEPTION 'Only the Queen can mark a gift as arrived';
  END IF;

  SELECT * INTO v_item FROM public.wishlist_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wishlist item not found';
  END IF;

  IF v_item.item_kind <> 'slave_gift' THEN
    RAISE EXCEPTION 'Only gift ideas can be marked arrived';
  END IF;

  v_was_secret := v_item.arrived_at IS NULL;
  v_was_idea := v_item.status = 'idea';
  v_title := NULLIF(trim(COALESCE(v_item.title, '')), '');

  UPDATE public.wishlist_items
  SET
    arrived_at = COALESCE(arrived_at, now()),
    status = CASE
      WHEN status IN ('ordered', 'fulfilled', 'revealed') THEN 'revealed'
      ELSE status
    END,
    fulfilled_at = CASE
      WHEN status IN ('ordered', 'fulfilled', 'revealed') THEN COALESCE(fulfilled_at, now())
      ELSE fulfilled_at
    END,
    updated_at = now()
  WHERE id = p_item_id
  RETURNING * INTO v_item;

  IF v_was_secret AND v_item.created_by IS NOT NULL THEN
    PERFORM public.notify_user(
      v_item.created_by,
      'wishlist_gift_arrived',
      CASE
        WHEN v_was_idea THEN 'Queen revealed your gift idea'
        ELSE 'Queen revealed your gift'
      END,
      CASE
        WHEN v_title IS NOT NULL AND v_was_idea THEN format('She revealed “%s”.', v_title)
        WHEN v_title IS NOT NULL THEN format('She marked “%s” as arrived.', v_title)
        WHEN v_was_idea THEN 'She revealed one of your gift ideas.'
        ELSE 'She marked one of your gifts as arrived.'
      END,
      '/dashboard/wishlist',
      'wishlist_item',
      v_item.id
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_item.id,
    'arrived_at', v_item.arrived_at,
    'status', v_item.status,
    'fulfilled_at', v_item.fulfilled_at,
    'is_secret', false,
    'title', v_item.title,
    'notified', v_was_secret,
    'was_idea', v_was_idea
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_wishlist_purchase(
  p_item_id uuid,
  p_price_usd numeric,
  p_status text,
  p_fulfillment_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT;
  v_item public.wishlist_items;
  v_existing public.wishlist_purchases;
  v_week_start DATE;
  v_price_cents INTEGER;
  v_week_usd_used INTEGER := 0;
  v_week_items_used INTEGER := 0;
  v_weekly_usd_left INTEGER;
  v_weekly_items_left INTEGER;
  acct public.wishlist_budget_accounts;
  v_from_weekly_usd INTEGER := 0;
  v_from_credit_usd INTEGER := 0;
  v_from_weekly_items INTEGER := 0;
  v_from_credit_items INTEGER := 0;
  v_remaining INTEGER;
  v_fulfilled_at TIMESTAMPTZ;
  v_arrived_at TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = v_uid;
  IF v_role <> 'slave' THEN
    RAISE EXCEPTION 'Only the slave can record wishlist purchases';
  END IF;

  IF p_status NOT IN ('ordered', 'fulfilled', 'revealed') THEN
    RAISE EXCEPTION 'Purchase price is required for ordered, fulfilled, or revealed status';
  END IF;

  SELECT * INTO v_item FROM public.wishlist_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wishlist item not found';
  END IF;

  v_price_cents := ROUND(p_price_usd * 100)::INTEGER;
  IF v_price_cents <= 0 THEN
    RAISE EXCEPTION 'Enter a purchase price greater than zero';
  END IF;

  SELECT * INTO v_existing
  FROM public.wishlist_purchases
  WHERE wishlist_item_id = p_item_id;

  IF FOUND THEN
    v_fulfilled_at := CASE
      WHEN p_status IN ('fulfilled', 'revealed') THEN COALESCE(v_item.fulfilled_at, now())
      ELSE v_item.fulfilled_at
    END;
    v_arrived_at := CASE
      WHEN p_status = 'revealed' THEN COALESCE(v_item.arrived_at, now())
      ELSE v_item.arrived_at
    END;

    UPDATE public.wishlist_items
    SET
      status = p_status,
      fulfillment_notes = NULLIF(trim(p_fulfillment_notes), ''),
      fulfilled_at = v_fulfilled_at,
      arrived_at = v_arrived_at,
      updated_at = now()
    WHERE id = p_item_id;

    RETURN public.get_wishlist_budget(v_uid);
  END IF;

  acct := public.ensure_wishlist_budget_account(v_uid);
  v_week_start := public.wishlist_week_start_pt();

  SELECT
    COALESCE(SUM(from_weekly_usd_cents), 0),
    COALESCE(SUM(from_weekly_items), 0)
  INTO v_week_usd_used, v_week_items_used
  FROM public.wishlist_purchases
  WHERE user_id = v_uid
    AND week_start = v_week_start;

  v_weekly_usd_left := GREATEST(0, acct.weekly_usd_limit_cents - v_week_usd_used);
  v_weekly_items_left := GREATEST(0, acct.weekly_item_limit - v_week_items_used);

  IF v_weekly_items_left >= 1 THEN
    v_from_weekly_items := 1;
  ELSIF acct.credit_item_credits >= 1 THEN
    v_from_credit_items := 1;
  ELSE
    RAISE EXCEPTION 'No item credits left this week (%/week) or in bank',
      acct.weekly_item_limit;
  END IF;

  v_remaining := v_price_cents;
  v_from_weekly_usd := LEAST(v_remaining, v_weekly_usd_left);
  v_remaining := v_remaining - v_from_weekly_usd;
  v_from_credit_usd := v_remaining;

  IF v_from_credit_usd > acct.credit_usd_cents THEN
    RAISE EXCEPTION 'Not enough budget (% weekly + % credit USD remaining)',
      (v_weekly_usd_left / 100.0)::TEXT,
      (acct.credit_usd_cents / 100.0)::TEXT;
  END IF;

  UPDATE public.wishlist_budget_accounts
  SET
    credit_usd_cents = credit_usd_cents - v_from_credit_usd,
    credit_item_credits = credit_item_credits - v_from_credit_items,
    updated_at = now()
  WHERE user_id = v_uid;

  INSERT INTO public.wishlist_purchases (
    user_id,
    wishlist_item_id,
    price_usd_cents,
    week_start,
    from_weekly_usd_cents,
    from_credit_usd_cents,
    from_weekly_items,
    from_credit_items
  )
  VALUES (
    v_uid,
    p_item_id,
    v_price_cents,
    v_week_start,
    v_from_weekly_usd,
    v_from_credit_usd,
    v_from_weekly_items,
    v_from_credit_items
  );

  v_fulfilled_at := CASE
    WHEN p_status IN ('fulfilled', 'revealed') THEN now()
    ELSE NULL
  END;
  v_arrived_at := CASE
    WHEN p_status = 'revealed' THEN now()
    ELSE NULL
  END;

  UPDATE public.wishlist_items
  SET
    status = p_status,
    purchase_price_usd = p_price_usd,
    purchased_at = now(),
    fulfillment_notes = NULLIF(trim(p_fulfillment_notes), ''),
    fulfilled_at = v_fulfilled_at,
    arrived_at = COALESCE(arrived_at, v_arrived_at),
    seen_at = COALESCE(seen_at, now()),
    updated_at = now()
  WHERE id = p_item_id;

  RETURN public.get_wishlist_budget(v_uid);
END;
$$;

NOTIFY pgrst, 'reload schema';
