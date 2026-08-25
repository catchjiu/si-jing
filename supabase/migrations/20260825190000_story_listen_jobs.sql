-- Background Story Listen jobs (prepare audio, notify when ready).

CREATE TABLE IF NOT EXISTS public.story_listen_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  cache_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'ready', 'failed')),
  audio_path TEXT,
  error TEXT,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_story_listen_jobs_requester_created
  ON public.story_listen_jobs(requester_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_story_listen_jobs_story_cache
  ON public.story_listen_jobs(story_id, cache_key, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_story_listen_jobs_active_cache
  ON public.story_listen_jobs(story_id, cache_key)
  WHERE status IN ('queued', 'running');

ALTER TABLE public.story_listen_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own story listen jobs" ON public.story_listen_jobs;
CREATE POLICY "Users can view own story listen jobs"
  ON public.story_listen_jobs FOR SELECT TO authenticated
  USING (requester_id = auth.uid());

DROP POLICY IF EXISTS "Users can create own story listen jobs" ON public.story_listen_jobs;
CREATE POLICY "Users can create own story listen jobs"
  ON public.story_listen_jobs FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

COMMENT ON TABLE public.story_listen_jobs IS
  'Async Story Listen preparation; requester is notified when status becomes ready.';

NOTIFY pgrst, 'reload schema';
