-- Queen dates: scheduled dates with slave reactions
CREATE TABLE public.queen_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.users(id),
  assigned_to UUID NOT NULL REFERENCES public.users(id),
  title TEXT,
  notes TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  thoughts_text TEXT,
  arousal_level INT CHECK (arousal_level IS NULL OR (arousal_level BETWEEN 0 AND 100)),
  jealousy_level INT CHECK (jealousy_level IS NULL OR (jealousy_level BETWEEN 0 AND 100)),
  youtube_url TEXT,
  reacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_queen_dates_assigned_to ON public.queen_dates(assigned_to);
CREATE INDEX idx_queen_dates_scheduled_at ON public.queen_dates(scheduled_at DESC);
CREATE INDEX idx_queen_dates_created_by ON public.queen_dates(created_by);

ALTER TABLE public.queen_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view relevant queen_dates"
  ON public.queen_dates FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR public.current_user_role() = 'queen'
  );

CREATE POLICY "Queen can create queen_dates"
  ON public.queen_dates FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'queen');

CREATE POLICY "Queen can update queen_dates"
  ON public.queen_dates FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'queen')
  WITH CHECK (public.current_user_role() = 'queen');

CREATE POLICY "Queen can delete queen_dates"
  ON public.queen_dates FOR DELETE TO authenticated
  USING (public.current_user_role() = 'queen');

CREATE POLICY "Slave can react to queen_dates"
  ON public.queen_dates FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

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
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Only reaction fields may be updated by the recipient';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_queen_date_slave_update
  BEFORE UPDATE ON public.queen_dates
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_queen_date_slave_update();

ALTER TABLE public.voice_notes DROP CONSTRAINT IF EXISTS voice_notes_entity_type_check;
ALTER TABLE public.voice_notes ADD CONSTRAINT voice_notes_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'task'::text,
    'submission'::text,
    'request'::text,
    'comment'::text,
    'reward'::text,
    'punishment'::text,
    'check_in'::text,
    'tease'::text,
    'ritual'::text,
    'date'::text
  ]));
