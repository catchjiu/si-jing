-- Allow image attachments on worship comment threads

ALTER TABLE public.worship_messages
  ADD COLUMN IF NOT EXISTS image_path TEXT;

ALTER TABLE public.worship_gallery_messages
  ADD COLUMN IF NOT EXISTS image_path TEXT;

ALTER TABLE public.worship_messages
  DROP CONSTRAINT IF EXISTS worship_messages_content_len;

ALTER TABLE public.worship_messages
  ALTER COLUMN content DROP NOT NULL;

ALTER TABLE public.worship_messages
  DROP CONSTRAINT IF EXISTS worship_messages_has_body;

ALTER TABLE public.worship_messages
  ADD CONSTRAINT worship_messages_has_body CHECK (
    (content IS NOT NULL AND char_length(trim(content)) > 0)
    OR (image_path IS NOT NULL AND char_length(trim(image_path)) > 0)
  );

ALTER TABLE public.worship_gallery_messages
  DROP CONSTRAINT IF EXISTS worship_gallery_messages_content_len;

ALTER TABLE public.worship_gallery_messages
  ALTER COLUMN content DROP NOT NULL;

ALTER TABLE public.worship_gallery_messages
  DROP CONSTRAINT IF EXISTS worship_gallery_messages_has_body;

ALTER TABLE public.worship_gallery_messages
  ADD CONSTRAINT worship_gallery_messages_has_body CHECK (
    (content IS NOT NULL AND char_length(trim(content)) > 0)
    OR (image_path IS NOT NULL AND char_length(trim(image_path)) > 0)
  );

NOTIFY pgrst, 'reload schema';
