-- Allow slave (assigned) to create flirt timeline entries; author or queen can delete

DROP POLICY IF EXISTS "Queen can create flirt_entries" ON public.flirt_entries;
DROP POLICY IF EXISTS "Participants can create flirt_entries" ON public.flirt_entries;
CREATE POLICY "Participants can create flirt_entries"
  ON public.flirt_entries FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.flirt_guys g
      WHERE g.id = flirt_entries.guy_id
        AND (
          public.current_user_role() = 'queen'
          OR g.assigned_to = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "Queen can delete flirt_entries" ON public.flirt_entries;
DROP POLICY IF EXISTS "Author or queen can delete flirt_entries" ON public.flirt_entries;
CREATE POLICY "Author or queen can delete flirt_entries"
  ON public.flirt_entries FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.current_user_role() = 'queen'
  );
