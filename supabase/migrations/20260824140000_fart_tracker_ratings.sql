-- Fart Tracker: date of fart, slave loudness/hotness ratings, comments.

ALTER TABLE public.fart_entries
  ADD COLUMN IF NOT EXISTS fart_date DATE;

UPDATE public.fart_entries
SET fart_date = (created_at AT TIME ZONE 'UTC')::date
WHERE fart_date IS NULL;

ALTER TABLE public.fart_entries
  ALTER COLUMN fart_date SET DEFAULT CURRENT_DATE;

ALTER TABLE public.fart_entries
  ALTER COLUMN fart_date SET NOT NULL;

ALTER TABLE public.fart_entries
  ADD COLUMN IF NOT EXISTS loudness INTEGER;

ALTER TABLE public.fart_entries
  ADD COLUMN IF NOT EXISTS hotness INTEGER;

ALTER TABLE public.fart_entries
  ADD COLUMN IF NOT EXISTS rated_at TIMESTAMPTZ;

ALTER TABLE public.fart_entries
  ADD COLUMN IF NOT EXISTS rated_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.fart_entries
  DROP CONSTRAINT IF EXISTS fart_entries_loudness_chk;
ALTER TABLE public.fart_entries
  ADD CONSTRAINT fart_entries_loudness_chk
  CHECK (loudness IS NULL OR loudness BETWEEN 0 AND 100);

ALTER TABLE public.fart_entries
  DROP CONSTRAINT IF EXISTS fart_entries_hotness_chk;
ALTER TABLE public.fart_entries
  ADD CONSTRAINT fart_entries_hotness_chk
  CHECK (hotness IS NULL OR hotness BETWEEN 0 AND 100);

CREATE INDEX IF NOT EXISTS idx_fart_entries_fart_date
  ON public.fart_entries (fart_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.fart_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.fart_entries(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fart_comments_content_len CHECK (char_length(trim(content)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_fart_comments_entry
  ON public.fart_comments (entry_id, created_at ASC);

ALTER TABLE public.fart_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view fart comments" ON public.fart_comments;
CREATE POLICY "Authenticated can view fart comments"
  ON public.fart_comments FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated can comment on farts" ON public.fart_comments;
CREATE POLICY "Authenticated can comment on farts"
  ON public.fart_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.current_user_role() IN ('queen', 'slave')
  );

DROP POLICY IF EXISTS "Authors or queen can delete fart comments" ON public.fart_comments;
CREATE POLICY "Authors or queen can delete fart comments"
  ON public.fart_comments FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.current_user_role() = 'queen'
  );

DROP POLICY IF EXISTS "Slave can rate fart entries" ON public.fart_entries;
CREATE POLICY "Slave can rate fart entries"
  ON public.fart_entries FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'slave')
  WITH CHECK (public.current_user_role() = 'slave');

CREATE OR REPLACE FUNCTION public.guard_fart_entry_slave_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() = 'slave' THEN
    IF NEW.audio_path IS DISTINCT FROM OLD.audio_path
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.note IS DISTINCT FROM OLD.note
      OR NEW.duration_ms IS DISTINCT FROM OLD.duration_ms
      OR NEW.fart_date IS DISTINCT FROM OLD.fart_date
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Slave can only set loudness and hotness';
    END IF;
    NEW.rated_by := auth.uid();
    NEW.rated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_fart_entry_slave_update ON public.fart_entries;
CREATE TRIGGER trg_guard_fart_entry_slave_update
  BEFORE UPDATE ON public.fart_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_fart_entry_slave_update();

ALTER TABLE public.direct_messages
  DROP CONSTRAINT IF EXISTS direct_messages_attachment_type_check;

ALTER TABLE public.direct_messages
  ADD CONSTRAINT direct_messages_attachment_type_check
  CHECK (
    attachment_type IS NULL
    OR attachment_type IN (
      'tease', 'task', 'punishment', 'reward', 'request',
      'date', 'journal', 'submission', 'wishlist', 'worship',
      'worship_assignment', 'denial', 'jealousy_mission', 'story', 'fart'
    )
  );

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.fart_comments;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
