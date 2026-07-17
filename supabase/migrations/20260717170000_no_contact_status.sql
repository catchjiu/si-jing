-- Queen "no contact" status: slave cannot insert/update/delete while active.

ALTER TABLE public.user_status
  DROP CONSTRAINT IF EXISTS user_status_availability_check;

ALTER TABLE public.user_status
  ADD CONSTRAINT user_status_availability_check
  CHECK (
    availability IS NULL
    OR availability IN ('working', 'busy', 'dating', 'available', 'no_contact')
  );

CREATE OR REPLACE FUNCTION public.is_no_contact_active()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.user_status s ON s.user_id = u.id
    WHERE u.role = 'queen'
      AND s.availability = 'no_contact'
  );
$$;

CREATE OR REPLACE FUNCTION public.assert_slave_can_mutate()
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() = 'slave' AND public.is_no_contact_active() THEN
    RAISE EXCEPTION 'No contact is active — you cannot change or add anything right now';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_no_contact_on_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_slave_can_mutate();
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'attention_usage',
    'check_ins',
    'comments',
    'conversation_members',
    'conversations',
    'direct_messages',
    'evidence_pins',
    'journal_comments',
    'journal_entries',
    'location_requests',
    'pair_counters',
    'request_messages',
    'requests',
    'ritual_occurrences',
    'rule_acknowledgments',
    'shop_purchases',
    'submission_media',
    'submissions',
    'tasks',
    'tease_messages',
    'tease_view_captures',
    'users',
    'voice_notes',
    'wishlist_items',
    'wishlist_messages',
    'wishlist_purchases',
    'worship_entries',
    'worship_galleries',
    'worship_gallery_messages',
    'worship_messages'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_no_contact_write ON public.%I',
      t
    );
    EXECUTE format(
      'CREATE TRIGGER trg_no_contact_write
         BEFORE INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW
         EXECUTE FUNCTION public.enforce_no_contact_on_write()',
      t
    );
  END LOOP;
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

GRANT EXECUTE ON FUNCTION public.is_no_contact_active() TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_slave_can_mutate() TO authenticated;

NOTIFY pgrst, 'reload schema';
