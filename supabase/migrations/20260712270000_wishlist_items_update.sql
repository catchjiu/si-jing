-- Allow Queen to edit wishlist item metadata / image path
CREATE POLICY "Queen can update wishlist_items"
  ON public.wishlist_items FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'queen')
  WITH CHECK (public.current_user_role() = 'queen');
