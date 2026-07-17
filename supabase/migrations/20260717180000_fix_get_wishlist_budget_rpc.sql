-- Recreate get_wishlist_budget as VOLATILE so PostgREST always accepts POST (fixes 405).

DROP FUNCTION IF EXISTS public.get_wishlist_budget(UUID);

CREATE OR REPLACE FUNCTION public.get_wishlist_budget(p_user_id UUID DEFAULT auth.uid())
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
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

GRANT EXECUTE ON FUNCTION public.get_wishlist_budget(UUID) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
