-- Queen-adjustable spend limits + tighten budget account mutations to RPCs only.

ALTER TABLE public.wishlist_budget_accounts
  ADD COLUMN IF NOT EXISTS weekly_usd_limit_cents INTEGER NOT NULL DEFAULT 5000
    CHECK (weekly_usd_limit_cents >= 0),
  ADD COLUMN IF NOT EXISTS weekly_item_limit INTEGER NOT NULL DEFAULT 3
    CHECK (weekly_item_limit >= 0);

-- Slaves must not self-edit credit or limits; Queen uses set_wishlist_budget.
DROP POLICY IF EXISTS "Slave manages own wishlist budget row" ON public.wishlist_budget_accounts;

CREATE OR REPLACE FUNCTION public.get_wishlist_budget(p_user_id UUID DEFAULT auth.uid())
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_week_start DATE;
  v_week_usd_used INTEGER := 0;
  v_week_items_used INTEGER := 0;
  acct public.wishlist_budget_accounts;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = p_user_id;
  IF v_role IS NULL THEN
    RETURN NULL;
  END IF;

  IF auth.uid() <> p_user_id AND public.current_user_role() <> 'queen' THEN
    RAISE EXCEPTION 'Not allowed to view this budget';
  END IF;

  IF v_role <> 'slave' THEN
    RETURN jsonb_build_object('role', v_role, 'is_slave', false);
  END IF;

  acct := public.ensure_wishlist_budget_account(p_user_id);
  v_week_start := public.wishlist_week_start_pt();

  SELECT
    COALESCE(SUM(from_weekly_usd_cents), 0),
    COALESCE(SUM(from_weekly_items), 0)
  INTO v_week_usd_used, v_week_items_used
  FROM public.wishlist_purchases
  WHERE user_id = p_user_id
    AND week_start = v_week_start;

  RETURN jsonb_build_object(
    'role', 'slave',
    'is_slave', true,
    'week_start', v_week_start,
    'weekly_usd_limit_cents', acct.weekly_usd_limit_cents,
    'weekly_item_limit', acct.weekly_item_limit,
    'weekly_usd_used_cents', v_week_usd_used,
    'weekly_items_used', v_week_items_used,
    'weekly_usd_remaining_cents', GREATEST(0, acct.weekly_usd_limit_cents - v_week_usd_used),
    'weekly_items_remaining', GREATEST(0, acct.weekly_item_limit - v_week_items_used),
    'credit_usd_cents', acct.credit_usd_cents,
    'credit_items', acct.credit_item_credits,
    'total_usd_remaining_cents',
      GREATEST(0, acct.weekly_usd_limit_cents - v_week_usd_used) + acct.credit_usd_cents,
    'total_items_remaining',
      GREATEST(0, acct.weekly_item_limit - v_week_items_used) + acct.credit_item_credits,
    'resets_on', 'Monday (Pacific)'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_wishlist_purchase(
  p_item_id UUID,
  p_price_usd NUMERIC,
  p_status TEXT,
  p_fulfillment_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = v_uid;
  IF v_role <> 'slave' THEN
    RAISE EXCEPTION 'Only the slave can record wishlist purchases';
  END IF;

  IF p_status NOT IN ('ordered', 'fulfilled') THEN
    RAISE EXCEPTION 'Purchase price is required for ordered or fulfilled status';
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
      WHEN p_status = 'fulfilled' THEN COALESCE(v_item.fulfilled_at, now())
      ELSE v_item.fulfilled_at
    END;

    UPDATE public.wishlist_items
    SET
      status = p_status,
      fulfillment_notes = NULLIF(trim(p_fulfillment_notes), ''),
      fulfilled_at = v_fulfilled_at,
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
    WHEN p_status = 'fulfilled' THEN now()
    ELSE NULL
  END;

  UPDATE public.wishlist_items
  SET
    status = p_status,
    purchase_price_usd = p_price_usd,
    purchased_at = now(),
    fulfillment_notes = NULLIF(trim(p_fulfillment_notes), ''),
    fulfilled_at = v_fulfilled_at,
    seen_at = COALESCE(seen_at, now()),
    updated_at = now()
  WHERE id = p_item_id;

  RETURN public.get_wishlist_budget(v_uid);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_wishlist_budget(
  p_user_id UUID,
  p_weekly_usd_limit NUMERIC DEFAULT NULL,
  p_weekly_item_limit INTEGER DEFAULT NULL,
  p_credit_usd NUMERIC DEFAULT NULL,
  p_credit_items INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acct public.wishlist_budget_accounts;
  v_role TEXT;
  v_weekly_usd_cents INTEGER;
  v_credit_usd_cents INTEGER;
BEGIN
  IF public.current_user_role() <> 'queen' THEN
    RAISE EXCEPTION 'Only the Queen can adjust the spend limit';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Slave user id is required';
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = p_user_id;
  IF v_role IS DISTINCT FROM 'slave' THEN
    RAISE EXCEPTION 'Spend limits apply only to the slave';
  END IF;

  IF p_weekly_usd_limit IS NOT NULL THEN
    IF p_weekly_usd_limit < 0 THEN
      RAISE EXCEPTION 'Weekly USD limit cannot be negative';
    END IF;
    v_weekly_usd_cents := ROUND(p_weekly_usd_limit * 100)::INTEGER;
  END IF;

  IF p_weekly_item_limit IS NOT NULL AND p_weekly_item_limit < 0 THEN
    RAISE EXCEPTION 'Weekly item limit cannot be negative';
  END IF;

  IF p_credit_usd IS NOT NULL THEN
    IF p_credit_usd < 0 THEN
      RAISE EXCEPTION 'Credit USD cannot be negative';
    END IF;
    v_credit_usd_cents := ROUND(p_credit_usd * 100)::INTEGER;
  END IF;

  IF p_credit_items IS NOT NULL AND p_credit_items < 0 THEN
    RAISE EXCEPTION 'Credit items cannot be negative';
  END IF;

  acct := public.ensure_wishlist_budget_account(p_user_id);

  UPDATE public.wishlist_budget_accounts
  SET
    weekly_usd_limit_cents = COALESCE(v_weekly_usd_cents, weekly_usd_limit_cents),
    weekly_item_limit = COALESCE(p_weekly_item_limit, weekly_item_limit),
    credit_usd_cents = COALESCE(v_credit_usd_cents, credit_usd_cents),
    credit_item_credits = COALESCE(p_credit_items, credit_item_credits),
    updated_at = now()
  WHERE user_id = p_user_id;

  RETURN public.get_wishlist_budget(p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_wishlist_purchases(
  p_user_id UUID DEFAULT auth.uid(),
  p_week_only BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_start DATE;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  IF auth.uid() <> p_user_id AND public.current_user_role() <> 'queen' THEN
    RAISE EXCEPTION 'Not allowed to view these purchases';
  END IF;

  v_week_start := public.wishlist_week_start_pt();

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC)
      FROM (
        SELECT
          p.id,
          p.wishlist_item_id,
          p.price_usd_cents,
          p.week_start,
          p.from_weekly_usd_cents,
          p.from_credit_usd_cents,
          p.from_weekly_items,
          p.from_credit_items,
          p.created_at,
          i.title AS item_title,
          i.status AS item_status,
          i.item_kind,
          i.image_path
        FROM public.wishlist_purchases p
        JOIN public.wishlist_items i ON i.id = p.wishlist_item_id
        WHERE p.user_id = p_user_id
          AND (NOT p_week_only OR p.week_start = v_week_start)
      ) t
    ),
    '[]'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_wishlist_budget(UUID, NUMERIC, INTEGER, NUMERIC, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_wishlist_purchases(UUID, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
