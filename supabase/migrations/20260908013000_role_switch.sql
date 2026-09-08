-- Reversible role switch: home slave ↔ primary home queen.
-- Active `role` drives permissions; `home_role` is permanent identity.
-- When switched, home slave holds role=queen and is displayed as King in the app.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS home_role text;

UPDATE public.users
SET home_role = role
WHERE home_role IS NULL;

ALTER TABLE public.users
  ALTER COLUMN home_role SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_home_role_check'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_home_role_check
      CHECK (home_role IN ('queen', 'slave'));
  END IF;
END $$;

COMMENT ON COLUMN public.users.home_role IS
  'Permanent identity (queen or slave). Never flipped by switch_pair_roles.';

-- Keep home_role in sync on signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_role text;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'slave');
  IF v_role NOT IN ('queen', 'slave') THEN
    v_role := 'slave';
  END IF;

  INSERT INTO public.users (id, email, username, role, home_role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    v_role,
    v_role
  );
  RETURN NEW;
END;
$function$;

-- Block direct client updates to role / home_role (RPC sets a local GUCs).
CREATE OR REPLACE FUNCTION public.guard_users_role_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.home_role IS DISTINCT FROM OLD.home_role THEN
      IF coalesce(current_setting('app.allow_role_switch', true), '') <> 'true' THEN
        RAISE EXCEPTION 'Role changes must go through switch_pair_roles()';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_users_role_columns ON public.users;
CREATE TRIGGER trg_guard_users_role_columns
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_users_role_columns();

CREATE OR REPLACE FUNCTION public.switch_pair_roles()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_home_queen uuid;
  v_home_slave uuid;
  v_queen_active text;
  v_slave_active text;
  v_switched boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_home_queen
  FROM public.users
  WHERE home_role = 'queen'
  ORDER BY created_at ASC
  LIMIT 1;

  SELECT id INTO v_home_slave
  FROM public.users
  WHERE home_role = 'slave'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_home_queen IS NULL OR v_home_slave IS NULL THEN
    RAISE EXCEPTION 'Primary pair is incomplete';
  END IF;

  IF v_caller IS DISTINCT FROM v_home_queen
     AND v_caller IS DISTINCT FROM v_home_slave THEN
    RAISE EXCEPTION 'Only the primary pair can switch roles';
  END IF;

  SELECT role INTO v_queen_active
  FROM public.users
  WHERE id = v_home_queen
  FOR UPDATE;

  SELECT role INTO v_slave_active
  FROM public.users
  WHERE id = v_home_slave
  FOR UPDATE;

  PERFORM set_config('app.allow_role_switch', 'true', true);

  UPDATE public.users
  SET role = v_slave_active
  WHERE id = v_home_queen;

  UPDATE public.users
  SET role = v_queen_active
  WHERE id = v_home_slave;

  SELECT (role = 'queen') INTO v_switched
  FROM public.users
  WHERE id = v_home_slave;

  INSERT INTO public.pair_settings (key, value, updated_by, updated_at)
  VALUES (
    'role_switch',
    jsonb_build_object(
      'switched', v_switched,
      'switched_at', now(),
      'home_queen_id', v_home_queen,
      'home_slave_id', v_home_slave
    ),
    v_caller,
    now()
  )
  ON CONFLICT (key) DO UPDATE
  SET
    value = EXCLUDED.value,
    updated_by = EXCLUDED.updated_by,
    updated_at = EXCLUDED.updated_at;

  RETURN jsonb_build_object(
    'switched', v_switched,
    'home_queen_id', v_home_queen,
    'home_slave_id', v_home_slave
  );
END;
$$;

REVOKE ALL ON FUNCTION public.switch_pair_roles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.switch_pair_roles() TO authenticated;

COMMENT ON FUNCTION public.switch_pair_roles() IS
  'Atomically swaps active roles between primary home queen and home slave. Call again to restore.';

NOTIFY pgrst, 'reload schema';
