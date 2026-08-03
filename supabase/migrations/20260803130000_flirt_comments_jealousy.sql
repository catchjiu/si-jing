-- Flirt comments (slave + queen) and slave jealousy level per guy

ALTER TABLE public.flirt_guys
  ADD COLUMN IF NOT EXISTS jealousy_level INT NOT NULL DEFAULT 50
    CHECK (jealousy_level BETWEEN 0 AND 100);

CREATE POLICY "Slave can update jealousy on flirt_guys"
  ON public.flirt_guys FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_flirt_guy_slave_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.current_user_role() <> 'queen' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.photo_path IS DISTINCT FROM OLD.photo_path
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.interest_level IS DISTINCT FROM OLD.interest_level
       OR NEW.hotness_level IS DISTINCT FROM OLD.hotness_level
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
      RAISE EXCEPTION 'Only jealousy may be updated by the assigned slave';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_flirt_guy_slave_update ON public.flirt_guys;
CREATE TRIGGER trg_guard_flirt_guy_slave_update
  BEFORE UPDATE ON public.flirt_guys
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_flirt_guy_slave_update();

CREATE TABLE public.flirt_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guy_id UUID NOT NULL REFERENCES public.flirt_guys(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.users(id),
  content TEXT,
  image_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT flirt_messages_has_body CHECK (
    (content IS NOT NULL AND char_length(trim(content)) > 0)
    OR image_path IS NOT NULL
  )
);

CREATE INDEX idx_flirt_messages_guy_id
  ON public.flirt_messages(guy_id, created_at ASC);

ALTER TABLE public.flirt_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view flirt_messages on relevant guys"
  ON public.flirt_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.flirt_guys g
      WHERE g.id = flirt_messages.guy_id
        AND (
          g.created_by = auth.uid()
          OR g.assigned_to = auth.uid()
          OR public.current_user_role() = 'queen'
        )
    )
  );

CREATE POLICY "Queen and slave can send flirt_messages"
  ON public.flirt_messages FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.current_user_role() IN ('queen', 'slave')
    AND EXISTS (
      SELECT 1 FROM public.flirt_guys g
      WHERE g.id = flirt_messages.guy_id
        AND (
          g.created_by = auth.uid()
          OR g.assigned_to = auth.uid()
          OR public.current_user_role() = 'queen'
        )
    )
  );

CREATE POLICY "Authors and queen can delete flirt_messages"
  ON public.flirt_messages FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.current_user_role() = 'queen'
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.flirt_messages;

NOTIFY pgrst, 'reload schema';
