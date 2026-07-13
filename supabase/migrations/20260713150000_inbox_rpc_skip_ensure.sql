-- Skip ensure_topic_conversations when inbox already exists (hot path)

CREATE OR REPLACE FUNCTION public.list_inbox_threads()
RETURNS TABLE (
  conversation_id UUID,
  topic TEXT,
  unread BIGINT,
  last_message JSONB,
  other_user JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_members WHERE user_id = uid
  ) THEN
    PERFORM public.ensure_topic_conversations();
  END IF;

  RETURN QUERY
  WITH my_convs AS (
    SELECT c.id, c.topic, m.last_read_at
    FROM public.conversations c
    JOIN public.conversation_members m
      ON m.conversation_id = c.id
     AND m.user_id = uid
  ),
  last_msgs AS (
    SELECT DISTINCT ON (dm.conversation_id)
      dm.conversation_id,
      jsonb_build_object(
        'id', dm.id,
        'conversation_id', dm.conversation_id,
        'sender_id', dm.sender_id,
        'content', dm.content,
        'media_path', dm.media_path,
        'media_type', dm.media_type,
        'voice_path', dm.voice_path,
        'voice_duration_ms', dm.voice_duration_ms,
        'attachment_type', dm.attachment_type,
        'attachment_id', dm.attachment_id,
        'deleted_at', dm.deleted_at,
        'created_at', dm.created_at,
        'sender', jsonb_build_object(
          'id', u.id,
          'username', u.username,
          'role', u.role,
          'avatar_url', u.avatar_url
        )
      ) AS msg
    FROM public.direct_messages dm
    JOIN public.users u ON u.id = dm.sender_id
    WHERE dm.deleted_at IS NULL
      AND dm.conversation_id IN (SELECT mc.id FROM my_convs mc)
    ORDER BY dm.conversation_id, dm.created_at DESC
  ),
  unread_counts AS (
    SELECT
      mc.id AS conversation_id,
      count(dm.id)::bigint AS unread
    FROM my_convs mc
    LEFT JOIN public.direct_messages dm
      ON dm.conversation_id = mc.id
     AND dm.deleted_at IS NULL
     AND dm.sender_id <> uid
     AND dm.created_at > mc.last_read_at
    GROUP BY mc.id
  )
  SELECT
    mc.id,
    mc.topic,
    COALESCE(uc.unread, 0),
    lm.msg,
    CASE
      WHEN mc.topic = 'general' THEN (
        SELECT jsonb_build_object(
          'id', u.id,
          'username', u.username,
          'role', u.role,
          'avatar_url', u.avatar_url
        )
        FROM public.conversation_members om
        JOIN public.users u ON u.id = om.user_id
        WHERE om.conversation_id = mc.id
          AND om.user_id <> uid
        LIMIT 1
      )
      ELSE NULL
    END
  FROM my_convs mc
  LEFT JOIN last_msgs lm ON lm.conversation_id = mc.id
  LEFT JOIN unread_counts uc ON uc.conversation_id = mc.id
  ORDER BY mc.topic;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_inbox_threads() TO authenticated;

CREATE OR REPLACE FUNCTION public.count_inbox_unread()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  total BIGINT;
BEGIN
  IF uid IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_members WHERE user_id = uid
  ) THEN
    PERFORM public.ensure_topic_conversations();
  END IF;

  SELECT count(*)::bigint
  INTO total
  FROM public.conversation_members m
  JOIN public.direct_messages dm
    ON dm.conversation_id = m.conversation_id
  WHERE m.user_id = uid
    AND dm.deleted_at IS NULL
    AND dm.sender_id <> uid
    AND dm.created_at > m.last_read_at;

  RETURN COALESCE(total, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.count_inbox_unread() TO authenticated;

NOTIFY pgrst, 'reload schema';
