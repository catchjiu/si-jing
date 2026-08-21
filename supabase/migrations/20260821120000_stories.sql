-- Stories: shared rich-text fiction for Queen and slave, with comments + inbox attachment.

CREATE TABLE IF NOT EXISTS public.stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT stories_title_len CHECK (char_length(trim(title)) > 0)
);

CREATE TABLE IF NOT EXISTS public.story_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT story_comments_content_len CHECK (char_length(trim(content)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_stories_author_created
  ON public.stories(author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stories_status_created
  ON public.stories(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_story_comments_story
  ON public.story_comments(story_id, created_at ASC);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view published or own stories" ON public.stories;
CREATE POLICY "Users can view published or own stories"
  ON public.stories FOR SELECT TO authenticated
  USING (
    status = 'published'
    OR author_id = auth.uid()
  );

DROP POLICY IF EXISTS "Authenticated can create stories" ON public.stories;
CREATE POLICY "Authenticated can create stories"
  ON public.stories FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.current_user_role() IN ('queen', 'slave')
  );

DROP POLICY IF EXISTS "Authors can update own stories" ON public.stories;
CREATE POLICY "Authors can update own stories"
  ON public.stories FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "Authors or queen can delete stories" ON public.stories;
CREATE POLICY "Authors or queen can delete stories"
  ON public.stories FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.current_user_role() = 'queen'
  );

DROP POLICY IF EXISTS "Authenticated can view story comments" ON public.story_comments;
CREATE POLICY "Authenticated can view story comments"
  ON public.story_comments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id
        AND (s.status = 'published' OR s.author_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated can comment on published stories" ON public.story_comments;
CREATE POLICY "Authenticated can comment on published stories"
  ON public.story_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id
        AND s.status = 'published'
    )
  );

DROP POLICY IF EXISTS "Authors or queen can delete story comments" ON public.story_comments;
CREATE POLICY "Authors or queen can delete story comments"
  ON public.story_comments FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.current_user_role() = 'queen'
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.story_comments;

ALTER TABLE public.direct_messages
  DROP CONSTRAINT IF EXISTS direct_messages_attachment_type_check;

ALTER TABLE public.direct_messages
  ADD CONSTRAINT direct_messages_attachment_type_check
  CHECK (
    attachment_type IS NULL
    OR attachment_type IN (
      'tease', 'task', 'punishment', 'reward', 'request',
      'date', 'journal', 'submission', 'wishlist', 'worship',
      'worship_assignment', 'denial', 'jealousy_mission', 'story'
    )
  );

NOTIFY pgrst, 'reload schema';
