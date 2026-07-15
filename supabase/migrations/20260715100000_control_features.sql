-- Control features: presence, attention budget, points + shop, worship assignments

-- ─── Live presence ───────────────────────────────────────────────────────────
ALTER TABLE public.user_status
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_user_status_last_active
  ON public.user_status (last_active_at DESC);

CREATE OR REPLACE FUNCTION public.touch_last_active()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_status (user_id, last_active_at, updated_at)
  VALUES (auth.uid(), NOW(), NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET last_active_at = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.touch_last_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_last_active() TO authenticated;

-- ─── Pair settings (attention budget, watermark toggle, point rules) ─────────
CREATE TABLE IF NOT EXISTS public.pair_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.pair_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view pair_settings" ON public.pair_settings;
CREATE POLICY "Authenticated can view pair_settings"
  ON public.pair_settings FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Queen can upsert pair_settings" ON public.pair_settings;
CREATE POLICY "Queen can upsert pair_settings"
  ON public.pair_settings FOR ALL TO authenticated
  USING (public.current_user_role() = 'queen')
  WITH CHECK (public.current_user_role() = 'queen');

INSERT INTO public.pair_settings (key, value) VALUES
  (
    'attention_budget',
    jsonb_build_object(
      'enabled', true,
      'daily_message_limit', 10,
      'daily_request_limit', 3,
      'speak_freely_tokens', 0
    )
  ),
  (
    'proof_watermark',
    jsonb_build_object('enabled', true)
  ),
  (
    'points_rules',
    jsonb_build_object(
      'submission_approved', 15,
      'worship_entry', 5,
      'streak_milestone', 25
    )
  )
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.attention_usage (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'UTC')::date),
  messages_sent INT NOT NULL DEFAULT 0,
  requests_sent INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE public.attention_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own attention usage" ON public.attention_usage;
CREATE POLICY "Users can view own attention usage"
  ON public.attention_usage FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.current_user_role() = 'queen');

CREATE OR REPLACE FUNCTION public.get_attention_budget()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  settings JSONB;
  usage_row public.attention_usage%ROWTYPE;
  today DATE := (NOW() AT TIME ZONE 'UTC')::date;
  msg_limit INT;
  req_limit INT;
  tokens INT;
  enabled BOOLEAN;
BEGIN
  SELECT value INTO settings
  FROM public.pair_settings
  WHERE key = 'attention_budget';

  IF settings IS NULL THEN
    settings := jsonb_build_object(
      'enabled', false,
      'daily_message_limit', 10,
      'daily_request_limit', 3,
      'speak_freely_tokens', 0
    );
  END IF;

  enabled := COALESCE((settings->>'enabled')::boolean, false);
  msg_limit := COALESCE((settings->>'daily_message_limit')::int, 10);
  req_limit := COALESCE((settings->>'daily_request_limit')::int, 3);
  tokens := COALESCE((settings->>'speak_freely_tokens')::int, 0);

  SELECT * INTO usage_row
  FROM public.attention_usage
  WHERE user_id = auth.uid() AND usage_date = today;

  RETURN jsonb_build_object(
    'enabled', enabled,
    'daily_message_limit', msg_limit,
    'daily_request_limit', req_limit,
    'speak_freely_tokens', tokens,
    'messages_sent', COALESCE(usage_row.messages_sent, 0),
    'requests_sent', COALESCE(usage_row.requests_sent, 0),
    'messages_remaining', GREATEST(msg_limit - COALESCE(usage_row.messages_sent, 0), 0),
    'requests_remaining', GREATEST(req_limit - COALESCE(usage_row.requests_sent, 0), 0),
    'usage_date', today
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_attention(p_kind TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  budget JSONB;
  today DATE := (NOW() AT TIME ZONE 'UTC')::date;
  tokens INT;
  remaining INT;
  settings JSONB;
BEGIN
  IF public.current_user_role() <> 'slave' THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
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

CREATE OR REPLACE FUNCTION public.grant_speak_freely_tokens(p_count INT DEFAULT 1)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_tokens INT;
BEGIN
  IF public.current_user_role() <> 'queen' THEN
    RAISE EXCEPTION 'Only Queen can grant speak-freely tokens';
  END IF;
  IF p_count IS NULL OR p_count < 1 THEN
    RAISE EXCEPTION 'Token count must be at least 1';
  END IF;

  INSERT INTO public.pair_settings (key, value, updated_by, updated_at)
  VALUES (
    'attention_budget',
    jsonb_build_object(
      'enabled', true,
      'daily_message_limit', 10,
      'daily_request_limit', 3,
      'speak_freely_tokens', p_count
    ),
    auth.uid(),
    NOW()
  )
  ON CONFLICT (key) DO UPDATE SET
    value = jsonb_set(
      public.pair_settings.value,
      '{speak_freely_tokens}',
      to_jsonb(
        COALESCE((public.pair_settings.value->>'speak_freely_tokens')::int, 0) + p_count
      )
    ),
    updated_by = auth.uid(),
    updated_at = NOW()
  RETURNING COALESCE((value->>'speak_freely_tokens')::int, 0) INTO next_tokens;

  RETURN next_tokens;
END;
$$;

REVOKE ALL ON FUNCTION public.get_attention_budget() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_attention(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_speak_freely_tokens(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_attention_budget() TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_attention(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_speak_freely_tokens(INT) TO authenticated;

-- ─── Points ledger ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.points_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  delta INT NOT NULL,
  reason TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT points_ledger_delta_nonzero CHECK (delta <> 0)
);

CREATE INDEX IF NOT EXISTS idx_points_ledger_user_created
  ON public.points_ledger (user_id, created_at DESC);

ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view points ledger" ON public.points_ledger;
CREATE POLICY "Authenticated can view points ledger"
  ON public.points_ledger FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Queen can insert points ledger" ON public.points_ledger;
CREATE POLICY "Queen can insert points ledger"
  ON public.points_ledger FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'queen');

CREATE OR REPLACE FUNCTION public.points_balance(p_user UUID DEFAULT auth.uid())
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(SUM(delta), 0)::INT
  FROM public.points_ledger
  WHERE user_id = COALESCE(p_user, auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.award_points(
  p_user_id UUID,
  p_delta INT,
  p_reason TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
BEGIN
  IF p_delta = 0 THEN
    RAISE EXCEPTION 'Delta cannot be zero';
  END IF;
  IF public.current_user_role() <> 'queen' AND auth.uid() IS DISTINCT FROM NULL THEN
    -- allow internal triggers (no role) via table owner; block slave clients
    IF public.current_user_role() = 'slave' THEN
      RAISE EXCEPTION 'Only Queen can award points';
    END IF;
  END IF;

  INSERT INTO public.points_ledger (
    user_id, delta, reason, entity_type, entity_id, created_by
  ) VALUES (
    p_user_id, p_delta, p_reason, p_entity_type, p_entity_id, auth.uid()
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

-- Auto points: submission approved
CREATE OR REPLACE FUNCTION public.trg_points_on_submission_approved()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pts INT;
  rules JSONB;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    SELECT value INTO rules FROM public.pair_settings WHERE key = 'points_rules';
    pts := COALESCE((rules->>'submission_approved')::int, 15);
    IF pts <> 0 THEN
      INSERT INTO public.points_ledger (
        user_id, delta, reason, entity_type, entity_id, created_by
      ) VALUES (
        NEW.submitted_by,
        pts,
        'Submission approved',
        'submission',
        NEW.id,
        NULL
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_points_on_submission_approved ON public.submissions;
CREATE TRIGGER trg_points_on_submission_approved
  AFTER UPDATE OF status ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_points_on_submission_approved();

-- Auto points: worship entry
CREATE OR REPLACE FUNCTION public.trg_points_on_worship_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pts INT;
  rules JSONB;
BEGIN
  SELECT value INTO rules FROM public.pair_settings WHERE key = 'points_rules';
  pts := COALESCE((rules->>'worship_entry')::int, 5);
  IF pts <> 0 THEN
    INSERT INTO public.points_ledger (
      user_id, delta, reason, entity_type, entity_id, created_by
    ) VALUES (
      NEW.created_by,
      pts,
      'Worship photo added',
      'worship',
      NEW.id,
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_points_on_worship_entry ON public.worship_entries;
CREATE TRIGGER trg_points_on_worship_entry
  AFTER INSERT ON public.worship_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_points_on_worship_entry();

-- Auto points: streak milestone awards
CREATE OR REPLACE FUNCTION public.trg_points_on_streak_award()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pts INT;
  rules JSONB;
  slave_id UUID;
BEGIN
  SELECT value INTO rules FROM public.pair_settings WHERE key = 'points_rules';
  pts := COALESCE((rules->>'streak_milestone')::int, 25);
  SELECT id INTO slave_id FROM public.users WHERE role = 'slave' LIMIT 1;
  IF pts <> 0 AND slave_id IS NOT NULL THEN
    INSERT INTO public.points_ledger (
      user_id, delta, reason, entity_type, entity_id, created_by
    ) VALUES (
      slave_id,
      pts,
      'Streak milestone',
      'streak_milestone',
      NEW.id,
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'streak_milestone_awards'
  ) THEN
    DROP TRIGGER IF EXISTS trg_points_on_streak_award ON public.streak_milestone_awards;
    CREATE TRIGGER trg_points_on_streak_award
      AFTER INSERT ON public.streak_milestone_awards
      FOR EACH ROW
      EXECUTE FUNCTION public.trg_points_on_streak_award();
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.points_balance(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_points(UUID, INT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.points_balance(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_points(UUID, INT, TEXT, TEXT, UUID) TO authenticated;

-- ─── Shop ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shop_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  price INT NOT NULL CHECK (price > 0),
  image_path TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT shop_items_title_len CHECK (char_length(trim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_shop_items_active_sort
  ON public.shop_items (is_active, sort_order, created_at DESC);

ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view shop items" ON public.shop_items;
CREATE POLICY "Authenticated can view shop items"
  ON public.shop_items FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Queen can insert shop items" ON public.shop_items;
CREATE POLICY "Queen can insert shop items"
  ON public.shop_items FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'queen'
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Queen can update shop items" ON public.shop_items;
CREATE POLICY "Queen can update shop items"
  ON public.shop_items FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'queen')
  WITH CHECK (public.current_user_role() = 'queen');

DROP POLICY IF EXISTS "Queen can delete shop items" ON public.shop_items;
CREATE POLICY "Queen can delete shop items"
  ON public.shop_items FOR DELETE TO authenticated
  USING (public.current_user_role() = 'queen');

CREATE OR REPLACE FUNCTION public.set_shop_items_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shop_items_updated_at ON public.shop_items;
CREATE TRIGGER shop_items_updated_at
  BEFORE UPDATE ON public.shop_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_shop_items_updated_at();

CREATE TABLE IF NOT EXISTS public.shop_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.shop_items(id) ON DELETE RESTRICT,
  purchased_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  price_paid INT NOT NULL CHECK (price_paid > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'fulfilled', 'cancelled')),
  queen_note TEXT,
  ledger_id UUID REFERENCES public.points_ledger(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fulfilled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_shop_purchases_buyer
  ON public.shop_purchases (purchased_by, created_at DESC);

ALTER TABLE public.shop_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view shop purchases" ON public.shop_purchases;
CREATE POLICY "Authenticated can view shop purchases"
  ON public.shop_purchases FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Queen can update shop purchases" ON public.shop_purchases;
CREATE POLICY "Queen can update shop purchases"
  ON public.shop_purchases FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'queen')
  WITH CHECK (public.current_user_role() = 'queen');

CREATE OR REPLACE FUNCTION public.purchase_shop_item(p_item_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item public.shop_items%ROWTYPE;
  balance INT;
  ledger_id UUID;
  purchase_id UUID;
BEGIN
  IF public.current_user_role() <> 'slave' THEN
    RAISE EXCEPTION 'Only D can buy from the shop';
  END IF;

  SELECT * INTO item FROM public.shop_items WHERE id = p_item_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shop item not available';
  END IF;

  balance := public.points_balance(auth.uid());
  IF balance < item.price THEN
    RAISE EXCEPTION 'Not enough points (have %, need %)', balance, item.price;
  END IF;

  INSERT INTO public.points_ledger (
    user_id, delta, reason, entity_type, entity_id, created_by
  ) VALUES (
    auth.uid(),
    -item.price,
    format('Shop: %s', item.title),
    'shop_item',
    item.id,
    auth.uid()
  )
  RETURNING id INTO ledger_id;

  INSERT INTO public.shop_purchases (
    item_id, purchased_by, price_paid, ledger_id
  ) VALUES (
    item.id, auth.uid(), item.price, ledger_id
  )
  RETURNING id INTO purchase_id;

  RETURN purchase_id;
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_shop_item(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_shop_item(UUID) TO authenticated;

-- ─── Worship assignments ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.worship_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assigned_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  gallery_id UUID REFERENCES public.worship_galleries(id) ON DELETE SET NULL,
  topic TEXT NOT NULL,
  description TEXT,
  min_entries INT NOT NULL DEFAULT 1 CHECK (min_entries >= 1 AND min_entries <= 50),
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'completed', 'cancelled', 'overdue')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT worship_assignments_topic_len CHECK (char_length(trim(topic)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_worship_assignments_status_due
  ON public.worship_assignments (status, due_at);

ALTER TABLE public.worship_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view worship assignments" ON public.worship_assignments;
CREATE POLICY "Authenticated can view worship assignments"
  ON public.worship_assignments FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Queen can insert worship assignments" ON public.worship_assignments;
CREATE POLICY "Queen can insert worship assignments"
  ON public.worship_assignments FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'queen'
    AND assigned_by = auth.uid()
  );

DROP POLICY IF EXISTS "Queen can update worship assignments" ON public.worship_assignments;
CREATE POLICY "Queen can update worship assignments"
  ON public.worship_assignments FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'queen')
  WITH CHECK (public.current_user_role() = 'queen');

DROP POLICY IF EXISTS "Queen can delete worship assignments" ON public.worship_assignments;
CREATE POLICY "Queen can delete worship assignments"
  ON public.worship_assignments FOR DELETE TO authenticated
  USING (public.current_user_role() = 'queen');

CREATE OR REPLACE FUNCTION public.set_worship_assignments_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS worship_assignments_updated_at ON public.worship_assignments;
CREATE TRIGGER worship_assignments_updated_at
  BEFORE UPDATE ON public.worship_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_worship_assignments_updated_at();

CREATE OR REPLACE FUNCTION public.create_worship_assignment(
  p_topic TEXT,
  p_description TEXT,
  p_min_entries INT,
  p_due_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  slave_id UUID;
  gallery_id UUID;
  assignment_id UUID;
BEGIN
  IF public.current_user_role() <> 'queen' THEN
    RAISE EXCEPTION 'Only Queen can create worship assignments';
  END IF;

  SELECT id INTO slave_id FROM public.users WHERE role = 'slave' LIMIT 1;
  IF slave_id IS NULL THEN
    RAISE EXCEPTION 'No slave account found';
  END IF;

  INSERT INTO public.worship_galleries (created_by, topic, description)
  VALUES (slave_id, trim(p_topic), NULLIF(trim(COALESCE(p_description, '')), ''))
  RETURNING id INTO gallery_id;

  INSERT INTO public.worship_assignments (
    assigned_by, assigned_to, gallery_id, topic, description, min_entries, due_at
  ) VALUES (
    auth.uid(),
    slave_id,
    gallery_id,
    trim(p_topic),
    NULLIF(trim(COALESCE(p_description, '')), ''),
    GREATEST(COALESCE(p_min_entries, 1), 1),
    p_due_at
  )
  RETURNING id INTO assignment_id;

  RETURN assignment_id;
END;
$$;

-- Mark assignment complete when gallery hits min_entries
CREATE OR REPLACE FUNCTION public.trg_check_worship_assignment_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.worship_assignments%ROWTYPE;
  entry_count INT;
BEGIN
  FOR a IN
    SELECT * FROM public.worship_assignments
    WHERE gallery_id = NEW.gallery_id AND status = 'open'
  LOOP
    SELECT COUNT(*)::INT INTO entry_count
    FROM public.worship_entries
    WHERE gallery_id = a.gallery_id;

    IF entry_count >= a.min_entries THEN
      UPDATE public.worship_assignments
      SET status = 'completed', completed_at = NOW()
      WHERE id = a.id;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_worship_assignment_progress ON public.worship_entries;
CREATE TRIGGER trg_check_worship_assignment_progress
  AFTER INSERT ON public.worship_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_check_worship_assignment_progress();

-- Allow queen-created galleries (via SECURITY DEFINER) — slave policy already covers slave inserts.
-- Relax gallery insert for security definer by owning the function.

ALTER TABLE public.direct_messages
  DROP CONSTRAINT IF EXISTS direct_messages_attachment_type_check;

ALTER TABLE public.direct_messages
  ADD CONSTRAINT direct_messages_attachment_type_check
  CHECK (
    attachment_type IS NULL
    OR attachment_type IN (
      'tease', 'task', 'punishment', 'reward', 'request',
      'date', 'journal', 'submission', 'wishlist', 'worship',
      'shop', 'worship_assignment'
    )
  );

REVOKE ALL ON FUNCTION public.create_worship_assignment(TEXT, TEXT, INT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_worship_assignment(TEXT, TEXT, INT, TIMESTAMPTZ) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.pair_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.points_ledger;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shop_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shop_purchases;
ALTER PUBLICATION supabase_realtime ADD TABLE public.worship_assignments;

NOTIFY pgrst, 'reload schema';
