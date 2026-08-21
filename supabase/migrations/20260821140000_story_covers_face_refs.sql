-- Story blog covers + face reference photos for Grok Imagine.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS face_ref_path TEXT;

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS cover_image_path TEXT;

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS cover_prompt TEXT;

COMMENT ON COLUMN public.users.face_ref_path IS
  'Clear face reference photo for Grok Imagine blog covers (R2 path).';

COMMENT ON COLUMN public.stories.cover_image_path IS
  'Blog-style cover image path (R2 stories bucket).';

COMMENT ON COLUMN public.stories.cover_prompt IS
  'Prompt used to generate the cover image.';

NOTIFY pgrst, 'reload schema';
