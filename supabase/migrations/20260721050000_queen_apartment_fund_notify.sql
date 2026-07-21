-- Apartment fund: slave deposits (NTD) + notify Queen on each deposit.

CREATE TABLE IF NOT EXISTS public.queen_apartment_fund_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount_ntd NUMERIC(12, 2) NOT NULL CHECK (amount_ntd > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_queen_apartment_fund_entries_created
  ON public.queen_apartment_fund_entries (created_at DESC);

ALTER TABLE public.queen_apartment_fund_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Queen and slave view apartment fund" ON public.queen_apartment_fund_entries;
CREATE POLICY "Queen and slave view apartment fund"
  ON public.queen_apartment_fund_entries FOR SELECT TO authenticated
  USING (current_user_role() IN ('queen', 'slave'));

DROP POLICY IF EXISTS "Slave adds apartment fund entries" ON public.queen_apartment_fund_entries;
CREATE POLICY "Slave adds apartment fund entries"
  ON public.queen_apartment_fund_entries FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND current_user_role() = 'slave'
  );

CREATE OR REPLACE FUNCTION public.trg_notify_queen_apartment_fund_deposit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queen_id UUID;
  v_amount TEXT;
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

  PERFORM public.notify_user(
    v_queen_id,
    'apartment_fund',
    'Apartment fund deposit · D',
    format('Added NT$%s toward your apartment fund.', v_amount),
    '/dashboard',
    'apartment_fund_entry',
    NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_queen_apartment_fund_deposit
  ON public.queen_apartment_fund_entries;
CREATE TRIGGER trg_notify_queen_apartment_fund_deposit
  AFTER INSERT ON public.queen_apartment_fund_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_queen_apartment_fund_deposit();

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.queen_apartment_fund_entries;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

NOTIFY pgrst, 'reload schema';
