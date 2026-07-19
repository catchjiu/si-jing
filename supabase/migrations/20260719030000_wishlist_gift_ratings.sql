-- Queen can rate revealed gifts 1–5 stars; both see ratings + section average.

ALTER TABLE public.wishlist_items
  ADD COLUMN IF NOT EXISTS queen_rating SMALLINT
    CHECK (queen_rating IS NULL OR (queen_rating >= 1 AND queen_rating <= 5)),
  ADD COLUMN IF NOT EXISTS queen_rated_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.rate_wishlist_gift(
  p_item_id UUID,
  p_rating INTEGER
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.wishlist_items;
BEGIN
  IF public.current_user_role() <> 'queen' THEN
    RAISE EXCEPTION 'Only the Queen can rate gifts';
  END IF;

  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5 stars';
  END IF;

  SELECT * INTO v_item FROM public.wishlist_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wishlist item not found';
  END IF;

  IF v_item.item_kind <> 'slave_gift' THEN
    RAISE EXCEPTION 'Only gifts from D can be rated';
  END IF;

  IF v_item.status <> 'revealed' AND v_item.arrived_at IS NULL THEN
    RAISE EXCEPTION 'Gift must be revealed before it can be rated';
  END IF;

  UPDATE public.wishlist_items
  SET
    queen_rating = p_rating,
    queen_rated_at = now(),
    updated_at = now()
  WHERE id = p_item_id
  RETURNING * INTO v_item;

  RETURN jsonb_build_object(
    'id', v_item.id,
    'queen_rating', v_item.queen_rating,
    'queen_rated_at', v_item.queen_rated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rate_wishlist_gift(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rate_wishlist_gift(UUID, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.fetch_wishlist_items()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
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
          i.queen_rating,
          i.queen_rated_at,
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

NOTIFY pgrst, 'reload schema';
