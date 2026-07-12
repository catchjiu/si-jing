-- Text comments on rewards (alongside voice_notes)

CREATE TABLE public.reward_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id UUID NOT NULL REFERENCES public.rewards(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reward_messages_content_len CHECK (char_length(trim(content)) > 0)
);

CREATE INDEX idx_reward_messages_reward_id ON public.reward_messages(reward_id, created_at ASC);

ALTER TABLE public.reward_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages on relevant rewards"
  ON public.reward_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rewards r
      WHERE r.id = reward_messages.reward_id
        AND (
          r.sent_by = auth.uid()
          OR r.sent_to = auth.uid()
          OR public.current_user_role() = 'queen'
        )
    )
  );

CREATE POLICY "Users can send reward messages"
  ON public.reward_messages FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.rewards r
      WHERE r.id = reward_messages.reward_id
        AND (
          r.sent_by = auth.uid()
          OR r.sent_to = auth.uid()
          OR public.current_user_role() = 'queen'
        )
    )
  );

CREATE POLICY "Authors and queen can delete reward messages"
  ON public.reward_messages FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.current_user_role() = 'queen'
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.reward_messages;
