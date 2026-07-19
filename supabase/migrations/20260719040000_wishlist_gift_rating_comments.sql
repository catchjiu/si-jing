-- Short Queen feedback next to gift star ratings (helps slave buy better).

ALTER TABLE public.wishlist_items
  ADD COLUMN IF NOT EXISTS queen_rating_comment TEXT;

ALTER TABLE public.wishlist_items
  DROP CONSTRAINT IF EXISTS wishlist_items_queen_rating_comment_len;

ALTER TABLE public.wishlist_items
  ADD CONSTRAINT wishlist_items_queen_rating_comment_len
  CHECK (
    queen_rating_comment IS NULL
    OR char_length(queen_rating_comment) <= 200
  );

DROP FUNCTION IF EXISTS public.rate_wishlist_gift(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.rate_wishlist_gift(
  p_item_id UUID,
  p_rating INTEGER DEFAULT NULL,
  p_comment TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.wishlist_items;
  v_comment TEXT;
BEGIN
  IF public.current_user_role() <> 'queen' THEN
    RAISE EXCEPTION 'Only the Queen can rate gifts';
  END IF;

  IF p_rating IS NULL AND p_comment IS NULL THEN
    RAISE EXCEPTION 'Provide a star rating or a short comment';
  END IF;

  IF p_rating IS NOT NULL AND (p_rating < 1 OR p_rating > 5) THEN
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

  IF p_comment IS NOT NULL THEN
    v_comment := nullif(btrim(p_comment), '');
    IF v_comment IS NOT NULL AND char_length(v_comment) > 200 THEN
      RAISE EXCEPTION 'Comment must be 200 characters or fewer';
    END IF;
  END IF;

  UPDATE public.wishlist_items
  SET
    queen_rating = COALESCE(p_rating, queen_rating),
    queen_rated_at = CASE
      WHEN p_rating IS NOT NULL THEN now()
      ELSE queen_rated_at
    END,
    queen_rating_comment = CASE
      WHEN p_comment IS NOT NULL THEN v_comment
      ELSE queen_rating_comment
    END,
    updated_at = now()
  WHERE id = p_item_id
  RETURNING * INTO v_item;

  RETURN jsonb_build_object(
    'id', v_item.id,
    'queen_rating', v_item.queen_rating,
    'queen_rated_at', v_item.queen_rated_at,
    'queen_rating_comment', v_item.queen_rating_comment
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rate_wishlist_gift(UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rate_wishlist_gift(UUID, INTEGER, TEXT) TO authenticated;

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
          i.queen_rating_comment,
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
