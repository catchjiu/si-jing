-- Topic-based inbox threads (general + teases, punishments, dates, …)

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS topic TEXT;

UPDATE public.conversations
SET topic = 'general'
WHERE topic IS NULL;

ALTER TABLE public.conversations
  ALTER COLUMN topic SET DEFAULT 'general';

ALTER TABLE public.conversations
  ALTER COLUMN topic SET NOT NULL;

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_topic_check;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_topic_check
  CHECK (
    topic IN (
      'general',
      'teases',
      'punishments',
      'dates',
      'tasks',
      'rewards',
      'requests',
      'journal'
    )
  );

-- Expand DM attachment types for topic cards
ALTER TABLE public.direct_messages
  DROP CONSTRAINT IF EXISTS direct_messages_attachment_type_check;

ALTER TABLE public.direct_messages
  ADD CONSTRAINT direct_messages_attachment_type_check
  CHECK (
    attachment_type IS NULL
    OR attachment_type IN (
      'tease', 'task', 'punishment', 'reward', 'request', 'date', 'journal', 'submission'
    )
  );

-- One conversation per topic for the Queen↔slave pair (enforced in RPC).
-- Drop old single-pair uniqueness assumptions; recreate ensure RPC.

CREATE OR REPLACE FUNCTION public.ensure_topic_conversations()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  queen_id UUID;
  slave_id UUID;
  t TEXT;
  conv_id UUID;
  general_id UUID;
  topics TEXT[] := ARRAY[
    'general', 'teases', 'punishments', 'dates',
    'tasks', 'rewards', 'requests', 'journal'
  ];
BEGIN
  SELECT id INTO queen_id FROM public.users WHERE role = 'queen' LIMIT 1;
  SELECT id INTO slave_id FROM public.users WHERE role = 'slave' LIMIT 1;

  IF queen_id IS NULL OR slave_id IS NULL THEN
    RAISE EXCEPTION 'Queen and slave profiles are required';
  END IF;

  FOREACH t IN ARRAY topics LOOP
    SELECT c.id INTO conv_id
    FROM public.conversations c
    WHERE c.topic = t
      AND EXISTS (
        SELECT 1 FROM public.conversation_members m
        WHERE m.conversation_id = c.id AND m.user_id = queen_id
      )
      AND EXISTS (
        SELECT 1 FROM public.conversation_members m
        WHERE m.conversation_id = c.id AND m.user_id = slave_id
      )
    LIMIT 1;

    IF conv_id IS NULL THEN
      INSERT INTO public.conversations (topic)
      VALUES (t)
      RETURNING id INTO conv_id;

      INSERT INTO public.conversation_members (conversation_id, user_id)
      VALUES (conv_id, queen_id), (conv_id, slave_id);
    END IF;

    IF t = 'general' THEN
      general_id := conv_id;
    END IF;
  END LOOP;

  RETURN general_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_topic_conversations() TO authenticated;

-- Keep old name as alias returning general conversation id
CREATE OR REPLACE FUNCTION public.ensure_queen_slave_conversation()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.ensure_topic_conversations();
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_queen_slave_conversation() TO authenticated;

-- Lookup conversation by topic for the current pair
CREATE OR REPLACE FUNCTION public.get_topic_conversation(p_topic TEXT)
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
  PERFORM public.ensure_topic_conversations();

  SELECT id INTO queen_id FROM public.users WHERE role = 'queen' LIMIT 1;
  SELECT id INTO slave_id FROM public.users WHERE role = 'slave' LIMIT 1;

  SELECT c.id INTO conv_id
  FROM public.conversations c
  WHERE c.topic = p_topic
    AND EXISTS (
      SELECT 1 FROM public.conversation_members m
      WHERE m.conversation_id = c.id AND m.user_id = queen_id
    )
    AND EXISTS (
      SELECT 1 FROM public.conversation_members m
      WHERE m.conversation_id = c.id AND m.user_id = slave_id
    )
  LIMIT 1;

  RETURN conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_topic_conversation(TEXT) TO authenticated;

-- Seed topic conversations now
SELECT public.ensure_topic_conversations();

NOTIFY pgrst, 'reload schema';
