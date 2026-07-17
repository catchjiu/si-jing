-- Queen size chart for wishlist gift sizing (Queen edits, D reads)

CREATE TABLE IF NOT EXISTS public.queen_size_chart (
  user_id UUID PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  height TEXT,
  bust TEXT,
  waist TEXT,
  hips TEXT,
  dress_size TEXT,
  top_size TEXT,
  bottom_size TEXT,
  bra_size TEXT,
  underwear_size TEXT,
  shoe_size TEXT,
  ring_size TEXT,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.queen_size_chart ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view queen size chart" ON public.queen_size_chart;
CREATE POLICY "Authenticated can view queen size chart"
  ON public.queen_size_chart FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Queen can manage own size chart" ON public.queen_size_chart;
CREATE POLICY "Queen can manage own size chart"
  ON public.queen_size_chart FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    AND public.current_user_role() = 'queen'
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.current_user_role() = 'queen'
  );

NOTIFY pgrst, 'reload schema';
