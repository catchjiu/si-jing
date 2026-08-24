-- To be continued: lock the rest of a story until access is granted again.

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS tbc_locked BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.stories.tbc_locked IS
  'True when a To be continued break is locking the rest of the story until access is granted.';

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
            EXISTS (
              SELECT 1
              FROM public.story_access_grants g
              WHERE g.story_id = s.id
                AND g.grantee_id = auth.uid()
            )
            OR (
              COALESCE(s.tbc_locked, false) = false
              AND (
                s.viewable_until IS NULL
                OR s.viewable_until > now()
              )
            )
          )
        )
      )
  );
$$;

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
        AND NOT EXISTS (
          SELECT 1 FROM public.story_access_grants g
          WHERE g.story_id = s.id AND g.grantee_id = auth.uid()
        )
        AND (
          COALESCE(s.tbc_locked, false) = true
          OR (
            s.viewable_until IS NOT NULL
            AND s.viewable_until <= now()
          )
        )
    )
  );

NOTIFY pgrst, 'reload schema';
