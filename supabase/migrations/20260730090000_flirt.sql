-- Flirt: Queen tracks guys + dated text/image entries for slave

CREATE TABLE public.flirt_guys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.users(id),
  assigned_to UUID NOT NULL REFERENCES public.users(id),
  name TEXT NOT NULL,
  photo_path TEXT,
  status TEXT NOT NULL DEFAULT 'looked'
    CHECK (status IN ('looked', 'chatting', 'fucked')),
  interest_level INT NOT NULL DEFAULT 50
    CHECK (interest_level BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_flirt_guys_assigned_to ON public.flirt_guys(assigned_to);
CREATE INDEX idx_flirt_guys_status ON public.flirt_guys(status, created_at DESC);
CREATE INDEX idx_flirt_guys_created_by ON public.flirt_guys(created_by);

ALTER TABLE public.flirt_guys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view relevant flirt_guys"
  ON public.flirt_guys FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR public.current_user_role() = 'queen'
  );

CREATE POLICY "Queen can create flirt_guys"
  ON public.flirt_guys FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'queen');

CREATE POLICY "Queen can update flirt_guys"
  ON public.flirt_guys FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'queen')
  WITH CHECK (public.current_user_role() = 'queen');

CREATE POLICY "Queen can delete flirt_guys"
  ON public.flirt_guys FOR DELETE TO authenticated
  USING (public.current_user_role() = 'queen');

CREATE OR REPLACE FUNCTION public.touch_flirt_guys_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_flirt_guys_updated_at
  BEFORE UPDATE ON public.flirt_guys
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_flirt_guys_updated_at();

CREATE TABLE public.flirt_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guy_id UUID NOT NULL REFERENCES public.flirt_guys(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.users(id),
  body TEXT,
  media_kind TEXT NOT NULL DEFAULT 'text'
    CHECK (media_kind IN ('text', 'image')),
  file_path TEXT,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT flirt_entries_content_check CHECK (
    (media_kind = 'text' AND (body IS NOT NULL AND char_length(trim(body)) > 0))
    OR (media_kind = 'image' AND file_path IS NOT NULL)
  )
);

CREATE INDEX idx_flirt_entries_guy_date
  ON public.flirt_entries(guy_id, entry_date DESC, created_at DESC);
CREATE INDEX idx_flirt_entries_author ON public.flirt_entries(author_id);

ALTER TABLE public.flirt_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view flirt_entries on relevant guys"
  ON public.flirt_entries FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.flirt_guys g
      WHERE g.id = flirt_entries.guy_id
        AND (
          g.created_by = auth.uid()
          OR g.assigned_to = auth.uid()
          OR public.current_user_role() = 'queen'
        )
    )
  );

CREATE POLICY "Queen can create flirt_entries"
  ON public.flirt_entries FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.current_user_role() = 'queen'
    AND EXISTS (
      SELECT 1 FROM public.flirt_guys g
      WHERE g.id = flirt_entries.guy_id
    )
  );

CREATE POLICY "Queen can delete flirt_entries"
  ON public.flirt_entries FOR DELETE TO authenticated
  USING (public.current_user_role() = 'queen');

INSERT INTO storage.buckets (id, name, public)
VALUES ('flirt', 'flirt', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can upload flirt"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'flirt');

CREATE POLICY "Authenticated can view flirt"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'flirt');

CREATE POLICY "Owners and queen can delete flirt files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'flirt'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR public.current_user_role() = 'queen'
    )
  );
