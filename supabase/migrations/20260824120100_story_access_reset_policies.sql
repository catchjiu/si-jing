DROP POLICY IF EXISTS "Authors can delete story access requests" ON public.story_access_requests;
CREATE POLICY "Authors can delete story access requests"
  ON public.story_access_requests FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stories s
      WHERE s.id = story_id AND s.author_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
