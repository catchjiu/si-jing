-- Slave gift items stay secret to Queen until she marks them arrived.

ALTER TABLE public.wishlist_items
  ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;

-- Direct SELECT cannot leak unrevealed gift details to Queen.
DROP POLICY IF EXISTS "Authenticated can view wishlist_items" ON public.wishlist_items;
DROP POLICY IF EXISTS "Users can view non-secret wishlist items" ON public.wishlist_items;
CREATE POLICY "Users can view non-secret wishlist items"
  ON public.wishlist_items FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'slave'
    OR item_kind IS DISTINCT FROM 'slave_gift'
    OR arrived_at IS NOT NULL
  );

CREATE OR REPLACE FUNCTION public.wishlist_is_secret_for_queen(p_item public.wishlist_items)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    p_item.item_kind = 'slave_gift'
    AND p_item.arrived_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.fetch_wishlist_items()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT := public.current_user_role();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC)
      FROM (
        SELECT
          i.id,
          i.created_by,
          i.item_kind,
          i.status,
          i.seen_at,
          i.fulfilled_at,
          i.updated_at,
          i.created_at,
          i.arrived_at,
          i.purchase_price_usd,
          i.purchased_at,
          CASE
            WHEN v_role = 'queen' AND public.wishlist_is_secret_for_queen(i)
              THEN NULL
            ELSE i.title
          END AS title,
          CASE
            WHEN v_role = 'queen' AND public.wishlist_is_secret_for_queen(i)
              THEN NULL
            ELSE i.notes
          END AS notes,
          CASE
            WHEN v_role = 'queen' AND public.wishlist_is_secret_for_queen(i)
              THEN NULL
            ELSE i.link_url
          END AS link_url,
          CASE
            WHEN v_role = 'queen' AND public.wishlist_is_secret_for_queen(i)
              THEN NULL
            ELSE i.image_path
          END AS image_path,
          CASE
            WHEN v_role = 'queen' AND public.wishlist_is_secret_for_queen(i)
              THEN NULL
            ELSE i.fulfillment_notes
          END AS fulfillment_notes,
          CASE
            WHEN v_role = 'queen' AND public.wishlist_is_secret_for_queen(i)
              THEN NULL
            ELSE i.latitude
          END AS latitude,
          CASE
            WHEN v_role = 'queen' AND public.wishlist_is_secret_for_queen(i)
              THEN NULL
            ELSE i.longitude
          END AS longitude,
          CASE
            WHEN v_role = 'queen' AND public.wishlist_is_secret_for_queen(i)
              THEN NULL
            ELSE i.accuracy_m
          END AS accuracy_m,
          CASE
            WHEN v_role = 'queen' AND public.wishlist_is_secret_for_queen(i)
              THEN NULL
            ELSE i.location_source
          END AS location_source,
          (v_role = 'queen' AND public.wishlist_is_secret_for_queen(i)) AS is_secret
        FROM public.wishlist_items i
      ) t
    ),
    '[]'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_wishlist_arrived(p_item_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.wishlist_items;
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

  UPDATE public.wishlist_items
  SET
    arrived_at = COALESCE(arrived_at, now()),
    status = CASE
      WHEN status IN ('ordered', 'fulfilled') THEN 'fulfilled'
      ELSE status
    END,
    fulfilled_at = CASE
      WHEN status IN ('ordered', 'fulfilled') THEN COALESCE(fulfilled_at, now())
      ELSE fulfilled_at
    END,
    updated_at = now()
  WHERE id = p_item_id
  RETURNING * INTO v_item;

  RETURN jsonb_build_object(
    'id', v_item.id,
    'arrived_at', v_item.arrived_at,
    'status', v_item.status,
    'fulfilled_at', v_item.fulfilled_at,
    'is_secret', false
  );
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
  v_role TEXT := public.current_user_role();
BEGIN
  IF p_user_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  IF auth.uid() <> p_user_id AND v_role <> 'queen' THEN
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
          CASE
            WHEN v_role = 'queen' AND public.wishlist_is_secret_for_queen(i)
              THEN NULL
            ELSE i.title
          END AS item_title,
          i.status AS item_status,
          i.item_kind,
          CASE
            WHEN v_role = 'queen' AND public.wishlist_is_secret_for_queen(i)
              THEN NULL
            ELSE i.image_path
          END AS image_path,
          i.arrived_at,
          (v_role = 'queen' AND public.wishlist_is_secret_for_queen(i)) AS is_secret
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

GRANT EXECUTE ON FUNCTION public.wishlist_is_secret_for_queen(public.wishlist_items) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_wishlist_items() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_wishlist_arrived(UUID) TO authenticated;

-- Hide gift comments from Queen until the gift is revealed.
DROP POLICY IF EXISTS "Authenticated can view wishlist messages" ON public.wishlist_messages;
DROP POLICY IF EXISTS "Users can view non-secret wishlist messages" ON public.wishlist_messages;
CREATE POLICY "Users can view non-secret wishlist messages"
  ON public.wishlist_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.wishlist_items i
      WHERE i.id = wishlist_id
        AND (
          public.current_user_role() = 'slave'
          OR i.item_kind IS DISTINCT FROM 'slave_gift'
          OR i.arrived_at IS NOT NULL
        )
    )
  );

DROP POLICY IF EXISTS "Authenticated can send wishlist messages" ON public.wishlist_messages;
DROP POLICY IF EXISTS "Users can send non-secret wishlist messages" ON public.wishlist_messages;
CREATE POLICY "Users can send non-secret wishlist messages"
  ON public.wishlist_messages FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.wishlist_items i
      WHERE i.id = wishlist_id
        AND (
          public.current_user_role() = 'slave'
          OR i.item_kind IS DISTINCT FROM 'slave_gift'
          OR i.arrived_at IS NOT NULL
        )
    )
  );

NOTIFY pgrst, 'reload schema';
