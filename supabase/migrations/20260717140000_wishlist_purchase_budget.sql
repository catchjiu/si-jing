-- Wishlist purchase budget: $50 / 3 items per week (Mon PT), plus banked credit.

ALTER TABLE public.wishlist_items
  ADD COLUMN IF NOT EXISTS purchase_price_usd NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.wishlist_budget_accounts (
  user_id UUID PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  credit_usd_cents INTEGER NOT NULL DEFAULT 20000 CHECK (credit_usd_cents >= 0),
  credit_item_credits INTEGER NOT NULL DEFAULT 12 CHECK (credit_item_credits >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wishlist_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  wishlist_item_id UUID NOT NULL UNIQUE REFERENCES public.wishlist_items (id) ON DELETE CASCADE,
  price_usd_cents INTEGER NOT NULL CHECK (price_usd_cents > 0),
  week_start DATE NOT NULL,
  from_weekly_usd_cents INTEGER NOT NULL DEFAULT 0 CHECK (from_weekly_usd_cents >= 0),
  from_credit_usd_cents INTEGER NOT NULL DEFAULT 0 CHECK (from_credit_usd_cents >= 0),
  from_weekly_items INTEGER NOT NULL DEFAULT 0 CHECK (from_weekly_items >= 0),
  from_credit_items INTEGER NOT NULL DEFAULT 0 CHECK (from_credit_items >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wishlist_purchases_user_week
  ON public.wishlist_purchases (user_id, week_start);

ALTER TABLE public.wishlist_budget_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own wishlist budget" ON public.wishlist_budget_accounts;
CREATE POLICY "Users view own wishlist budget"
  ON public.wishlist_budget_accounts FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_role() = 'queen'
  );

DROP POLICY IF EXISTS "Slave manages own wishlist budget row" ON public.wishlist_budget_accounts;
CREATE POLICY "Slave manages own wishlist budget row"
  ON public.wishlist_budget_accounts FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    AND public.current_user_role() = 'slave'
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.current_user_role() = 'slave'
  );

DROP POLICY IF EXISTS "Users view wishlist purchases" ON public.wishlist_purchases;
CREATE POLICY "Users view wishlist purchases"
  ON public.wishlist_purchases FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_role() = 'queen'
  );

-- Seed default credit for existing slaves
INSERT INTO public.wishlist_budget_accounts (user_id, credit_usd_cents, credit_item_credits)
SELECT u.id, 20000, 12
FROM public.users u
WHERE u.role = 'slave'
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.wishlist_week_start_pt(p_at TIMESTAMPTZ DEFAULT now())
RETURNS DATE
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  local_date DATE;
BEGIN
  local_date := (p_at AT TIME ZONE 'America/Los_Angeles')::date;
  RETURN local_date - ((EXTRACT(DOW FROM local_date)::INTEGER + 6) % 7);
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_wishlist_budget_account(p_user_id UUID)
RETURNS public.wishlist_budget_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acct public.wishlist_budget_accounts;
BEGIN
  INSERT INTO public.wishlist_budget_accounts (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO acct
  FROM public.wishlist_budget_accounts
  WHERE user_id = p_user_id;

  RETURN acct;
END;
$$;

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
  v_weekly_usd_limit INTEGER := 5000;
  v_weekly_item_limit INTEGER := 3;
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
    'weekly_usd_limit_cents', v_weekly_usd_limit,
    'weekly_item_limit', v_weekly_item_limit,
    'weekly_usd_used_cents', v_week_usd_used,
    'weekly_items_used', v_week_items_used,
    'weekly_usd_remaining_cents', GREATEST(0, v_weekly_usd_limit - v_week_usd_used),
    'weekly_items_remaining', GREATEST(0, v_weekly_item_limit - v_week_items_used),
    'credit_usd_cents', acct.credit_usd_cents,
    'credit_items', acct.credit_item_credits,
    'total_usd_remaining_cents',
      GREATEST(0, v_weekly_usd_limit - v_week_usd_used) + acct.credit_usd_cents,
    'total_items_remaining',
      GREATEST(0, v_weekly_item_limit - v_week_items_used) + acct.credit_item_credits,
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
  v_weekly_usd_limit INTEGER := 5000;
  v_weekly_item_limit INTEGER := 3;
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

  v_weekly_usd_left := GREATEST(0, v_weekly_usd_limit - v_week_usd_used);
  v_weekly_items_left := GREATEST(0, v_weekly_item_limit - v_week_items_used);

  IF v_weekly_items_left >= 1 THEN
    v_from_weekly_items := 1;
  ELSIF acct.credit_item_credits >= 1 THEN
    v_from_credit_items := 1;
  ELSE
    RAISE EXCEPTION 'No item credits left this week (3/week) or in bank';
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

GRANT EXECUTE ON FUNCTION public.wishlist_week_start_pt(TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_wishlist_budget_account(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wishlist_budget(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_wishlist_purchase(UUID, NUMERIC, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
