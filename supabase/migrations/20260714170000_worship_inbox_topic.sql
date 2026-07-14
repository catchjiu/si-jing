-- Dedicated Worship inbox topic thread

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
      'journal',
      'worship'
    )
  );

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
    'tasks', 'rewards', 'requests', 'journal', 'worship'
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

SELECT public.ensure_topic_conversations();

NOTIFY pgrst, 'reload schema';
