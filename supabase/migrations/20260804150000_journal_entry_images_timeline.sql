-- Multi-image timeline photos for journal entries

CREATE TABLE IF NOT EXISTS public.journal_entry_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  taken_at TIMESTAMPTZ,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy_m DOUBLE PRECISION,
  location_source TEXT CHECK (location_source IN ('exif', 'device')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_entry_images_entry
  ON public.journal_entry_images(entry_id, sort_order ASC, taken_at ASC NULLS LAST);

ALTER TABLE public.journal_entry_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view journal_entry_images on visible entries"
  ON public.journal_entry_images;
CREATE POLICY "Users can view journal_entry_images on visible entries"
  ON public.journal_entry_images FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.journal_entries e
      WHERE e.id = journal_entry_images.entry_id
        AND (e.author_id = auth.uid() OR e.visibility = 'shared')
    )
  );

DROP POLICY IF EXISTS "Slave can insert journal_entry_images"
  ON public.journal_entry_images;
CREATE POLICY "Slave can insert journal_entry_images"
  ON public.journal_entry_images FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'slave'
    AND EXISTS (
      SELECT 1 FROM public.journal_entries e
      WHERE e.id = journal_entry_images.entry_id
        AND e.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Slave can update journal_entry_images"
  ON public.journal_entry_images;
CREATE POLICY "Slave can update journal_entry_images"
  ON public.journal_entry_images FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'slave'
    AND EXISTS (
      SELECT 1 FROM public.journal_entries e
      WHERE e.id = journal_entry_images.entry_id
        AND e.author_id = auth.uid()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'slave'
    AND EXISTS (
      SELECT 1 FROM public.journal_entries e
      WHERE e.id = journal_entry_images.entry_id
        AND e.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Slave can delete journal_entry_images"
  ON public.journal_entry_images;
CREATE POLICY "Slave can delete journal_entry_images"
  ON public.journal_entry_images FOR DELETE TO authenticated
  USING (
    public.current_user_role() = 'slave'
    AND EXISTS (
      SELECT 1 FROM public.journal_entries e
      WHERE e.id = journal_entry_images.entry_id
        AND e.author_id = auth.uid()
    )
  );

-- Backfill legacy single image_path into child rows
INSERT INTO public.journal_entry_images (
  entry_id,
  image_path,
  sort_order,
  taken_at,
  latitude,
  longitude,
  accuracy_m,
  location_source
)
SELECT
  e.id,
  e.image_path,
  0,
  e.created_at,
  e.latitude,
  e.longitude,
  e.accuracy_m,
  e.location_source
FROM public.journal_entries e
WHERE e.image_path IS NOT NULL
  AND char_length(trim(e.image_path)) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.journal_entry_images i
    WHERE i.entry_id = e.id
  );

NOTIFY pgrst, 'reload schema';
