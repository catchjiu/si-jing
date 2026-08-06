-- Comments on jealousy missions (Queen ↔ slave thread per mission)

CREATE TABLE public.jealousy_mission_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.jealousy_missions(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT jealousy_mission_comments_content_len CHECK (char_length(trim(content)) > 0)
);

CREATE INDEX idx_jealousy_mission_comments_mission_id
  ON public.jealousy_mission_comments(mission_id, created_at ASC);

ALTER TABLE public.jealousy_mission_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view jealousy mission comments"
  ON public.jealousy_mission_comments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.jealousy_missions m
      WHERE m.id = jealousy_mission_comments.mission_id
        AND (
          m.created_by = auth.uid()
          OR m.assigned_to = auth.uid()
          OR public.current_user_role() = 'queen'
        )
    )
  );

CREATE POLICY "Queen and slave can send jealousy mission comments"
  ON public.jealousy_mission_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.current_user_role() IN ('queen', 'slave')
    AND EXISTS (
      SELECT 1 FROM public.jealousy_missions m
      WHERE m.id = jealousy_mission_comments.mission_id
        AND (
          m.created_by = auth.uid()
          OR m.assigned_to = auth.uid()
          OR public.current_user_role() = 'queen'
        )
    )
  );

CREATE POLICY "Authors and queen can delete jealousy mission comments"
  ON public.jealousy_mission_comments FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.current_user_role() = 'queen'
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.jealousy_mission_comments;

ALTER TABLE public.direct_messages
  DROP CONSTRAINT IF EXISTS direct_messages_attachment_type_check;

ALTER TABLE public.direct_messages
  ADD CONSTRAINT direct_messages_attachment_type_check
  CHECK (
    attachment_type IS NULL
    OR attachment_type IN (
      'tease', 'task', 'punishment', 'reward', 'request',
      'date', 'journal', 'submission', 'wishlist', 'worship',
      'worship_assignment', 'denial', 'jealousy_mission'
    )
  );

NOTIFY pgrst, 'reload schema';
