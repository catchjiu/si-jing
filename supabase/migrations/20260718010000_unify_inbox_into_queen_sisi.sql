-- Collapse all topic-thread DMs into the single Queen Sisi (general) conversation.

DO $$
DECLARE
  v_general UUID;
BEGIN
  SELECT id INTO v_general
  FROM public.conversations
  WHERE topic = 'general'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_general IS NULL THEN
    RAISE NOTICE 'No general conversation found; skipping inbox unify';
    RETURN;
  END IF;

  UPDATE public.direct_messages dm
  SET conversation_id = v_general
  WHERE dm.conversation_id IN (
    SELECT c.id
    FROM public.conversations c
    WHERE c.topic IS DISTINCT FROM 'general'
  )
  AND dm.deleted_at IS NULL;
END;
$$;

-- Unread badges only count the unified Queen Sisi thread.
CREATE OR REPLACE FUNCTION public.count_inbox_unread()
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_count BIGINT := 0;
  v_since TIMESTAMPTZ;
  v_general UUID;
BEGIN
  IF v_user IS NULL THEN
    RETURN 0;
  END IF;

  SELECT id INTO v_general
  FROM public.conversations
  WHERE topic = 'general'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_general IS NULL THEN
    RETURN 0;
  END IF;

  SELECT last_read_at INTO v_since
  FROM public.conversation_members
  WHERE conversation_id = v_general
    AND user_id = v_user;

  SELECT COUNT(*) INTO v_count
  FROM public.direct_messages
  WHERE conversation_id = v_general
    AND sender_id IS DISTINCT FROM v_user
    AND deleted_at IS NULL
    AND created_at > COALESCE(v_since, 'epoch'::timestamptz);

  RETURN COALESCE(v_count, 0);
END;
$$;

NOTIFY pgrst, 'reload schema';
