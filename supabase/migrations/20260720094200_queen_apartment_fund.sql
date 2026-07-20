-- Queen's apartment fund (NTD): slave contributions tracked on the wishlist page.

CREATE TABLE IF NOT EXISTS public.queen_apartment_fund_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  amount_ntd NUMERIC(12, 2) NOT NULL CHECK (amount_ntd > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_queen_apartment_fund_entries_created
  ON public.queen_apartment_fund_entries (created_at DESC);

ALTER TABLE public.queen_apartment_fund_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Queen and slave view apartment fund" ON public.queen_apartment_fund_entries;
CREATE POLICY "Queen and slave view apartment fund"
  ON public.queen_apartment_fund_entries FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('queen', 'slave')
  );

DROP POLICY IF EXISTS "Slave adds apartment fund entries" ON public.queen_apartment_fund_entries;
CREATE POLICY "Slave adds apartment fund entries"
  ON public.queen_apartment_fund_entries FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.current_user_role() = 'slave'
  );

NOTIFY pgrst, 'reload schema';
