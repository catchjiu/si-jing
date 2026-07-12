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

UPDATE public.wishlist_items SET status = 'new' WHERE status IS NULL;
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

-- Notify PostgREST to reload schema (Supabase picks up new tables)
NOTIFY pgrst, 'reload schema';
