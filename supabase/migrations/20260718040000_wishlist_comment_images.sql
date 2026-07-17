-- Allow image attachments on wishlist comment threads

ALTER TABLE public.wishlist_messages
  ADD COLUMN IF NOT EXISTS image_path TEXT;

ALTER TABLE public.wishlist_messages
  DROP CONSTRAINT IF EXISTS wishlist_messages_content_len;

ALTER TABLE public.wishlist_messages
  ALTER COLUMN content DROP NOT NULL;

ALTER TABLE public.wishlist_messages
  DROP CONSTRAINT IF EXISTS wishlist_messages_has_body;

ALTER TABLE public.wishlist_messages
  ADD CONSTRAINT wishlist_messages_has_body CHECK (
    (content IS NOT NULL AND char_length(trim(content)) > 0)
    OR (image_path IS NOT NULL AND char_length(trim(image_path)) > 0)
  );

NOTIFY pgrst, 'reload schema';
