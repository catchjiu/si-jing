-- Creep: Fart Tracker hub plus slave photo/video galleries
-- (Stretch Marks, Panties, and custom galleries that appear in the menu).

CREATE TABLE IF NOT EXISTS public.creep_galleries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 100,
  viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT creep_galleries_title_len CHECK (char_length(trim(title)) > 0),
  CONSTRAINT creep_galleries_slug_len CHECK (char_length(trim(slug)) > 0),
  CONSTRAINT creep_galleries_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT creep_galleries_slug_reserved CHECK (slug NOT IN ('fart', 'gallery')),
  CONSTRAINT creep_galleries_slug_unique UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_creep_galleries_sort
  ON public.creep_galleries (sort_order ASC, created_at ASC);

ALTER TABLE public.creep_galleries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view creep galleries" ON public.creep_galleries;
CREATE POLICY "Authenticated can view creep galleries"
  ON public.creep_galleries FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Slave can insert creep galleries" ON public.creep_galleries;
CREATE POLICY "Slave can insert creep galleries"
  ON public.creep_galleries FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
    AND is_system = false
  );

DROP POLICY IF EXISTS "Slave can update own creep galleries" ON public.creep_galleries;
CREATE POLICY "Slave can update own creep galleries"
  ON public.creep_galleries FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
    AND is_system = false
  )
  WITH CHECK (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
    AND is_system = false
  );

DROP POLICY IF EXISTS "Queen can update creep galleries" ON public.creep_galleries;
CREATE POLICY "Queen can update creep galleries"
  ON public.creep_galleries FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'queen')
  WITH CHECK (public.current_user_role() = 'queen');

DROP POLICY IF EXISTS "Slave or queen can delete custom creep galleries" ON public.creep_galleries;
CREATE POLICY "Slave or queen can delete custom creep galleries"
  ON public.creep_galleries FOR DELETE TO authenticated
  USING (
    is_system = false
    AND (
      public.current_user_role() = 'queen'
      OR (
        public.current_user_role() = 'slave'
        AND created_by = auth.uid()
      )
    )
  );

CREATE OR REPLACE FUNCTION public.guard_creep_gallery_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() = 'queen' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.title IS DISTINCT FROM OLD.title
      OR NEW.slug IS DISTINCT FROM OLD.slug
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.is_system IS DISTINCT FROM OLD.is_system
      OR NEW.sort_order IS DISTINCT FROM OLD.sort_order
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Queen may only mark creep galleries as viewed';
    END IF;
  ELSIF public.current_user_role() = 'slave' THEN
    NEW.is_system := OLD.is_system;
    NEW.slug := OLD.slug;
    NEW.created_by := OLD.created_by;
    NEW.sort_order := OLD.sort_order;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_creep_gallery_update ON public.creep_galleries;
CREATE TRIGGER trg_guard_creep_gallery_update
  BEFORE UPDATE ON public.creep_galleries
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_creep_gallery_update();

INSERT INTO public.creep_galleries (title, slug, is_system, sort_order)
SELECT 'Stretch Marks', 'stretch-marks', true, 10
WHERE NOT EXISTS (
  SELECT 1 FROM public.creep_galleries WHERE slug = 'stretch-marks'
);

INSERT INTO public.creep_galleries (title, slug, is_system, sort_order)
SELECT 'Panties', 'panties', true, 20
WHERE NOT EXISTS (
  SELECT 1 FROM public.creep_galleries WHERE slug = 'panties'
);

CREATE TABLE IF NOT EXISTS public.creep_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id UUID NOT NULL REFERENCES public.creep_galleries(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  image_path TEXT NOT NULL,
  media_kind TEXT NOT NULL DEFAULT 'image',
  viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT creep_entries_image_path_len CHECK (char_length(trim(image_path)) > 0),
  CONSTRAINT creep_entries_media_kind_check CHECK (media_kind IN ('image', 'video'))
);

CREATE INDEX IF NOT EXISTS idx_creep_entries_gallery_created
  ON public.creep_entries (gallery_id, created_at DESC);

ALTER TABLE public.creep_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view creep entries" ON public.creep_entries;
CREATE POLICY "Authenticated can view creep entries"
  ON public.creep_entries FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Slave can insert creep entries" ON public.creep_entries;
CREATE POLICY "Slave can insert creep entries"
  ON public.creep_entries FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Slave can update own creep entries" ON public.creep_entries;
CREATE POLICY "Slave can update own creep entries"
  ON public.creep_entries FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
  )
  WITH CHECK (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Queen can update creep entries" ON public.creep_entries;
CREATE POLICY "Queen can update creep entries"
  ON public.creep_entries FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'queen')
  WITH CHECK (public.current_user_role() = 'queen');

DROP POLICY IF EXISTS "Slave can delete own creep entries" ON public.creep_entries;
CREATE POLICY "Slave can delete own creep entries"
  ON public.creep_entries FOR DELETE TO authenticated
  USING (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Queen can delete creep entries" ON public.creep_entries;
CREATE POLICY "Queen can delete creep entries"
  ON public.creep_entries FOR DELETE TO authenticated
  USING (public.current_user_role() = 'queen');

CREATE OR REPLACE FUNCTION public.guard_creep_entry_queen_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() = 'queen' THEN
    IF NEW.gallery_id IS DISTINCT FROM OLD.gallery_id
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.title IS DISTINCT FROM OLD.title
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.image_path IS DISTINCT FROM OLD.image_path
      OR NEW.media_kind IS DISTINCT FROM OLD.media_kind
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Queen may only mark creep entries as viewed';
    END IF;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_creep_entry_queen_update ON public.creep_entries;
CREATE TRIGGER trg_guard_creep_entry_queen_update
  BEFORE UPDATE ON public.creep_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_creep_entry_queen_update();

CREATE TABLE IF NOT EXISTS public.creep_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.creep_entries(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT creep_comments_content_len CHECK (char_length(trim(content)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_creep_comments_entry
  ON public.creep_comments (entry_id, created_at ASC);

ALTER TABLE public.creep_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view creep comments" ON public.creep_comments;
CREATE POLICY "Authenticated can view creep comments"
  ON public.creep_comments FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated can comment on creep entries" ON public.creep_comments;
CREATE POLICY "Authenticated can comment on creep entries"
  ON public.creep_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.current_user_role() IN ('queen', 'slave')
  );

DROP POLICY IF EXISTS "Authors or queen can delete creep comments" ON public.creep_comments;
CREATE POLICY "Authors or queen can delete creep comments"
  ON public.creep_comments FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.current_user_role() = 'queen'
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('creep', 'creep', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated can upload creep" ON storage.objects;
CREATE POLICY "Authenticated can upload creep"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'creep');

DROP POLICY IF EXISTS "Authenticated can view creep files" ON storage.objects;
CREATE POLICY "Authenticated can view creep files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'creep');

DROP POLICY IF EXISTS "Owners and queen can delete creep files" ON storage.objects;
CREATE POLICY "Owners and queen can delete creep files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'creep'
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
      'date', 'journal', 'submission', 'wishlist', 'worship',
      'worship_assignment', 'denial', 'jealousy_mission', 'story', 'fart',
      'creep'
    )
  );

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.creep_galleries;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.creep_entries;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.creep_comments;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
