-- Reliable inbox send with clear errors (avoids PostgREST RLS edge-cases on insert+select).

CREATE OR REPLACE FUNCTION public.send_inbox_message(
  p_conversation_id UUID,
  p_content TEXT DEFAULT NULL,
  p_media_path TEXT DEFAULT NULL,
  p_media_type TEXT DEFAULT NULL,
  p_voice_path TEXT DEFAULT NULL,
  p_voice_duration_ms INT DEFAULT NULL,
  p_attachment_type TEXT DEFAULT NULL,
  p_attachment_id UUID DEFAULT NULL,
  p_attachment_anchor TEXT DEFAULT NULL,
  p_reply_to_id UUID DEFAULT NULL
)
RETURNS public.direct_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT;
  v_row public.direct_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = v_uid;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'User profile missing';
  END IF;

  IF NOT public.is_conversation_member(p_conversation_id) THEN
    RAISE EXCEPTION 'You are not a member of this conversation';
  END IF;

  PERFORM public.assert_slave_can_mutate();

  IF v_role = 'slave' AND public.has_punishment_effect(v_uid, 'contact') THEN
    RAISE EXCEPTION 'Contact is restricted — messaging is blocked';
  END IF;

  IF p_content IS NULL
     AND p_media_path IS NULL
     AND p_voice_path IS NULL
     AND (p_attachment_type IS NULL OR p_attachment_id IS NULL) THEN
    RAISE EXCEPTION 'Message is empty';
  END IF;

  INSERT INTO public.direct_messages (
    conversation_id,
    sender_id,
    content,
    media_path,
    media_type,
    voice_path,
    voice_duration_ms,
    attachment_type,
    attachment_id,
    attachment_anchor,
    reply_to_id
  ) VALUES (
    p_conversation_id,
    v_uid,
    NULLIF(BTRIM(COALESCE(p_content, '')), ''),
    p_media_path,
    p_media_type,
    p_voice_path,
    p_voice_duration_ms,
    p_attachment_type,
    p_attachment_id,
    p_attachment_anchor,
    p_reply_to_id
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_inbox_message(
  UUID, TEXT, TEXT, TEXT, TEXT, INT, TEXT, UUID, TEXT, UUID
) TO authenticated;

NOTIFY pgrst, 'reload schema';
