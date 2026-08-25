-- Slave-only insult lines for Story (spoken in Queen's Fish voice).

CREATE TABLE IF NOT EXISTS public.story_insults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT story_insults_body_len CHECK (
    char_length(trim(body)) > 0
    AND char_length(body) <= 2000
  )
);

CREATE INDEX IF NOT EXISTS idx_story_insults_author_created
  ON public.story_insults(author_id, created_at DESC);

ALTER TABLE public.story_insults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Slave can view own story insults" ON public.story_insults;
CREATE POLICY "Slave can view own story insults"
  ON public.story_insults FOR SELECT TO authenticated
  USING (
    author_id = auth.uid()
    AND public.current_user_role() = 'slave'
  );

DROP POLICY IF EXISTS "Slave can create story insults" ON public.story_insults;
CREATE POLICY "Slave can create story insults"
  ON public.story_insults FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.current_user_role() = 'slave'
  );

DROP POLICY IF EXISTS "Slave can update own story insults" ON public.story_insults;
CREATE POLICY "Slave can update own story insults"
  ON public.story_insults FOR UPDATE TO authenticated
  USING (
    author_id = auth.uid()
    AND public.current_user_role() = 'slave'
  )
  WITH CHECK (
    author_id = auth.uid()
    AND public.current_user_role() = 'slave'
  );

DROP POLICY IF EXISTS "Slave can delete own story insults" ON public.story_insults;
CREATE POLICY "Slave can delete own story insults"
  ON public.story_insults FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    AND public.current_user_role() = 'slave'
  );

COMMENT ON TABLE public.story_insults IS
  'Slave-authored insult lines for Story; played back in Queen Fish voice. Queen cannot access.';

NOTIFY pgrst, 'reload schema';
