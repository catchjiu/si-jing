-- Fart Tracker: Queen records audio notes of farts for the chamber log.

CREATE TABLE IF NOT EXISTS public.fart_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  audio_path TEXT NOT NULL,
  duration_ms INT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fart_entries_audio_path_len CHECK (char_length(trim(audio_path)) > 0),
  CONSTRAINT fart_entries_note_len CHECK (
    note IS NULL OR char_length(trim(note)) <= 280
  )
);

CREATE INDEX IF NOT EXISTS idx_fart_entries_created
  ON public.fart_entries (created_at DESC);

ALTER TABLE public.fart_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view fart entries" ON public.fart_entries;
CREATE POLICY "Authenticated can view fart entries"
  ON public.fart_entries FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Queen can insert fart entries" ON public.fart_entries;
CREATE POLICY "Queen can insert fart entries"
  ON public.fart_entries FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'queen'
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Queen can delete own fart entries" ON public.fart_entries;
CREATE POLICY "Queen can delete own fart entries"
  ON public.fart_entries FOR DELETE TO authenticated
  USING (
    public.current_user_role() = 'queen'
    AND created_by = auth.uid()
  );

NOTIFY pgrst, 'reload schema';
