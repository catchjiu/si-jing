-- Topic galleries for worship: slave organizes photos into themed collections

CREATE TABLE public.worship_galleries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  description TEXT,
  viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT worship_galleries_topic_len CHECK (char_length(trim(topic)) > 0)
);

CREATE INDEX idx_worship_galleries_created_at
  ON public.worship_galleries(created_at DESC);
CREATE INDEX idx_worship_galleries_created_by
  ON public.worship_galleries(created_by);

ALTER TABLE public.worship_galleries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view worship galleries"
  ON public.worship_galleries FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Slave can create worship galleries"
  ON public.worship_galleries FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
  );

CREATE POLICY "Slave can update own worship galleries"
  ON public.worship_galleries FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
  )
  WITH CHECK (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
  );

CREATE POLICY "Queen can update worship galleries"
  ON public.worship_galleries FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'queen')
  WITH CHECK (public.current_user_role() = 'queen');

CREATE POLICY "Slave can delete own worship galleries"
  ON public.worship_galleries FOR DELETE TO authenticated
  USING (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
  );

CREATE POLICY "Queen can delete worship galleries"
  ON public.worship_galleries FOR DELETE TO authenticated
  USING (public.current_user_role() = 'queen');

CREATE OR REPLACE FUNCTION public.guard_worship_gallery_queen_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.current_user_role() <> 'queen' THEN
    RETURN NEW;
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.topic IS DISTINCT FROM OLD.topic
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    RAISE EXCEPTION 'Queen may only update viewed_at on worship galleries';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_worship_gallery_queen_update ON public.worship_galleries;
CREATE TRIGGER trg_guard_worship_gallery_queen_update
  BEFORE UPDATE ON public.worship_galleries
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_worship_gallery_queen_update();

CREATE OR REPLACE FUNCTION public.set_worship_galleries_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS worship_galleries_updated_at ON public.worship_galleries;
CREATE TRIGGER worship_galleries_updated_at
  BEFORE UPDATE ON public.worship_galleries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_worship_galleries_updated_at();

ALTER TABLE public.worship_entries
  ADD COLUMN IF NOT EXISTS gallery_id UUID REFERENCES public.worship_galleries(id) ON DELETE CASCADE;

-- Backfill orphan entries into a default gallery per creator
DO $$
DECLARE
  r RECORD;
  gid UUID;
BEGIN
  FOR r IN
    SELECT DISTINCT created_by
    FROM public.worship_entries
    WHERE gallery_id IS NULL
  LOOP
    INSERT INTO public.worship_galleries (created_by, topic, description)
    VALUES (r.created_by, 'General worship', 'Photos moved from the original worship feed')
    RETURNING id INTO gid;

    UPDATE public.worship_entries
    SET gallery_id = gid
    WHERE created_by = r.created_by
      AND gallery_id IS NULL;
  END LOOP;
END $$;

ALTER TABLE public.worship_entries
  ALTER COLUMN gallery_id SET NOT NULL;

CREATE INDEX idx_worship_entries_gallery_id
  ON public.worship_entries(gallery_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.guard_worship_queen_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.current_user_role() <> 'queen' THEN
    RETURN NEW;
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.gallery_id IS DISTINCT FROM OLD.gallery_id
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

CREATE TABLE public.worship_gallery_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id UUID NOT NULL REFERENCES public.worship_galleries(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT worship_gallery_messages_content_len CHECK (char_length(trim(content)) > 0)
);

CREATE INDEX idx_worship_gallery_messages_gallery_id
  ON public.worship_gallery_messages(gallery_id, created_at ASC);

ALTER TABLE public.worship_gallery_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view worship gallery messages"
  ON public.worship_gallery_messages FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can send worship gallery messages"
  ON public.worship_gallery_messages FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors and queen can delete worship gallery messages"
  ON public.worship_gallery_messages FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.current_user_role() = 'queen'
  );

ALTER TABLE public.voice_notes DROP CONSTRAINT IF EXISTS voice_notes_entity_type_check;
ALTER TABLE public.voice_notes ADD CONSTRAINT voice_notes_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'task'::text, 'submission'::text, 'request'::text, 'comment'::text,
    'reward'::text, 'punishment'::text, 'check_in'::text, 'tease'::text,
    'ritual'::text, 'date'::text, 'journal'::text, 'wishlist'::text,
    'worship'::text, 'worship_gallery'::text
  ]));

ALTER PUBLICATION supabase_realtime ADD TABLE public.worship_gallery_messages;

NOTIFY pgrst, 'reload schema';
