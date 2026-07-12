-- Bidirectional location requests + geotags on date timeline photos

CREATE TABLE public.location_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID NOT NULL REFERENCES public.users(id),
  requested_from UUID NOT NULL REFERENCES public.users(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status = ANY (ARRAY['pending'::text, 'shared'::text, 'declined'::text, 'cancelled'::text])),
  message TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy_m DOUBLE PRECISION,
  shared_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT location_requests_parties_distinct CHECK (requested_by <> requested_from)
);

CREATE INDEX idx_location_requests_from_status
  ON public.location_requests(requested_from, status, created_at DESC);
CREATE INDEX idx_location_requests_by_status
  ON public.location_requests(requested_by, status, created_at DESC);

CREATE UNIQUE INDEX idx_location_requests_one_pending
  ON public.location_requests(requested_by, requested_from)
  WHERE status = 'pending';

ALTER TABLE public.location_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view location_requests"
  ON public.location_requests FOR SELECT TO authenticated
  USING (
    requested_by = auth.uid()
    OR requested_from = auth.uid()
    OR public.current_user_role() = 'queen'
  );

CREATE POLICY "Users can create location_requests"
  ON public.location_requests FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND requested_from <> auth.uid()
    AND (
      public.current_user_role() = 'queen'
      OR NOT public.has_punishment_effect(auth.uid(), 'contact')
    )
  );

CREATE POLICY "Participants can update location_requests"
  ON public.location_requests FOR UPDATE TO authenticated
  USING (
    requested_by = auth.uid()
    OR requested_from = auth.uid()
    OR public.current_user_role() = 'queen'
  )
  WITH CHECK (
    requested_by = auth.uid()
    OR requested_from = auth.uid()
    OR public.current_user_role() = 'queen'
  );

CREATE POLICY "Queen can delete location_requests"
  ON public.location_requests FOR DELETE TO authenticated
  USING (public.current_user_role() = 'queen');

ALTER PUBLICATION supabase_realtime ADD TABLE public.location_requests;

ALTER TABLE public.date_posts
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS accuracy_m DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_source TEXT;

ALTER TABLE public.date_posts DROP CONSTRAINT IF EXISTS date_posts_location_source_check;
ALTER TABLE public.date_posts ADD CONSTRAINT date_posts_location_source_check
  CHECK (
    location_source IS NULL
    OR location_source = ANY (ARRAY['exif'::text, 'device'::text])
  );
