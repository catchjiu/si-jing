-- Timeline posts on a Queen date
CREATE TABLE public.date_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_id UUID NOT NULL REFERENCES public.queen_dates(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.users(id),
  body TEXT,
  media_kind TEXT NOT NULL DEFAULT 'text'
    CHECK (media_kind IN ('text', 'image', 'video', 'youtube')),
  file_path TEXT,
  youtube_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT date_posts_content_check CHECK (
    (media_kind = 'text' AND (body IS NOT NULL AND char_length(trim(body)) > 0))
    OR (media_kind = 'youtube' AND youtube_url IS NOT NULL)
    OR (media_kind IN ('image', 'video') AND file_path IS NOT NULL)
  )
);

CREATE INDEX idx_date_posts_date_id ON public.date_posts(date_id, created_at ASC);
CREATE INDEX idx_date_posts_author ON public.date_posts(author_id);

ALTER TABLE public.date_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view date_posts on relevant dates"
  ON public.date_posts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.queen_dates d
      WHERE d.id = date_posts.date_id
        AND (
          d.created_by = auth.uid()
          OR d.assigned_to = auth.uid()
          OR public.current_user_role() = 'queen'
        )
    )
  );

CREATE POLICY "Slave can create date_posts"
  ON public.date_posts FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.queen_dates d
      WHERE d.id = date_posts.date_id
        AND d.assigned_to = auth.uid()
    )
  );

CREATE POLICY "Author or queen can delete date_posts"
  ON public.date_posts FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.current_user_role() = 'queen'
  );

CREATE OR REPLACE FUNCTION public.mark_date_reacted_on_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.queen_dates
  SET reacted_at = COALESCE(reacted_at, NOW())
  WHERE id = NEW.date_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mark_date_reacted_on_post
  AFTER INSERT ON public.date_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_date_reacted_on_post();

INSERT INTO storage.buckets (id, name, public)
VALUES ('date_posts', 'date_posts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can upload date_posts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'date_posts');

CREATE POLICY "Authenticated can view date_posts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'date_posts');

CREATE POLICY "Owners and queen can delete date_posts files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'date_posts'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR public.current_user_role() = 'queen'
    )
  );

ALTER TABLE public.evidence_pins DROP CONSTRAINT IF EXISTS evidence_pins_source_type_check;
ALTER TABLE public.evidence_pins ADD CONSTRAINT evidence_pins_source_type_check
  CHECK (source_type = ANY (ARRAY['date'::text, 'tease'::text, 'voice_note'::text, 'date_post'::text]));

ALTER TABLE public.evidence_pins DROP CONSTRAINT IF EXISTS evidence_pins_media_kind_check;
ALTER TABLE public.evidence_pins ADD CONSTRAINT evidence_pins_media_kind_check
  CHECK (media_kind = ANY (ARRAY['youtube'::text, 'image'::text, 'voice'::text, 'reaction'::text, 'video'::text, 'text'::text]));

ALTER TABLE public.evidence_pins DROP CONSTRAINT IF EXISTS evidence_pins_storage_bucket_check;
ALTER TABLE public.evidence_pins ADD CONSTRAINT evidence_pins_storage_bucket_check
  CHECK (
    storage_bucket IS NULL
    OR storage_bucket = ANY (ARRAY['teases'::text, 'voice'::text, 'submissions'::text, 'date_posts'::text])
  );
