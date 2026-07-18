-- Contact restriction locks the slave the same way as Queen No contact.

CREATE OR REPLACE FUNCTION public.assert_slave_can_mutate()
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() <> 'slave' THEN
    RETURN;
  END IF;

  IF public.is_no_contact_active() THEN
    RAISE EXCEPTION 'No contact is active — you cannot change or add anything right now';
  END IF;

  IF public.has_active_punishment(auth.uid(), 'contact_restriction') THEN
    RAISE EXCEPTION 'Contact restriction is active — you cannot change or add anything right now';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_attention(p_kind text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  budget JSONB;
  today DATE := (NOW() AT TIME ZONE 'UTC')::date;
  tokens INT;
  remaining INT;
BEGIN
  IF public.current_user_role() <> 'slave' THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;

  IF public.is_no_contact_active() THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No contact is active — you cannot change or add anything right now'
    );
  END IF;

  IF public.has_active_punishment(auth.uid(), 'contact_restriction') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Contact restriction is active — you cannot change or add anything right now'
    );
  END IF;

  IF p_kind NOT IN ('message', 'request') THEN
    RAISE EXCEPTION 'Invalid attention kind';
  END IF;

  budget := public.get_attention_budget();

  IF NOT COALESCE((budget->>'enabled')::boolean, false) THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;

  tokens := COALESCE((budget->>'speak_freely_tokens')::int, 0);

  IF p_kind = 'message' THEN
    remaining := COALESCE((budget->>'messages_remaining')::int, 0);
  ELSE
    remaining := COALESCE((budget->>'requests_remaining')::int, 0);
  END IF;

  IF remaining <= 0 THEN
    IF tokens > 0 THEN
      UPDATE public.pair_settings
      SET
        value = jsonb_set(value, '{speak_freely_tokens}', to_jsonb(tokens - 1)),
        updated_at = NOW()
      WHERE key = 'attention_budget';
      RETURN jsonb_build_object('ok', true, 'used_token', true, 'tokens_left', tokens - 1);
    END IF;
    RETURN jsonb_build_object(
      'ok', false,
      'error', format('Daily %s limit reached. Ask Queen for a speak-freely token.', p_kind)
    );
  END IF;

  INSERT INTO public.attention_usage (user_id, usage_date, messages_sent, requests_sent)
  VALUES (
    auth.uid(),
    today,
    CASE WHEN p_kind = 'message' THEN 1 ELSE 0 END,
    CASE WHEN p_kind = 'request' THEN 1 ELSE 0 END
  )
  ON CONFLICT (user_id, usage_date) DO UPDATE SET
    messages_sent = public.attention_usage.messages_sent
      + CASE WHEN p_kind = 'message' THEN 1 ELSE 0 END,
    requests_sent = public.attention_usage.requests_sent
      + CASE WHEN p_kind = 'request' THEN 1 ELSE 0 END;

  RETURN jsonb_build_object('ok', true, 'used_token', false);
END;
$$;

-- UI helper: lock banner source + countdown end time.
CREATE OR REPLACE FUNCTION public.get_slave_write_lock()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_ends TIMESTAMPTZ;
  v_title TEXT;
  v_punishment_id UUID;
BEGIN
  IF v_uid IS NULL OR public.current_user_role() <> 'slave' THEN
    RETURN jsonb_build_object('active', false);
  END IF;

  IF public.is_no_contact_active() THEN
    SELECT s.no_contact_ends_at
    INTO v_ends
    FROM public.users u
    JOIN public.user_status s ON s.user_id = u.id
    WHERE u.role = 'queen'
    ORDER BY u.created_at ASC
    LIMIT 1;

    RETURN jsonb_build_object(
      'active', true,
      'source', 'no_contact',
      'title', 'No contact',
      'ends_at', v_ends,
      'body', 'Queen has set No contact. Browse only — all actions are locked until she changes status or the timer ends.'
    );
  END IF;

  SELECT p.id, p.title, p.ends_at
  INTO v_punishment_id, v_title, v_ends
  FROM public.punishments p
  WHERE p.issued_to = v_uid
    AND p.status = 'active'
    AND p.punishment_type = 'contact_restriction'
    AND (
      p.clearance_mode = 'task_debt'
      OR (p.clearance_mode = 'timed' AND p.ends_at > now())
    )
  ORDER BY p.ends_at ASC NULLS LAST, p.created_at DESC
  LIMIT 1;

  IF v_punishment_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'active', true,
      'source', 'contact_restriction',
      'title', COALESCE(NULLIF(trim(v_title), ''), 'Contact Restricted'),
      'ends_at', v_ends,
      'punishment_id', v_punishment_id,
      'body', 'Contact restriction is active. Browse only — you cannot change or add anything until this ends.'
    );
  END IF;

  RETURN jsonb_build_object('active', false);
END;
$$;

REVOKE ALL ON FUNCTION public.get_slave_write_lock() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_slave_write_lock() TO authenticated;

NOTIFY pgrst, 'reload schema';
