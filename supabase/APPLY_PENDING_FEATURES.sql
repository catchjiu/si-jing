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

-- Notify PostgREST to reload schema (Supabase picks up new tables)
NOTIFY pgrst, 'reload schema';
