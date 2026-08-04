-- Optional photo attachments on journal entries

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS image_path TEXT,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS accuracy_m DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_source TEXT CHECK (location_source IN ('exif', 'device'));

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_has_content;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_has_content CHECK (
    char_length(trim(body)) > 0
    OR (image_path IS NOT NULL AND char_length(trim(image_path)) > 0)
  );

NOTIFY pgrst, 'reload schema';
