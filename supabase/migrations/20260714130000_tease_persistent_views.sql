-- Persistent tease views: count video plays and image dwell time (seconds)

ALTER TABLE public.teases
  ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.tease_view_captures
  ADD COLUMN IF NOT EXISTS watch_metric INTEGER;

CREATE OR REPLACE FUNCTION public.record_tease_view(
  p_tease_id UUID,
  p_watch_metric INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() <> 'slave' THEN
    RAISE EXCEPTION 'Only slave can record tease views';
  END IF;

  IF p_watch_metric IS NULL OR p_watch_metric < 1 THEN
    RAISE EXCEPTION 'Invalid watch metric';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.teases
    WHERE id = p_tease_id AND sent_to = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not your tease';
  END IF;

  UPDATE public.teases
  SET view_count = COALESCE(view_count, 0) + p_watch_metric
  WHERE id = p_tease_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_tease_view(UUID, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
