-- Text comments on queen dates (alongside date_posts timeline)

CREATE TABLE public.date_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_id UUID NOT NULL REFERENCES public.queen_dates(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT date_messages_content_len CHECK (char_length(trim(content)) > 0)
);

CREATE INDEX idx_date_messages_date_id
  ON public.date_messages(date_id, created_at ASC);

ALTER TABLE public.date_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view date_messages on relevant dates"
  ON public.date_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.queen_dates d
      WHERE d.id = date_messages.date_id
        AND (
          d.created_by = auth.uid()
          OR d.assigned_to = auth.uid()
          OR public.current_user_role() = 'queen'
        )
    )
  );

CREATE POLICY "Queen and slave can send date_messages"
  ON public.date_messages FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.current_user_role() IN ('queen', 'slave')
    AND EXISTS (
      SELECT 1 FROM public.queen_dates d
      WHERE d.id = date_messages.date_id
        AND (
          d.created_by = auth.uid()
          OR d.assigned_to = auth.uid()
          OR public.current_user_role() = 'queen'
        )
    )
  );

CREATE POLICY "Authors and queen can delete date_messages"
  ON public.date_messages FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.current_user_role() = 'queen'
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.date_messages;

NOTIFY pgrst, 'reload schema';
