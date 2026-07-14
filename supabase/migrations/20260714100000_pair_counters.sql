-- Shared pair counters (e.g. last cum timer) — both Queen and D can reset

CREATE TABLE public.pair_counters (
  key TEXT PRIMARY KEY,
  reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reset_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.pair_counters
  ADD CONSTRAINT pair_counters_key_check
  CHECK (key IN ('last_cum'));

INSERT INTO public.pair_counters (key, reset_at)
VALUES ('last_cum', NOW())
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.pair_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view pair_counters"
  ON public.pair_counters FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can reset pair_counters"
  ON public.pair_counters FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.pair_counters;

NOTIFY pgrst, 'reload schema';
