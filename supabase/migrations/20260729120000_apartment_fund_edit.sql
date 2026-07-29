-- Allow Queen to edit any apartment fund entry; slave may edit own deposits.

DROP POLICY IF EXISTS "Queen updates apartment fund entries" ON public.queen_apartment_fund_entries;
CREATE POLICY "Queen updates apartment fund entries"
  ON public.queen_apartment_fund_entries FOR UPDATE TO authenticated
  USING (current_user_role() = 'queen')
  WITH CHECK (current_user_role() = 'queen');

DROP POLICY IF EXISTS "Slave updates own apartment fund entries" ON public.queen_apartment_fund_entries;
CREATE POLICY "Slave updates own apartment fund entries"
  ON public.queen_apartment_fund_entries FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND current_user_role() = 'slave'
  )
  WITH CHECK (
    user_id = auth.uid()
    AND current_user_role() = 'slave'
  );

NOTIFY pgrst, 'reload schema';
