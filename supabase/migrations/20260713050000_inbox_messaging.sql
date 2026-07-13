-- Inbox: conversations, direct messages, durable notifications

CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.conversation_members (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_members_user
  ON public.conversation_members(user_id);

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT,
  media_path TEXT,
  media_type TEXT CHECK (media_type IS NULL OR media_type IN ('image', 'video')),
  voice_path TEXT,
  voice_duration_ms INT CHECK (voice_duration_ms IS NULL OR voice_duration_ms >= 0),
  attachment_type TEXT CHECK (
    attachment_type IS NULL
    OR attachment_type IN ('tease', 'task', 'punishment')
  ),
  attachment_id UUID,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT direct_messages_has_payload CHECK (
    content IS NOT NULL
    OR media_path IS NOT NULL
    OR voice_path IS NOT NULL
    OR (attachment_type IS NOT NULL AND attachment_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation_created
  ON public.direct_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_direct_messages_sender
  ON public.direct_messages(sender_id);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  href TEXT NOT NULL DEFAULT '/dashboard/inbox',
  entity_type TEXT,
  entity_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id)
  WHERE read_at IS NULL;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Members can see conversations they belong to
DROP POLICY IF EXISTS "Members can view conversations" ON public.conversations;
CREATE POLICY "Members can view conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members m
      WHERE m.conversation_id = conversations.id
        AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members can view membership" ON public.conversation_members;
CREATE POLICY "Members can view membership"
  ON public.conversation_members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversation_members m
      WHERE m.conversation_id = conversation_members.conversation_id
        AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members can update own read cursor" ON public.conversation_members;
CREATE POLICY "Members can update own read cursor"
  ON public.conversation_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Members can view messages" ON public.direct_messages;
CREATE POLICY "Members can view messages"
  ON public.direct_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members m
      WHERE m.conversation_id = direct_messages.conversation_id
        AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members can send messages" ON public.direct_messages;
CREATE POLICY "Members can send messages"
  ON public.direct_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversation_members m
      WHERE m.conversation_id = direct_messages.conversation_id
        AND m.user_id = auth.uid()
    )
    AND (
      public.current_user_role() = 'queen'
      OR NOT public.has_punishment_effect(auth.uid(), 'contact')
    )
  );

DROP POLICY IF EXISTS "Authors and queen can soft-delete messages" ON public.direct_messages;
CREATE POLICY "Authors and queen can soft-delete messages"
  ON public.direct_messages FOR UPDATE TO authenticated
  USING (
    sender_id = auth.uid()
    OR public.current_user_role() = 'queen'
  )
  WITH CHECK (
    sender_id = auth.uid()
    OR public.current_user_role() = 'queen'
  );

DROP POLICY IF EXISTS "Authors and queen can delete messages hard" ON public.direct_messages;
CREATE POLICY "Authors and queen can delete messages hard"
  ON public.direct_messages FOR DELETE TO authenticated
  USING (
    sender_id = auth.uid()
    OR public.current_user_role() = 'queen'
  );

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated can insert notifications" ON public.notifications;
CREATE POLICY "Authenticated can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);

-- Ensure the single Queen↔slave conversation exists
CREATE OR REPLACE FUNCTION public.ensure_queen_slave_conversation()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  queen_id UUID;
  slave_id UUID;
  conv_id UUID;
BEGIN
  SELECT id INTO queen_id FROM public.users WHERE role = 'queen' LIMIT 1;
  SELECT id INTO slave_id FROM public.users WHERE role = 'slave' LIMIT 1;

  IF queen_id IS NULL OR slave_id IS NULL THEN
    RAISE EXCEPTION 'Queen and slave profiles are required';
  END IF;

  SELECT c.id INTO conv_id
  FROM public.conversations c
  WHERE EXISTS (
    SELECT 1 FROM public.conversation_members m
    WHERE m.conversation_id = c.id AND m.user_id = queen_id
  )
  AND EXISTS (
    SELECT 1 FROM public.conversation_members m
    WHERE m.conversation_id = c.id AND m.user_id = slave_id
  )
  LIMIT 1;

  IF conv_id IS NOT NULL THEN
    RETURN conv_id;
  END IF;

  INSERT INTO public.conversations DEFAULT VALUES
  RETURNING id INTO conv_id;

  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (conv_id, queen_id), (conv_id, slave_id);

  RETURN conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_queen_slave_conversation() TO authenticated;

-- Helper: notify a user by role or id
CREATE OR REPLACE FUNCTION public.notify_user(
  p_user_id UUID,
  p_kind TEXT,
  p_title TEXT,
  p_body TEXT DEFAULT NULL,
  p_href TEXT DEFAULT '/dashboard/inbox',
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nid UUID;
BEGIN
  INSERT INTO public.notifications (
    user_id, kind, title, body, href, entity_type, entity_id
  ) VALUES (
    p_user_id, p_kind, p_title, p_body, COALESCE(p_href, '/dashboard/inbox'),
    p_entity_type, p_entity_id
  )
  RETURNING id INTO nid;
  RETURN nid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_user(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
) TO authenticated;

-- Realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

NOTIFY pgrst, 'reload schema';
