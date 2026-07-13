-- Allow slave to delete own submissions that are still awaiting review or rejected

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
