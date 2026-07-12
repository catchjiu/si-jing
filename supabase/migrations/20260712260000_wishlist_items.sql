-- Queen's wishlist: item photos for the slave to study her taste

CREATE TABLE public.wishlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT,
  notes TEXT,
  link_url TEXT,
  image_path TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy_m DOUBLE PRECISION,
  location_source TEXT CHECK (location_source IS NULL OR location_source IN ('exif', 'device')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wishlist_items_created_at ON public.wishlist_items(created_at DESC);
CREATE INDEX idx_wishlist_items_created_by ON public.wishlist_items(created_by);

ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view wishlist_items"
  ON public.wishlist_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Queen can create wishlist_items"
  ON public.wishlist_items FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'queen'
    AND created_by = auth.uid()
  );

CREATE POLICY "Queen can delete wishlist_items"
  ON public.wishlist_items FOR DELETE TO authenticated
  USING (public.current_user_role() = 'queen');

INSERT INTO storage.buckets (id, name, public)
VALUES ('wishlist', 'wishlist', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can upload wishlist"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'wishlist');

CREATE POLICY "Authenticated can view wishlist"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'wishlist');

CREATE POLICY "Owners and queen can delete wishlist files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'wishlist'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR public.current_user_role() = 'queen'
    )
  );
