-- Optional note on each apartment fund deposit.

ALTER TABLE public.queen_apartment_fund_entries
  ADD COLUMN IF NOT EXISTS note TEXT;

UPDATE public.queen_apartment_fund_entries
SET note = '2 private classes'
WHERE note IS NULL;

CREATE OR REPLACE FUNCTION public.trg_notify_queen_apartment_fund_deposit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queen_id UUID;
  v_amount TEXT;
  v_body TEXT;
  v_note TEXT;
BEGIN
  IF public.current_user_role() <> 'slave' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_queen_id
  FROM public.users
  WHERE role = 'queen'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_queen_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_amount := to_char(NEW.amount_ntd, 'FM999,999,990');
  v_body := format('Added NT$%s toward your apartment fund.', v_amount);
  v_note := NULLIF(trim(COALESCE(NEW.note, '')), '');
  IF v_note IS NOT NULL THEN
    v_body := v_body || ' Note: ' || v_note;
  END IF;

  PERFORM public.notify_user(
    v_queen_id,
    'apartment_fund',
    'Apartment fund deposit · D',
    v_body,
    '/dashboard',
    'apartment_fund_entry',
    NEW.id
  );

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
