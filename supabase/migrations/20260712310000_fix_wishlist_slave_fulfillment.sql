-- Fix wishlist fulfillment: ensure columns + slave UPDATE policy on live DB

ALTER TABLE public.wishlist_items
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fulfillment_notes TEXT,
  ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ;

UPDATE public.wishlist_items SET status = 'new' WHERE status IS NULL;

ALTER TABLE public.wishlist_items
  ALTER COLUMN status SET DEFAULT 'new';

ALTER TABLE public.wishlist_items
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.wishlist_items DROP CONSTRAINT IF EXISTS wishlist_items_status_check;
ALTER TABLE public.wishlist_items ADD CONSTRAINT wishlist_items_status_check
  CHECK (status IN ('new', 'seen', 'ordered', 'fulfilled'));

DROP POLICY IF EXISTS "Slave can mark wishlist seen" ON public.wishlist_items;
DROP POLICY IF EXISTS "Slave can update wishlist fulfillment" ON public.wishlist_items;

CREATE POLICY "Slave can update wishlist fulfillment"
  ON public.wishlist_items FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'slave')
  WITH CHECK (public.current_user_role() = 'slave');
