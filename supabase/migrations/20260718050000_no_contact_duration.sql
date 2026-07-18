-- Timed No contact: Queen sets an optional end time; auto-clears when expired.

ALTER TABLE public.user_status
  ADD COLUMN IF NOT EXISTS no_contact_ends_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.is_no_contact_active()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.user_status s ON s.user_id = u.id
    WHERE u.role = 'queen'
      AND s.availability = 'no_contact'
      AND (s.no_contact_ends_at IS NULL OR s.no_contact_ends_at > now())
  );
$$;

CREATE OR REPLACE FUNCTION public.clear_expired_no_contact()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  UPDATE public.user_status s
  SET
    availability = 'available',
    availability_source = NULL,
    no_contact_ends_at = NULL,
    updated_at = now()
  FROM public.users u
  WHERE s.user_id = u.id
    AND u.role = 'queen'
    AND s.availability = 'no_contact'
    AND s.no_contact_ends_at IS NOT NULL
    AND s.no_contact_ends_at <= now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.clear_expired_no_contact() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_expired_no_contact() TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_expired_no_contact() TO service_role;

DROP FUNCTION IF EXISTS public.get_queen_status();

CREATE FUNCTION public.get_queen_status()
RETURNS TABLE (
  queen_id UUID,
  username TEXT,
  availability TEXT,
  updated_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ,
  no_contact_ends_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id,
    u.username,
    CASE
      WHEN s.availability = 'no_contact'
           AND s.no_contact_ends_at IS NOT NULL
           AND s.no_contact_ends_at <= now()
        THEN 'available'
      ELSE s.availability
    END,
    s.updated_at,
    s.last_active_at,
    CASE
      WHEN s.availability = 'no_contact'
           AND (s.no_contact_ends_at IS NULL OR s.no_contact_ends_at > now())
        THEN s.no_contact_ends_at
      ELSE NULL
    END
  FROM public.users u
  LEFT JOIN public.user_status s ON s.user_id = u.id
  WHERE u.role = 'queen'
  ORDER BY u.created_at ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_queen_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_queen_status() TO authenticated;

NOTIFY pgrst, 'reload schema';
