-- Timed reading windows for stories (Queen and slave).
-- After viewable_until, the other person sees cover + blurred text and must request access.

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS view_window_minutes INTEGER;

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS viewable_until TIMESTAMPTZ;

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE public.stories
  DROP CONSTRAINT IF EXISTS stories_view_window_minutes_chk;

ALTER TABLE public.stories
  ADD CONSTRAINT stories_view_window_minutes_chk
  CHECK (
    view_window_minutes IS NULL
    OR view_window_minutes IN (30, 60, 240, 1440)
  );

COMMENT ON COLUMN public.stories.view_window_minutes IS
  'Optional reading window: 30, 60, 240, or 1440 minutes. Null means no time limit.';
COMMENT ON COLUMN public.stories.viewable_until IS
  'When the reading window closes for everyone except the author and granted readers.';
COMMENT ON COLUMN public.stories.published_at IS
  'When the story was last published (timer start). Null while draft.';

UPDATE public.stories
SET published_at = created_at
WHERE status = 'published'
  AND published_at IS NULL;

CREATE TABLE IF NOT EXISTS public.story_access_grants (
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  grantee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  granted_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (story_id, grantee_id)
);

CREATE TABLE IF NOT EXISTS public.story_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'granted', 'denied')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  UNIQUE (story_id, requester_id)
);

CREATE INDEX IF NOT EXISTS idx_stories_viewable_until
  ON public.stories (viewable_until)
  WHERE viewable_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_story_access_grants_grantee
  ON public.story_access_grants (grantee_id, story_id);

CREATE INDEX IF NOT EXISTS idx_story_access_requests_story
  ON public.story_access_requests (story_id, status);

CREATE OR REPLACE FUNCTION public.story_readable_by_me(p_story_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.stories s
    WHERE s.id = p_story_id
      AND (
        s.author_id = auth.uid()
        OR (
          s.status = 'published'
          AND (
            s.viewable_until IS NULL
            OR s.viewable_until > now()
            OR EXISTS (
              SELECT 1
              FROM public.story_access_grants g
              WHERE g.story_id = s.id
                AND g.grantee_id = auth.uid()
            )
          )
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.story_readable_by_me(uuid) TO authenticated;

ALTER TABLE public.story_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view story access grants" ON public.story_access_grants;
CREATE POLICY "Users can view story access grants"
  ON public.story_access_grants FOR SELECT TO authenticated
  USING (
    grantee_id = auth.uid()
    OR granted_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id AND s.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authors can grant story access" ON public.story_access_grants;
CREATE POLICY "Authors can grant story access"
  ON public.story_access_grants FOR INSERT TO authenticated
  WITH CHECK (
    granted_by = auth.uid()
    AND grantee_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id AND s.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authors can revoke story access" ON public.story_access_grants;
CREATE POLICY "Authors can revoke story access"
  ON public.story_access_grants FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id AND s.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can view story access requests" ON public.story_access_requests;
CREATE POLICY "Users can view story access requests"
  ON public.story_access_requests FOR SELECT TO authenticated
  USING (
    requester_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id AND s.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Readers can request story access" ON public.story_access_requests;
CREATE POLICY "Readers can request story access"
  ON public.story_access_requests FOR INSERT TO authenticated
  WITH CHECK (
    requester_id = auth.uid()
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id
        AND s.status = 'published'
        AND s.author_id <> auth.uid()
        AND s.viewable_until IS NOT NULL
        AND s.viewable_until <= now()
        AND NOT EXISTS (
          SELECT 1 FROM public.story_access_grants g
          WHERE g.story_id = s.id AND g.grantee_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "Requesters can re-open denied story access" ON public.story_access_requests;
CREATE POLICY "Requesters can re-open denied story access"
  ON public.story_access_requests FOR UPDATE TO authenticated
  USING (requester_id = auth.uid())
  WITH CHECK (
    requester_id = auth.uid()
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "Authors can respond to story access requests" ON public.story_access_requests;
CREATE POLICY "Authors can respond to story access requests"
  ON public.story_access_requests FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id AND s.author_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id AND s.author_id = auth.uid()
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
    AND public.story_readable_by_me(story_id)
  );

DROP POLICY IF EXISTS "Authors can delete story access requests" ON public.story_access_requests;
CREATE POLICY "Authors can delete story access requests"
  ON public.story_access_requests FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id AND s.author_id = auth.uid()
    )
  );

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.story_access_grants;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.story_access_requests;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
