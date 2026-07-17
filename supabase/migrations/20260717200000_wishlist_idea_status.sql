-- Add "idea" purchase status for priced gift plans (Reveal, not Arrived).

ALTER TABLE public.wishlist_items
  DROP CONSTRAINT IF EXISTS wishlist_items_status_check;

ALTER TABLE public.wishlist_items
  ADD CONSTRAINT wishlist_items_status_check
  CHECK (status IN ('new', 'seen', 'idea', 'ordered', 'fulfilled'));

NOTIFY pgrst, 'reload schema';
