-- Allow Queen to post on date timelines; only slave posts mark reacted_at

DROP POLICY IF EXISTS "Slave can create date_posts" ON public.date_posts;
DROP POLICY IF EXISTS "Participants can create date_posts" ON public.date_posts;
CREATE POLICY "Participants can create date_posts"
  ON public.date_posts FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.queen_dates d
      WHERE d.id = date_posts.date_id
        AND (
          d.created_by = auth.uid()
          OR d.assigned_to = auth.uid()
          OR public.current_user_role() = 'queen'
        )
    )
    AND (
      public.current_user_role() = 'queen'
      OR NOT public.has_punishment_effect(auth.uid(), 'date_post')
    )
  );

CREATE OR REPLACE FUNCTION public.mark_date_reacted_on_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.queen_dates
  SET reacted_at = COALESCE(reacted_at, NOW())
  WHERE id = NEW.date_id
    AND assigned_to = NEW.author_id;
  RETURN NEW;
END;
$$;
