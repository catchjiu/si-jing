-- Notify slave when Queen reveals a secret gift (Arrived).

CREATE OR REPLACE FUNCTION public.mark_wishlist_arrived(p_item_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.wishlist_items;
  v_was_secret BOOLEAN := false;
  v_title TEXT;
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
  v_title := NULLIF(trim(COALESCE(v_item.title, '')), '');

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

  IF v_was_secret AND v_item.created_by IS NOT NULL THEN
    PERFORM public.notify_user(
      v_item.created_by,
      'wishlist_gift_arrived',
      'Queen revealed your gift',
      CASE
        WHEN v_title IS NOT NULL THEN format('She marked “%s” as arrived.', v_title)
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
    'notified', v_was_secret
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_wishlist_arrived(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
