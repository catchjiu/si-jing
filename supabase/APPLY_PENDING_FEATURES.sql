-- Run once in Supabase Dashboard → SQL Editor
-- Safe to re-run (idempotent). Creates journal + other recent feature tables/columns.

-- ── Tasks: start timestamp ──
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

-- ── Wishlist fulfillment ──
ALTER TABLE public.wishlist_items
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fulfillment_notes TEXT,
  ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ;

UPDATE public.wishlista_items SET status = 'new' WHERE status IS NULL;
ALTER TABLE public.wishlist_items ALTER COLUMN status SET DEFAULT 'new';
ALTER TABLE public.wishlist_items ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.wishlist_items DROP CONSTRAINT IF EXISTS wishlist_items_status_check;
ALTER TABLE public.wishlist_items ADD CONSTRAINT wishlist_items_status_check
  CHECK (status IN ('new', 'seen', 'ordered', 'fulfilled'));

DROP POLICY IF EXISTS "Slave can mark wishlist seen" ON public.wishlist_items;
DROP POLICY IF EXISTS "Slave can update wishlist fulfillment" ON public.wishlist_items;
CREATE POLICY "Slave can update wishlist fulfillment"
  ON public.wishlist_items FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'slave')
  WITH CHECK (public.current_user_role() = 'slave');

-- ── Queen directives on requests ──
ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'petition',
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS slave_response TEXT,
  ADD COLUMN IF NOT EXISTS slave_responded_at TIMESTAMPTZ;

UPDATE public.requests SET direction = 'petition' WHERE direction IS NULL;
ALTER TABLE public.requests ALTER COLUMN direction SET DEFAULT 'petition';
ALTER TABLE public.requests ALTER COLUMN direction SET NOT NULL;

ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_direction_check;
ALTER TABLE public.requests ADD CONSTRAINT requests_direction_check
  CHECK (direction IN ('petition', 'directive'));

ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_request_type_check;
ALTER TABLE public.requests ADD CONSTRAINT requests_request_type_check
  CHECK (request_type = ANY (ARRAY[
    'contact'::text, 'mercy'::text, 'reward'::text, 'general'::text,
    'directive'::text, 'question'::text
  ]));

-- ── Streak milestones ──
CREATE TABLE IF NOT EXISTS public.streak_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_days INTEGER NOT NULL CHECK (target_days > 0),
  title TEXT NOT NULL,
  description TEXT,
  reward_suggestion TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.streak_milestone_awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id UUID NOT NULL REFERENCES public.streak_milestones(id) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  streak_at_award INTEGER NOT NULL,
  UNIQUE (milestone_id)
);

CREATE INDEX IF NOT EXISTS idx_streak_milestones_sort
  ON public.streak_milestones(sort_order ASC, target_days ASC);

-- ── Journal (fixes "journal_entries not in schema cache") ──
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'shared'
    CHECK (visibility IN ('private', 'shared')),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.journal_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_author_date
  ON public.journal_entries(author_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_comments_entry
  ON public.journal_comments(entry_id, created_at ASC);

-- ── Mood / user status ──
CREATE TABLE IF NOT EXISTS public.user_status (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  mood_level INTEGER NOT NULL DEFAULT 50 CHECK (mood_level >= 1 AND mood_level <= 100),
  mood_emoji TEXT NOT NULL DEFAULT '😐',
  availability TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_status
  ADD COLUMN IF NOT EXISTS availability TEXT;

ALTER TABLE public.user_status
  DROP CONSTRAINT IF EXISTS user_status_availability_check;
ALTER TABLE public.user_status
  ADD CONSTRAINT user_status_availability_check
  CHECK (
    availability IS NULL
    OR availability IN ('working', 'busy', 'dating', 'available')
  );

-- ── Voice notes: allow journal entity ──
ALTER TABLE public.voice_notes DROP CONSTRAINT IF EXISTS voice_notes_entity_type_check;
ALTER TABLE public.voice_notes ADD CONSTRAINT voice_notes_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'task'::text, 'submission'::text, 'request'::text, 'comment'::text,
    'reward'::text, 'punishment'::text, 'check_in'::text, 'tease'::text,
    'ritual'::text, 'date'::text, 'journal'::text
  ]));

-- ── RLS ──
ALTER TABLE public.streak_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streak_milestone_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view streak_milestones" ON public.streak_milestones;
CREATE POLICY "Authenticated can view streak_milestones"
  ON public.streak_milestones FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Queen can manage streak_milestones" ON public.streak_milestones;
CREATE POLICY "Queen can manage streak_milestones"
  ON public.streak_milestones FOR ALL TO authenticated
  USING (public.current_user_role() = 'queen')
  WITH CHECK (public.current_user_role() = 'queen' AND created_by = auth.uid());

DROP POLICY IF EXISTS "Authenticated can view streak_milestone_awards" ON public.streak_milestone_awards;
CREATE POLICY "Authenticated can view streak_milestone_awards"
  ON public.streak_milestone_awards FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can insert streak_milestone_awards" ON public.streak_milestone_awards;
CREATE POLICY "Authenticated can insert streak_milestone_awards"
  ON public.streak_milestone_awards FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view journal entries" ON public.journal_entries;
CREATE POLICY "Users can view journal entries"
  ON public.journal_entries FOR SELECT TO authenticated
  USING (author_id = auth.uid() OR visibility = 'shared');

DROP POLICY IF EXISTS "Slave can create journal entries" ON public.journal_entries;
CREATE POLICY "Slave can create journal entries"
  ON public.journal_entries FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'slave' AND author_id = auth.uid());

DROP POLICY IF EXISTS "Slave can update own journal entries" ON public.journal_entries;
CREATE POLICY "Slave can update own journal entries"
  ON public.journal_entries FOR UPDATE TO authenticated
  USING (author_id = auth.uid() AND public.current_user_role() = 'slave')
  WITH CHECK (author_id = auth.uid() AND public.current_user_role() = 'slave');

DROP POLICY IF EXISTS "Slave can delete own journal entries" ON public.journal_entries;
CREATE POLICY "Slave can delete own journal entries"
  ON public.journal_entries FOR DELETE TO authenticated
  USING (author_id = auth.uid() AND public.current_user_role() = 'slave');

DROP POLICY IF EXISTS "Authenticated can view journal comments on visible entries" ON public.journal_comments;
CREATE POLICY "Authenticated can view journal comments on visible entries"
  ON public.journal_comments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can comment on shared journal entries" ON public.journal_comments;
CREATE POLICY "Authenticated can comment on shared journal entries"
  ON public.journal_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated can view user_status" ON public.user_status;
CREATE POLICY "Authenticated can view user_status"
  ON public.user_status FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can upsert own status" ON public.user_status;
CREATE POLICY "Users can upsert own status"
  ON public.user_status FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own status" ON public.user_status;
CREATE POLICY "Users can update own status"
  ON public.user_status FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Queen date: protect thoughts_text / youtube_url from slave edits ──
CREATE OR REPLACE FUNCTION public.guard_queen_date_slave_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.current_user_role() <> 'queen' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.thoughts_text IS DISTINCT FROM OLD.thoughts_text
       OR NEW.youtube_url IS DISTINCT FROM OLD.youtube_url THEN
      RAISE EXCEPTION 'Only reaction fields may be updated by the recipient';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_queen_date_slave_update ON public.queen_dates;
CREATE TRIGGER trg_guard_queen_date_slave_update
  BEFORE UPDATE ON public.queen_dates
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_queen_date_slave_update();

-- ── Tease reaction meter ──
ALTER TABLE public.teases
  ADD COLUMN IF NOT EXISTS reaction_score INTEGER,
  ADD COLUMN IF NOT EXISTS reacted_at TIMESTAMPTZ;

ALTER TABLE public.teases DROP CONSTRAINT IF EXISTS teases_reaction_score_check;
ALTER TABLE public.teases ADD CONSTRAINT teases_reaction_score_check
  CHECK (
    reaction_score IS NULL
    OR (reaction_score >= 0 AND reaction_score <= 100)
  );

CREATE OR REPLACE FUNCTION public.guard_tease_recipient_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.current_user_role() = 'queen' THEN
    RETURN NEW;
  END IF;

  IF NEW.sent_by IS DISTINCT FROM OLD.sent_by
     OR NEW.sent_to IS DISTINCT FROM OLD.sent_to
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.image_path IS DISTINCT FROM OLD.image_path
     OR NEW.unlocks_at IS DISTINCT FROM OLD.unlocks_at
     OR NEW.unlocked_notified_at IS DISTINCT FROM OLD.unlocked_notified_at
     OR NEW.is_blurred IS DISTINCT FROM OLD.is_blurred
     OR NEW.blur_amount IS DISTINCT FROM OLD.blur_amount
     OR NEW.unblurred_at IS DISTINCT FROM OLD.unblurred_at
     OR NEW.view_duration_seconds IS DISTINCT FROM OLD.view_duration_seconds
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.latitude IS DISTINCT FROM OLD.latitude
     OR NEW.longitude IS DISTINCT FROM OLD.longitude
     OR NEW.accuracy_m IS DISTINCT FROM OLD.accuracy_m
     OR NEW.location_source IS DISTINCT FROM OLD.location_source THEN
    RAISE EXCEPTION 'Only view and reaction fields may be updated by the recipient';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_tease_recipient_update ON public.teases;
CREATE TRIGGER trg_guard_tease_recipient_update
  BEFORE UPDATE ON public.teases
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_tease_recipient_update();

-- ── Slave can delete own pending submissions ──
DROP POLICY IF EXISTS "Slave can delete own pending submissions" ON public.submissions;
CREATE POLICY "Slave can delete own pending submissions"
  ON public.submissions FOR DELETE TO authenticated
  USING (
    submitted_by = auth.uid()
    AND status IN ('pending', 'rejected')
    AND public.current_user_role() = 'slave'
  );

DROP POLICY IF EXISTS "Slave can delete media on own submissions" ON public.submission_media;
CREATE POLICY "Slave can delete media on own submissions"
  ON public.submission_media FOR DELETE TO authenticated
  USING (
    public.current_user_role() = 'slave'
    AND EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = submission_id
        AND s.submitted_by = auth.uid()
        AND s.status IN ('pending', 'rejected')
    )
  );

DROP POLICY IF EXISTS "Slave can delete comments on own submissions" ON public.comments;
CREATE POLICY "Slave can delete comments on own submissions"
  ON public.comments FOR DELETE TO authenticated
  USING (
    public.current_user_role() = 'slave'
    AND EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = submission_id
        AND s.submitted_by = auth.uid()
        AND s.status IN ('pending', 'rejected')
    )
  );

DROP POLICY IF EXISTS "Slave can delete voice on own submissions" ON public.voice_notes;
CREATE POLICY "Slave can delete voice on own submissions"
  ON public.voice_notes FOR DELETE TO authenticated
  USING (
    public.current_user_role() = 'slave'
    AND entity_type = 'submission'
    AND EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.id = entity_id
        AND s.submitted_by = auth.uid()
        AND s.status IN ('pending', 'rejected')
    )
  );

-- ── Delete own request posts and messages ──
DROP POLICY IF EXISTS "Queen can delete requests" ON public.requests;
DROP POLICY IF EXISTS "Authors and queen can delete requests" ON public.requests;
CREATE POLICY "Authors and queen can delete requests"
  ON public.requests FOR DELETE TO authenticated
  USING (
    requested_by = auth.uid()
    OR public.current_user_role() = 'queen'
  );

DROP POLICY IF EXISTS "Authors and queen can delete messages" ON public.request_messages;
CREATE POLICY "Authors and queen can delete messages"
  ON public.request_messages FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.current_user_role() = 'queen'
  );

-- ── Inbox messaging ──
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation_created
  ON public.direct_messages(conversation_id, created_at DESC);

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

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view conversations" ON public.conversations;
CREATE POLICY "Members can view conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members m
      WHERE m.conversation_id = conversations.id AND m.user_id = auth.uid()
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
  USING (sender_id = auth.uid() OR public.current_user_role() = 'queen')
  WITH CHECK (sender_id = auth.uid() OR public.current_user_role() = 'queen');

DROP POLICY IF EXISTS "Authors and queen can delete messages hard" ON public.direct_messages;
CREATE POLICY "Authors and queen can delete messages hard"
  ON public.direct_messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid() OR public.current_user_role() = 'queen');

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
  IF conv_id IS NOT NULL THEN RETURN conv_id; END IF;
  INSERT INTO public.conversations DEFAULT VALUES RETURNING id INTO conv_id;
  INSERT INTO public.conversation_members (conversation_id, user_id)
  VALUES (conv_id, queen_id), (conv_id, slave_id);
  RETURN conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_queen_slave_conversation() TO authenticated;

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

-- ── Apartment fund: edit contributions (long-press on wishlist) ──
DROP POLICY IF EXISTS "Queen updates apartment fund entries" ON public.queen_apartment_fund_entries;
CREATE POLICY "Queen updates apartment fund entries"
  ON public.queen_apartment_fund_entries FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'queen')
  WITH CHECK (public.current_user_role() = 'queen');

DROP POLICY IF EXISTS "Slave updates own apartment fund entries" ON public.queen_apartment_fund_entries;
CREATE POLICY "Slave updates own apartment fund entries"
  ON public.queen_apartment_fund_entries FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND public.current_user_role() = 'slave'
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.current_user_role() = 'slave'
  );

CREATE OR REPLACE FUNCTION public.update_queen_apartment_fund_entry(
  p_entry_id uuid,
  p_amount_ntd numeric,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.queen_apartment_fund_entries;
  v_role text;
BEGIN
  v_role := public.current_user_role();

  IF v_role NOT IN ('queen', 'slave') THEN
    RAISE EXCEPTION 'Not allowed to edit apartment fund entries';
  END IF;

  IF p_amount_ntd IS NULL OR p_amount_ntd <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  SELECT * INTO v_row
  FROM public.queen_apartment_fund_entries
  WHERE id = p_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contribution not found';
  END IF;

  IF v_role = 'slave' AND v_row.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'You can only edit your own contributions';
  END IF;

  UPDATE public.queen_apartment_fund_entries
  SET
    amount_ntd = p_amount_ntd,
    note = NULLIF(trim(COALESCE(p_note, '')), '')
  WHERE id = p_entry_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'user_id', v_row.user_id,
    'amount_ntd', v_row.amount_ntd,
    'note', v_row.note,
    'created_at', v_row.created_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_queen_apartment_fund_entry(uuid, numeric, text)
  TO authenticated;

-- ── Stories ──
CREATE TABLE IF NOT EXISTS public.stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT stories_title_len CHECK (char_length(trim(title)) > 0)
);

CREATE TABLE IF NOT EXISTS public.story_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT story_comments_content_len CHECK (char_length(trim(content)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_stories_author_created
  ON public.stories(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_status_created
  ON public.stories(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_comments_story
  ON public.story_comments(story_id, created_at ASC);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view published or own stories" ON public.stories;
CREATE POLICY "Users can view published or own stories"
  ON public.stories FOR SELECT TO authenticated
  USING (status = 'published' OR author_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated can create stories" ON public.stories;
CREATE POLICY "Authenticated can create stories"
  ON public.stories FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.current_user_role() IN ('queen', 'slave')
  );

DROP POLICY IF EXISTS "Authors can update own stories" ON public.stories;
CREATE POLICY "Authors can update own stories"
  ON public.stories FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "Authors or queen can delete stories" ON public.stories;
CREATE POLICY "Authors or queen can delete stories"
  ON public.stories FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.current_user_role() = 'queen');

DROP POLICY IF EXISTS "Authenticated can view story comments" ON public.story_comments;
CREATE POLICY "Authenticated can view story comments"
  ON public.story_comments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id
        AND (s.status = 'published' OR s.author_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated can comment on published stories" ON public.story_comments;
CREATE POLICY "Authenticated can comment on published stories"
  ON public.story_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id AND s.status = 'published'
    )
  );

DROP POLICY IF EXISTS "Authors or queen can delete story comments" ON public.story_comments;
CREATE POLICY "Authors or queen can delete story comments"
  ON public.story_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.current_user_role() = 'queen');

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.story_comments;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.direct_messages
  DROP CONSTRAINT IF EXISTS direct_messages_attachment_type_check;

ALTER TABLE public.direct_messages
  ADD CONSTRAINT direct_messages_attachment_type_check
  CHECK (
    attachment_type IS NULL
    OR attachment_type IN (
      'tease', 'task', 'punishment', 'reward', 'request',
      'date', 'journal', 'submission', 'wishlist', 'worship',
      'worship_assignment', 'denial', 'jealousy_mission', 'story'
    )
  );

-- Story blog covers + face refs for Grok Imagine
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS face_ref_path TEXT;

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS cover_image_path TEXT;

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS cover_prompt TEXT;

-- Timed reading windows for stories
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS view_window_minutes INTEGER;
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS viewable_until TIMESTAMPTZ;
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS tbc_locked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.stories
  DROP CONSTRAINT IF EXISTS stories_view_window_minutes_chk;
ALTER TABLE public.stories
  ADD CONSTRAINT stories_view_window_minutes_chk
  CHECK (
    view_window_minutes IS NULL
    OR view_window_minutes IN (30, 60, 240, 1440)
  );

UPDATE public.stories
SET published_at = created_at
WHERE status = 'published'
  AND published_at IS NULL;

CREATE TABLE IF NOT EXISTS public.story_access_grants (
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  grantee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  granted_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (story_id, grantee_id)
);

CREATE TABLE IF NOT EXISTS public.story_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'granted', 'denied')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  UNIQUE (story_id, requester_id)
);

CREATE INDEX IF NOT EXISTS idx_stories_viewable_until
  ON public.stories (viewable_until)
  WHERE viewable_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_story_access_grants_grantee
  ON public.story_access_grants (grantee_id, story_id);
CREATE INDEX IF NOT EXISTS idx_story_access_requests_story
  ON public.story_access_requests (story_id, status);

CREATE OR REPLACE FUNCTION public.story_readable_by_me(p_story_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.stories s
    WHERE s.id = p_story_id
      AND (
        s.author_id = auth.uid()
        OR (
          s.status = 'published'
          AND (
            EXISTS (
              SELECT 1
              FROM public.story_access_grants g
              WHERE g.story_id = s.id
                AND g.grantee_id = auth.uid()
            )
            OR (
              COALESCE(s.tbc_locked, false) = false
              AND (
                s.viewable_until IS NULL
                OR s.viewable_until > now()
              )
            )
          )
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.story_readable_by_me(uuid) TO authenticated;

ALTER TABLE public.story_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view story access grants" ON public.story_access_grants;
CREATE POLICY "Users can view story access grants"
  ON public.story_access_grants FOR SELECT TO authenticated
  USING (
    grantee_id = auth.uid()
    OR granted_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id AND s.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authors can grant story access" ON public.story_access_grants;
CREATE POLICY "Authors can grant story access"
  ON public.story_access_grants FOR INSERT TO authenticated
  WITH CHECK (
    granted_by = auth.uid()
    AND grantee_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id AND s.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authors can revoke story access" ON public.story_access_grants;
CREATE POLICY "Authors can revoke story access"
  ON public.story_access_grants FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id AND s.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can view story access requests" ON public.story_access_requests;
CREATE POLICY "Users can view story access requests"
  ON public.story_access_requests FOR SELECT TO authenticated
  USING (
    requester_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id AND s.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Readers can request story access" ON public.story_access_requests;
CREATE POLICY "Readers can request story access"
  ON public.story_access_requests FOR INSERT TO authenticated
  WITH CHECK (
    requester_id = auth.uid()
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id
        AND s.status = 'published'
        AND s.author_id <> auth.uid()
        AND NOT EXISTS (
          SELECT 1 FROM public.story_access_grants g
          WHERE g.story_id = s.id AND g.grantee_id = auth.uid()
        )
        AND (
          COALESCE(s.tbc_locked, false) = true
          OR (
            s.viewable_until IS NOT NULL
            AND s.viewable_until <= now()
          )
        )
    )
  );

DROP POLICY IF EXISTS "Requesters can re-open denied story access" ON public.story_access_requests;
CREATE POLICY "Requesters can re-open denied story access"
  ON public.story_access_requests FOR UPDATE TO authenticated
  USING (requester_id = auth.uid())
  WITH CHECK (requester_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "Authors can respond to story access requests" ON public.story_access_requests;
CREATE POLICY "Authors can respond to story access requests"
  ON public.story_access_requests FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id AND s.author_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id AND s.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authors can delete story access requests" ON public.story_access_requests;
CREATE POLICY "Authors can delete story access requests"
  ON public.story_access_requests FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id AND s.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated can comment on published stories" ON public.story_comments;
CREATE POLICY "Authenticated can comment on published stories"
  ON public.story_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id AND s.status = 'published'
    )
    AND public.story_readable_by_me(story_id)
  );

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.story_access_grants;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.story_access_requests;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Fart Tracker
CREATE TABLE IF NOT EXISTS public.fart_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  audio_path TEXT NOT NULL,
  duration_ms INT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fart_entries_audio_path_len CHECK (char_length(trim(audio_path)) > 0),
  CONSTRAINT fart_entries_note_len CHECK (
    note IS NULL OR char_length(trim(note)) <= 280
  )
);

CREATE INDEX IF NOT EXISTS idx_fart_entries_created
  ON public.fart_entries (created_at DESC);

ALTER TABLE public.fart_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view fart entries" ON public.fart_entries;
CREATE POLICY "Authenticated can view fart entries"
  ON public.fart_entries FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Queen can insert fart entries" ON public.fart_entries;
CREATE POLICY "Queen can insert fart entries"
  ON public.fart_entries FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'queen'
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Queen can delete own fart entries" ON public.fart_entries;
CREATE POLICY "Queen can delete own fart entries"
  ON public.fart_entries FOR DELETE TO authenticated
  USING (
    public.current_user_role() = 'queen'
    AND created_by = auth.uid()
  );

-- Lifetime fart likes (no daily reset)
ALTER TABLE public.pair_counters
  DROP CONSTRAINT IF EXISTS pair_counters_key_check;

ALTER TABLE public.pair_counters
  ADD CONSTRAINT pair_counters_key_check
  CHECK (key IN ('last_cum', 'queen_love', 'fart_likes'));

INSERT INTO public.pair_counters (key, reset_at, count)
VALUES ('fart_likes', now(), 0)
ON CONFLICT (key) DO NOTHING;

-- Fart Tracker: date, slave ratings, comments
ALTER TABLE public.fart_entries
  ADD COLUMN IF NOT EXISTS fart_date DATE;

UPDATE public.fart_entries
SET fart_date = (created_at AT TIME ZONE 'UTC')::date
WHERE fart_date IS NULL;

ALTER TABLE public.fart_entries
  ALTER COLUMN fart_date SET DEFAULT CURRENT_DATE;

ALTER TABLE public.fart_entries
  ALTER COLUMN fart_date SET NOT NULL;

ALTER TABLE public.fart_entries
  ADD COLUMN IF NOT EXISTS loudness INTEGER;

ALTER TABLE public.fart_entries
  ADD COLUMN IF NOT EXISTS hotness INTEGER;

ALTER TABLE public.fart_entries
  ADD COLUMN IF NOT EXISTS rated_at TIMESTAMPTZ;

ALTER TABLE public.fart_entries
  ADD COLUMN IF NOT EXISTS rated_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.fart_entries
  DROP CONSTRAINT IF EXISTS fart_entries_loudness_chk;
ALTER TABLE public.fart_entries
  ADD CONSTRAINT fart_entries_loudness_chk
  CHECK (loudness IS NULL OR loudness BETWEEN 0 AND 100);

ALTER TABLE public.fart_entries
  DROP CONSTRAINT IF EXISTS fart_entries_hotness_chk;
ALTER TABLE public.fart_entries
  ADD CONSTRAINT fart_entries_hotness_chk
  CHECK (hotness IS NULL OR hotness BETWEEN 0 AND 100);

CREATE INDEX IF NOT EXISTS idx_fart_entries_fart_date
  ON public.fart_entries (fart_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.fart_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.fart_entries(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fart_comments_content_len CHECK (char_length(trim(content)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_fart_comments_entry
  ON public.fart_comments (entry_id, created_at ASC);

ALTER TABLE public.fart_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view fart comments" ON public.fart_comments;
CREATE POLICY "Authenticated can view fart comments"
  ON public.fart_comments FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated can comment on farts" ON public.fart_comments;
CREATE POLICY "Authenticated can comment on farts"
  ON public.fart_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.current_user_role() IN ('queen', 'slave')
  );

DROP POLICY IF EXISTS "Authors or queen can delete fart comments" ON public.fart_comments;
CREATE POLICY "Authors or queen can delete fart comments"
  ON public.fart_comments FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.current_user_role() = 'queen'
  );

DROP POLICY IF EXISTS "Slave can rate fart entries" ON public.fart_entries;
CREATE POLICY "Slave can rate fart entries"
  ON public.fart_entries FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'slave')
  WITH CHECK (public.current_user_role() = 'slave');

CREATE OR REPLACE FUNCTION public.guard_fart_entry_slave_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() = 'slave' THEN
    IF NEW.audio_path IS DISTINCT FROM OLD.audio_path
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.note IS DISTINCT FROM OLD.note
      OR NEW.duration_ms IS DISTINCT FROM OLD.duration_ms
      OR NEW.fart_date IS DISTINCT FROM OLD.fart_date
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Slave can only set loudness and hotness';
    END IF;
    NEW.rated_by := auth.uid();
    NEW.rated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_fart_entry_slave_update ON public.fart_entries;
CREATE TRIGGER trg_guard_fart_entry_slave_update
  BEFORE UPDATE ON public.fart_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_fart_entry_slave_update();

ALTER TABLE public.direct_messages
  DROP CONSTRAINT IF EXISTS direct_messages_attachment_type_check;

ALTER TABLE public.direct_messages
  ADD CONSTRAINT direct_messages_attachment_type_check
  CHECK (
    attachment_type IS NULL
    OR attachment_type IN (
      'tease', 'task', 'punishment', 'reward', 'request',
      'date', 'journal', 'submission', 'wishlist', 'worship',
      'worship_assignment', 'denial', 'jealousy_mission', 'story', 'fart'
    )
  );

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.fart_comments;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Creep: Fart Tracker hub plus slave photo/video galleries
CREATE TABLE IF NOT EXISTS public.creep_galleries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 100,
  viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT creep_galleries_title_len CHECK (char_length(trim(title)) > 0),
  CONSTRAINT creep_galleries_slug_len CHECK (char_length(trim(slug)) > 0),
  CONSTRAINT creep_galleries_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT creep_galleries_slug_reserved CHECK (slug NOT IN ('fart', 'gallery')),
  CONSTRAINT creep_galleries_slug_unique UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_creep_galleries_sort
  ON public.creep_galleries (sort_order ASC, created_at ASC);

ALTER TABLE public.creep_galleries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view creep galleries" ON public.creep_galleries;
CREATE POLICY "Authenticated can view creep galleries"
  ON public.creep_galleries FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Slave can insert creep galleries" ON public.creep_galleries;
CREATE POLICY "Slave can insert creep galleries"
  ON public.creep_galleries FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
    AND is_system = false
  );

DROP POLICY IF EXISTS "Slave can update own creep galleries" ON public.creep_galleries;
CREATE POLICY "Slave can update own creep galleries"
  ON public.creep_galleries FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
    AND is_system = false
  )
  WITH CHECK (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
    AND is_system = false
  );

DROP POLICY IF EXISTS "Queen can update creep galleries" ON public.creep_galleries;
CREATE POLICY "Queen can update creep galleries"
  ON public.creep_galleries FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'queen')
  WITH CHECK (public.current_user_role() = 'queen');

DROP POLICY IF EXISTS "Slave or queen can delete custom creep galleries" ON public.creep_galleries;
CREATE POLICY "Slave or queen can delete custom creep galleries"
  ON public.creep_galleries FOR DELETE TO authenticated
  USING (
    is_system = false
    AND (
      public.current_user_role() = 'queen'
      OR (
        public.current_user_role() = 'slave'
        AND created_by = auth.uid()
      )
    )
  );

CREATE OR REPLACE FUNCTION public.guard_creep_gallery_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() = 'queen' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.title IS DISTINCT FROM OLD.title
      OR NEW.slug IS DISTINCT FROM OLD.slug
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.is_system IS DISTINCT FROM OLD.is_system
      OR NEW.sort_order IS DISTINCT FROM OLD.sort_order
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Queen may only mark creep galleries as viewed';
    END IF;
  ELSIF public.current_user_role() = 'slave' THEN
    NEW.is_system := OLD.is_system;
    NEW.slug := OLD.slug;
    NEW.created_by := OLD.created_by;
    NEW.sort_order := OLD.sort_order;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_creep_gallery_update ON public.creep_galleries;
CREATE TRIGGER trg_guard_creep_gallery_update
  BEFORE UPDATE ON public.creep_galleries
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_creep_gallery_update();

INSERT INTO public.creep_galleries (title, slug, is_system, sort_order)
SELECT 'Stretch Marks', 'stretch-marks', true, 10
WHERE NOT EXISTS (
  SELECT 1 FROM public.creep_galleries WHERE slug = 'stretch-marks'
);

INSERT INTO public.creep_galleries (title, slug, is_system, sort_order)
SELECT 'Panties', 'panties', true, 20
WHERE NOT EXISTS (
  SELECT 1 FROM public.creep_galleries WHERE slug = 'panties'
);

CREATE TABLE IF NOT EXISTS public.creep_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id UUID NOT NULL REFERENCES public.creep_galleries(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  image_path TEXT NOT NULL,
  media_kind TEXT NOT NULL DEFAULT 'image',
  viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT creep_entries_image_path_len CHECK (char_length(trim(image_path)) > 0),
  CONSTRAINT creep_entries_media_kind_check CHECK (media_kind IN ('image', 'video'))
);

CREATE INDEX IF NOT EXISTS idx_creep_entries_gallery_created
  ON public.creep_entries (gallery_id, created_at DESC);

ALTER TABLE public.creep_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view creep entries" ON public.creep_entries;
CREATE POLICY "Authenticated can view creep entries"
  ON public.creep_entries FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Slave can insert creep entries" ON public.creep_entries;
CREATE POLICY "Slave can insert creep entries"
  ON public.creep_entries FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Slave can update own creep entries" ON public.creep_entries;
CREATE POLICY "Slave can update own creep entries"
  ON public.creep_entries FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
  )
  WITH CHECK (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Queen can update creep entries" ON public.creep_entries;
CREATE POLICY "Queen can update creep entries"
  ON public.creep_entries FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'queen')
  WITH CHECK (public.current_user_role() = 'queen');

DROP POLICY IF EXISTS "Slave can delete own creep entries" ON public.creep_entries;
CREATE POLICY "Slave can delete own creep entries"
  ON public.creep_entries FOR DELETE TO authenticated
  USING (
    public.current_user_role() = 'slave'
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Queen can delete creep entries" ON public.creep_entries;
CREATE POLICY "Queen can delete creep entries"
  ON public.creep_entries FOR DELETE TO authenticated
  USING (public.current_user_role() = 'queen');

CREATE OR REPLACE FUNCTION public.guard_creep_entry_queen_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() = 'queen' THEN
    IF NEW.gallery_id IS DISTINCT FROM OLD.gallery_id
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.title IS DISTINCT FROM OLD.title
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.image_path IS DISTINCT FROM OLD.image_path
      OR NEW.media_kind IS DISTINCT FROM OLD.media_kind
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Queen may only mark creep entries as viewed';
    END IF;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_creep_entry_queen_update ON public.creep_entries;
CREATE TRIGGER trg_guard_creep_entry_queen_update
  BEFORE UPDATE ON public.creep_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_creep_entry_queen_update();

CREATE TABLE IF NOT EXISTS public.creep_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.creep_entries(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT creep_comments_content_len CHECK (char_length(trim(content)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_creep_comments_entry
  ON public.creep_comments (entry_id, created_at ASC);

ALTER TABLE public.creep_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view creep comments" ON public.creep_comments;
CREATE POLICY "Authenticated can view creep comments"
  ON public.creep_comments FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated can comment on creep entries" ON public.creep_comments;
CREATE POLICY "Authenticated can comment on creep entries"
  ON public.creep_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.current_user_role() IN ('queen', 'slave')
  );

DROP POLICY IF EXISTS "Authors or queen can delete creep comments" ON public.creep_comments;
CREATE POLICY "Authors or queen can delete creep comments"
  ON public.creep_comments FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.current_user_role() = 'queen'
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('creep', 'creep', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated can upload creep" ON storage.objects;
CREATE POLICY "Authenticated can upload creep"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'creep');

DROP POLICY IF EXISTS "Authenticated can view creep files" ON storage.objects;
CREATE POLICY "Authenticated can view creep files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'creep');

DROP POLICY IF EXISTS "Owners and queen can delete creep files" ON storage.objects;
CREATE POLICY "Owners and queen can delete creep files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'creep'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR public.current_user_role() = 'queen'
    )
  );

ALTER TABLE public.direct_messages
  DROP CONSTRAINT IF EXISTS direct_messages_attachment_type_check;

ALTER TABLE public.direct_messages
  ADD CONSTRAINT direct_messages_attachment_type_check
  CHECK (
    attachment_type IS NULL
    OR attachment_type IN (
      'tease', 'task', 'punishment', 'reward', 'request',
      'date', 'journal', 'submission', 'wishlist', 'worship',
      'worship_assignment', 'denial', 'jealousy_mission', 'story', 'fart',
      'creep'
    )
  );

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.creep_galleries;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.creep_entries;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.creep_comments;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Notify PostgREST to reload schema (Supabase picks up new tables)
NOTIFY pgrst, 'reload schema';
