-- Locked wallet: Queen must approve slave wishlist purchases / apartment fund adds

CREATE TABLE IF NOT EXISTS public.wallet_spend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('wishlist_purchase', 'apartment_fund')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied')),
  wishlist_item_id UUID REFERENCES public.wishlist_items(id) ON DELETE CASCADE,
  price_usd NUMERIC,
  target_status TEXT CHECK (
    target_status IS NULL OR target_status IN ('ordered', 'fulfilled', 'revealed')
  ),
  fulfillment_notes TEXT,
  amount_ntd NUMERIC,
  note TEXT,
  beg_message TEXT,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wallet_spend_requests_kind_shape CHECK (
    (kind = 'wishlist_purchase'
      AND wishlist_item_id IS NOT NULL
      AND price_usd IS NOT NULL
      AND target_status IS NOT NULL)
    OR
    (kind = 'apartment_fund'
      AND amount_ntd IS NOT NULL
      AND amount_ntd > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_wallet_spend_requests_status
  ON public.wallet_spend_requests (status, created_at DESC);

ALTER TABLE public.wallet_spend_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view wallet spend requests" ON public.wallet_spend_requests;
CREATE POLICY "Users can view wallet spend requests"
  ON public.wallet_spend_requests FOR SELECT TO authenticated
  USING (
    requested_by = auth.uid()
    OR public.current_user_role() = 'queen'
  );

DROP POLICY IF EXISTS "Slave can insert wallet spend requests" ON public.wallet_spend_requests;
CREATE POLICY "Slave can insert wallet spend requests"
  ON public.wallet_spend_requests FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'slave'
    AND requested_by = auth.uid()
  );

DROP POLICY IF EXISTS "Queen can update wallet spend requests" ON public.wallet_spend_requests;
CREATE POLICY "Queen can update wallet spend requests"
  ON public.wallet_spend_requests FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'queen')
  WITH CHECK (public.current_user_role() = 'queen');

INSERT INTO public.pair_settings (key, value)
VALUES ('locked_wallet', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_wallet_locked()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (value->>'enabled')::boolean
     FROM public.pair_settings
     WHERE key = 'locked_wallet'),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.set_locked_wallet(p_enabled BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() <> 'queen' THEN
    RAISE EXCEPTION 'Only Queen can toggle locked wallet';
  END IF;

  INSERT INTO public.pair_settings (key, value, updated_by, updated_at)
  VALUES (
    'locked_wallet',
    jsonb_build_object('enabled', COALESCE(p_enabled, false)),
    auth.uid(),
    NOW()
  )
  ON CONFLICT (key) DO UPDATE
  SET
    value = jsonb_build_object('enabled', COALESCE(p_enabled, false)),
    updated_by = auth.uid(),
    updated_at = NOW();

  RETURN COALESCE(p_enabled, false);
END;
$$;

-- Block direct slave purchases when locked
CREATE OR REPLACE FUNCTION public.guard_record_wishlist_purchase_locked()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() = 'slave' AND public.is_wallet_locked() THEN
    RAISE EXCEPTION 'Wallet is locked — beg Queen to approve this purchase';
  END IF;
END;
$$;

-- Patch record_wishlist_purchase to enforce lock (wrap via replacing function start)
-- We recreate by reading current definition is heavy; instead add check via a thin wrapper
-- that slaves/UI call: request_wallet_spend / review_wallet_spend.
-- Also harden the existing RPC by redefining with the lock check injected after role check.

CREATE OR REPLACE FUNCTION public.request_wallet_spend(
  p_kind TEXT,
  p_wishlist_item_id UUID DEFAULT NULL,
  p_price_usd NUMERIC DEFAULT NULL,
  p_target_status TEXT DEFAULT NULL,
  p_fulfillment_notes TEXT DEFAULT NULL,
  p_amount_ntd NUMERIC DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_beg_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req_id UUID;
BEGIN
  IF public.current_user_role() <> 'slave' THEN
    RAISE EXCEPTION 'Only D can beg for wallet spend';
  END IF;

  IF NOT public.is_wallet_locked() THEN
    RAISE EXCEPTION 'Wallet is not locked — spend normally';
  END IF;

  IF p_kind = 'wishlist_purchase' THEN
    IF p_wishlist_item_id IS NULL OR p_price_usd IS NULL OR p_target_status IS NULL THEN
      RAISE EXCEPTION 'Wishlist purchase request needs item, price, and status';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.wallet_spend_requests
      WHERE requested_by = auth.uid()
        AND kind = 'wishlist_purchase'
        AND wishlist_item_id = p_wishlist_item_id
        AND status = 'pending'
    ) THEN
      RAISE EXCEPTION 'You already have a pending beg for this item';
    END IF;
  ELSIF p_kind = 'apartment_fund' THEN
    IF p_amount_ntd IS NULL OR p_amount_ntd <= 0 THEN
      RAISE EXCEPTION 'Apartment fund request needs a positive amount';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid spend kind';
  END IF;

  INSERT INTO public.wallet_spend_requests (
    requested_by,
    kind,
    wishlist_item_id,
    price_usd,
    target_status,
    fulfillment_notes,
    amount_ntd,
    note,
    beg_message
  ) VALUES (
    auth.uid(),
    p_kind,
    p_wishlist_item_id,
    p_price_usd,
    p_target_status,
    NULLIF(trim(COALESCE(p_fulfillment_notes, '')), ''),
    p_amount_ntd,
    NULLIF(trim(COALESCE(p_note, '')), ''),
    NULLIF(trim(COALESCE(p_beg_message, '')), '')
  )
  RETURNING id INTO req_id;

  INSERT INTO public.notifications (user_id, kind, title, body, href)
  SELECT
    u.id,
    'wallet_spend_request',
    'Wallet beg',
    CASE
      WHEN p_kind = 'wishlist_purchase' THEN 'D wants approval to buy a wishlist item'
      ELSE 'D wants approval to add to the apartment fund'
    END,
    '/dashboard/wishlist'
  FROM public.users u
  WHERE u.role = 'queen'
  LIMIT 1;

  RETURN req_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_wallet_spend(
  p_request_id UUID,
  p_approve BOOLEAN
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.wallet_spend_requests%ROWTYPE;
  v_slave UUID;
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
    SET status = 'denied', reviewed_by = auth.uid(), reviewed_at = NOW()
    WHERE id = r.id;

    INSERT INTO public.notifications (user_id, kind, title, body, href)
    VALUES (
      r.requested_by,
      'wallet_spend_denied',
      'Wallet beg denied',
      'Queen denied your spend request.',
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
  SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = NOW()
  WHERE id = r.id;

  INSERT INTO public.notifications (user_id, kind, title, body, href)
  VALUES (
    r.requested_by,
    'wallet_spend_approved',
    'Wallet beg approved',
    'Queen approved your spend request.',
    '/dashboard/wishlist'
  );

  RETURN r.id;
END;
$$;

-- Internal purchase executor used by Queen approval (no slave-role check)
CREATE OR REPLACE FUNCTION public.admin_record_wishlist_purchase_for_slave(
  p_slave_id UUID,
  p_item_id UUID,
  p_price_usd NUMERIC,
  p_status TEXT,
  p_fulfillment_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
  IF public.current_user_role() <> 'queen' THEN
    RAISE EXCEPTION 'Only Queen can approve purchases';
  END IF;

  IF p_status NOT IN ('ordered', 'fulfilled', 'revealed') THEN
    RAISE EXCEPTION 'Invalid purchase status';
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
      fulfillment_notes = NULLIF(trim(COALESCE(p_fulfillment_notes, '')), ''),
      fulfilled_at = v_fulfilled_at,
      arrived_at = v_arrived_at,
      updated_at = now()
    WHERE id = p_item_id;
    RETURN;
  END IF;

  acct := public.ensure_wishlist_budget_account(p_slave_id);
  v_week_start := public.wishlist_week_start_pt();

  SELECT
    COALESCE(SUM(from_weekly_usd_cents), 0),
    COALESCE(SUM(from_weekly_items), 0)
  INTO v_week_usd_used, v_week_items_used
  FROM public.wishlist_purchases
  WHERE user_id = p_slave_id
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
  WHERE user_id = p_slave_id;

  INSERT INTO public.wishlist_purchases (
    user_id,
    wishlist_item_id,
    price_usd_cents,
    week_start,
    from_weekly_usd_cents,
    from_credit_usd_cents,
    from_weekly_items,
    from_credit_items
  ) VALUES (
    p_slave_id,
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
    fulfillment_notes = NULLIF(trim(COALESCE(p_fulfillment_notes, '')), ''),
    purchase_price_usd = p_price_usd,
    purchased_at = now(),
    fulfilled_at = v_fulfilled_at,
    arrived_at = v_arrived_at,
    updated_at = now()
  WHERE id = p_item_id;
END;
$$;

-- Enforce lock on slave-facing record_wishlist_purchase
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = v_uid;
  IF v_role <> 'slave' THEN
    RAISE EXCEPTION 'Only the slave can record wishlist purchases';
  END IF;

  IF public.is_wallet_locked() THEN
    RAISE EXCEPTION 'Wallet is locked — beg Queen to approve this purchase';
  END IF;

  -- Delegate to admin helper by briefly using slave id path without queen check:
  -- Re-implement by calling a slave-allowed internal that skips lock.
  RETURN public.record_wishlist_purchase_unlocked(
    p_item_id, p_price_usd, p_status, p_fulfillment_notes
  );
END;
$$;

-- Keep unlocked implementation as previous body renamed
-- Pull from latest migration body via admin helper for slave self-spend when unlocked
CREATE OR REPLACE FUNCTION public.record_wishlist_purchase_unlocked(
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
      fulfillment_notes = NULLIF(trim(COALESCE(p_fulfillment_notes, '')), ''),
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
  ) VALUES (
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
    fulfillment_notes = NULLIF(trim(COALESCE(p_fulfillment_notes, '')), ''),
    purchase_price_usd = p_price_usd,
    purchased_at = now(),
    fulfilled_at = COALESCE(v_fulfilled_at, fulfilled_at),
    arrived_at = COALESCE(v_arrived_at, arrived_at),
    updated_at = now()
  WHERE id = p_item_id;

  RETURN public.get_wishlist_budget(v_uid);
END;
$$;

-- Block direct apartment fund inserts by slave when locked
CREATE OR REPLACE FUNCTION public.guard_apartment_fund_locked()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() = 'slave' AND public.is_wallet_locked() THEN
    RAISE EXCEPTION 'Wallet is locked — beg Queen to approve apartment fund adds';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_apartment_fund_locked ON public.queen_apartment_fund_entries;
CREATE TRIGGER trg_guard_apartment_fund_locked
  BEFORE INSERT ON public.queen_apartment_fund_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_apartment_fund_locked();

GRANT EXECUTE ON FUNCTION public.is_wallet_locked() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_locked_wallet(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_wallet_spend(TEXT, UUID, NUMERIC, TEXT, TEXT, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_wallet_spend(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_wishlist_purchase_for_slave(UUID, UUID, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_wishlist_purchase_unlocked(UUID, NUMERIC, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
