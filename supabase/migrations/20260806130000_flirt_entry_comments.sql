-- Comments on individual flirt timeline entries (flirt_entries)

CREATE TABLE public.flirt_entry_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.flirt_entries(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT flirt_entry_comments_content_len CHECK (char_length(trim(content)) > 0)
);

CREATE INDEX idx_flirt_entry_comments_entry_id
  ON public.flirt_entry_comments(entry_id, created_at ASC);

ALTER TABLE public.flirt_entry_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view flirt_entry_comments on relevant entries"
  ON public.flirt_entry_comments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.flirt_entries e
      JOIN public.flirt_guys g ON g.id = e.guy_id
      WHERE e.id = flirt_entry_comments.entry_id
        AND (
          g.created_by = auth.uid()
          OR g.assigned_to = auth.uid()
          OR public.current_user_role() = 'queen'
        )
    )
  );

CREATE POLICY "Queen and slave can send flirt_entry_comments"
  ON public.flirt_entry_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.current_user_role() IN ('queen', 'slave')
    AND EXISTS (
      SELECT 1
      FROM public.flirt_entries e
      JOIN public.flirt_guys g ON g.id = e.guy_id
      WHERE e.id = flirt_entry_comments.entry_id
        AND (
          g.created_by = auth.uid()
          OR g.assigned_to = auth.uid()
          OR public.current_user_role() = 'queen'
        )
    )
  );

CREATE POLICY "Authors and queen can delete flirt_entry_comments"
  ON public.flirt_entry_comments FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.current_user_role() = 'queen'
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.flirt_entry_comments;

NOTIFY pgrst, 'reload schema';
