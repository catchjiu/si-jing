-- Slave can suggest gifts to buy for Queen (separate from Queen's taste items)

ALTER TABLE public.wishlist_items
  ADD COLUMN IF NOT EXISTS item_kind TEXT NOT NULL DEFAULT 'queen_taste';

UPDATE public.wishlist_items SET item_kind = 'queen_taste' WHERE item_kind IS NULL;

ALTER TABLE public.wishlist_items DROP CONSTRAINT IF EXISTS wishlist_items_item_kind_check;
ALTER TABLE public.wishlist_items ADD CONSTRAINT wishlist_items_item_kind_check
  CHECK (item_kind IN ('queen_taste', 'slave_gift'));

DROP POLICY IF EXISTS "Slave can create gift wishlist items" ON public.wishlist_items;
CREATE POLICY "Slave can create gift wishlist items"
  ON public.wishlist_items FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
    AND item_kind = 'slave_gift'
  );

DROP POLICY IF EXISTS "Slave can update own gift wishlist items" ON public.wishlist_items;
CREATE POLICY "Slave can update own gift wishlist items"
  ON public.wishlist_items FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
    AND item_kind = 'slave_gift'
  )
  WITH CHECK (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
    AND item_kind = 'slave_gift'
  );

DROP POLICY IF EXISTS "Slave can delete own gift wishlist items" ON public.wishlist_items;
CREATE POLICY "Slave can delete own gift wishlist items"
  ON public.wishlist_items FOR DELETE TO authenticated
  USING (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
    AND item_kind = 'slave_gift'
  );

NOTIFY pgrst, 'reload schema';
