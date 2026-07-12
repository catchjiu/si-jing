-- Queen-curated evidence from dates, teases, and voice notes
CREATE TABLE public.evidence_pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pinned_by UUID NOT NULL REFERENCES public.users(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('date', 'tease', 'voice_note')),
  source_id UUID NOT NULL,
  media_kind TEXT NOT NULL CHECK (media_kind IN ('youtube', 'image', 'voice', 'reaction')),
  title TEXT NOT NULL,
  caption TEXT,
  youtube_url TEXT,
  file_path TEXT,
  storage_bucket TEXT CHECK (storage_bucket IS NULL OR storage_bucket IN ('teases', 'voice', 'submissions')),
  meta JSONB,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_type, source_id, media_kind)
);

CREATE INDEX idx_evidence_pins_pinned_at ON public.evidence_pins(pinned_at DESC);
CREATE INDEX idx_evidence_pins_source ON public.evidence_pins(source_type, source_id);

ALTER TABLE public.evidence_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view evidence_pins"
  ON public.evidence_pins FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Queen can create evidence_pins"
  ON public.evidence_pins FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'queen' AND pinned_by = auth.uid());

CREATE POLICY "Queen can update evidence_pins"
  ON public.evidence_pins FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'queen')
  WITH CHECK (public.current_user_role() = 'queen');

CREATE POLICY "Queen can delete evidence_pins"
  ON public.evidence_pins FOR DELETE TO authenticated
  USING (public.current_user_role() = 'queen');
