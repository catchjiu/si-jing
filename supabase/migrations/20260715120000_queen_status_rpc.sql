-- Queen status for slave dashboard: reliable fetch + realtime updates

CREATE OR REPLACE FUNCTION public.get_queen_status()
RETURNS TABLE (
  queen_id UUID,
  username TEXT,
  availability TEXT,
  updated_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id,
    u.username,
    s.availability,
    s.updated_at,
    s.last_active_at
  FROM public.users u
  LEFT JOIN public.user_status s ON s.user_id = u.id
  WHERE u.role = 'queen'
  ORDER BY u.created_at ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_queen_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_queen_status() TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_status;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
