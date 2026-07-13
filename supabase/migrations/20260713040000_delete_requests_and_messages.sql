-- Allow authors (and Queen) to delete their own request posts and messages.

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
