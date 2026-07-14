-- Worship: slave tribute photos of Queen with love rating and comments

CREATE TABLE public.worship_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  image_path TEXT NOT NULL,
  love_level INTEGER NOT NULL DEFAULT 50
    CHECK (love_level >= 1 AND love_level <= 100),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy_m DOUBLE PRECISION,
  location_source TEXT CHECK (location_source IS NULL OR location_source IN ('exif', 'device')),
  viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_worship_entries_created_at ON public.worship_entries(created_at DESC);
CREATE INDEX idx_worship_entries_created_by ON public.worship_entries(created_by);

ALTER TABLE public.worship_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view worship entries"
  ON public.worship_entries FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Slave can create worship entries"
  ON public.worship_entries FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
  );

CREATE POLICY "Slave can update own worship entries"
  ON public.worship_entries FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
  )
  WITH CHECK (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
  );

CREATE POLICY "Queen can update worship entries"
  ON public.worship_entries FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'queen')
  WITH CHECK (public.current_user_role() = 'queen');

CREATE POLICY "Slave can delete own worship entries"
  ON public.worship_entries FOR DELETE TO authenticated
  USING (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
  );

CREATE POLICY "Queen can delete worship entries"
  ON public.worship_entries FOR DELETE TO authenticated
  USING (public.current_user_role() = 'queen');

CREATE OR REPLACE FUNCTION public.guard_worship_queen_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.current_user_role() <> 'queen' THEN
    RETURN NEW;
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.image_path IS DISTINCT FROM OLD.image_path
     OR NEW.love_level IS DISTINCT FROM OLD.love_level
     OR NEW.latitude IS DISTINCT FROM OLD.latitude
     OR NEW.longitude IS DISTINCT FROM OLD.longitude
     OR NEW.accuracy_m IS DISTINCT FROM OLD.accuracy_m
     OR NEW.location_source IS DISTINCT FROM OLD.location_source
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    RAISE EXCEPTION 'Queen may only update viewed_at on worship entries';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_worship_queen_update ON public.worship_entries;
CREATE TRIGGER trg_guard_worship_queen_update
  BEFORE UPDATE ON public.worship_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_worship_queen_update();

CREATE OR REPLACE FUNCTION public.set_worship_entries_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS worship_entries_updated_at ON public.worship_entries;
CREATE TRIGGER worship_entries_updated_at
  BEFORE UPDATE ON public.worship_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_worship_entries_updated_at();

CREATE TABLE public.worship_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worship_id UUID NOT NULL REFERENCES public.worship_entries(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT worship_messages_content_len CHECK (char_length(trim(content)) > 0)
);

CREATE INDEX idx_worship_messages_worship_id
  ON public.worship_messages(worship_id, created_at ASC);

ALTER TABLE public.worship_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view worship messages"
  ON public.worship_messages FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can send worship messages"
  ON public.worship_messages FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors and queen can delete worship messages"
  ON public.worship_messages FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.current_user_role() = 'queen'
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('worship', 'worship', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can upload worship"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'worship');

CREATE POLICY "Authenticated can view worship"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'worship');

CREATE POLICY "Owners and queen can delete worship files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'worship'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR public.current_user_role() = 'queen'
    )
  );

ALTER TABLE public.direct_messages
  DROP CONSTRAINT IF EXISTS direct_messages_attachment_type_check;

ALTER TABLE public.direct_messages
  ADD CONSTRAINT direct_messages_attachment_type_check
  CHECK (
    attachment_type IS NULL
    OR attachment_type IN (
      'tease', 'task', 'punishment', 'reward', 'request',
      'date', 'journal', 'submission', 'wishlist', 'worship'
    )
  );

ALTER TABLE public.voice_notes DROP CONSTRAINT IF EXISTS voice_notes_entity_type_check;
ALTER TABLE public.voice_notes ADD CONSTRAINT voice_notes_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'task'::text, 'submission'::text, 'request'::text, 'comment'::text,
    'reward'::text, 'punishment'::text, 'check_in'::text, 'tease'::text,
    'ritual'::text, 'date'::text, 'journal'::text, 'wishlist'::text,
    'worship'::text
  ]));

ALTER PUBLICATION supabase_realtime ADD TABLE public.worship_messages;

NOTIFY pgrst, 'reload schema';
