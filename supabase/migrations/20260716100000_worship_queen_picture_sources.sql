-- Allow worship entries to reference Queen reward/tease images without re-uploading

ALTER TABLE public.worship_entries
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT NOT NULL DEFAULT 'worship',
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_id UUID;

ALTER TABLE public.worship_entries
  DROP CONSTRAINT IF EXISTS worship_entries_storage_bucket_check;
ALTER TABLE public.worship_entries
  ADD CONSTRAINT worship_entries_storage_bucket_check
  CHECK (storage_bucket IN ('worship', 'rewards', 'teases'));

ALTER TABLE public.worship_entries
  DROP CONSTRAINT IF EXISTS worship_entries_source_type_check;
ALTER TABLE public.worship_entries
  ADD CONSTRAINT worship_entries_source_type_check
  CHECK (
    source_type IS NULL
    OR source_type IN ('upload', 'reward', 'tease')
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_worship_entries_gallery_source
  ON public.worship_entries (gallery_id, source_type, source_id)
  WHERE source_id IS NOT NULL;
