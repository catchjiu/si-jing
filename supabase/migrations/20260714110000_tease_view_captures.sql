-- Short front-camera reaction videos when D views a tease (required)

CREATE TABLE public.tease_view_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tease_id UUID NOT NULL REFERENCES public.teases(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  video_path TEXT NOT NULL,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tease_view_captures_tease
  ON public.tease_view_captures(tease_id, created_at DESC);

CREATE INDEX idx_tease_view_captures_viewer
  ON public.tease_view_captures(viewer_id, created_at DESC);

ALTER TABLE public.tease_view_captures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tease_view_captures on relevant teases"
  ON public.tease_view_captures FOR SELECT TO authenticated
  USING (
    viewer_id = auth.uid()
    OR public.current_user_role() = 'queen'
    OR EXISTS (
      SELECT 1 FROM public.teases t
      WHERE t.id = tease_view_captures.tease_id
        AND (t.sent_by = auth.uid() OR t.sent_to = auth.uid())
    )
  );

CREATE POLICY "Slave can insert tease_view_captures on assigned teases"
  ON public.tease_view_captures FOR INSERT TO authenticated
  WITH CHECK (
    viewer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.teases t
      WHERE t.id = tease_view_captures.tease_id
        AND t.sent_to = auth.uid()
    )
  );

CREATE POLICY "Queen can delete tease_view_captures"
  ON public.tease_view_captures FOR DELETE TO authenticated
  USING (public.current_user_role() = 'queen');

ALTER PUBLICATION supabase_realtime ADD TABLE public.tease_view_captures;

NOTIFY pgrst, 'reload schema';
