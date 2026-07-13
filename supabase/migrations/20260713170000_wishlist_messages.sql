-- Text comments on wishlist items (alongside fulfillment notes)

CREATE TABLE public.wishlist_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wishlist_id UUID NOT NULL REFERENCES public.wishlist_items(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wishlist_messages_content_len CHECK (char_length(trim(content)) > 0)
);

CREATE INDEX idx_wishlist_messages_wishlist_id
  ON public.wishlist_messages(wishlist_id, created_at ASC);

ALTER TABLE public.wishlist_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view wishlist messages"
  ON public.wishlist_messages FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated can send wishlist messages"
  ON public.wishlist_messages FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors and queen can delete wishlist messages"
  ON public.wishlist_messages FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.current_user_role() = 'queen'
  );

ALTER TABLE public.wishlist_items
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.wishlist_items
SET updated_at = COALESCE(fulfilled_at, seen_at, created_at)
WHERE updated_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_wishlist_items_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wishlist_items_updated_at ON public.wishlist_items;
CREATE TRIGGER wishlist_items_updated_at
  BEFORE UPDATE ON public.wishlist_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_wishlist_items_updated_at();

ALTER TABLE public.direct_messages
  DROP CONSTRAINT IF EXISTS direct_messages_attachment_type_check;

ALTER TABLE public.direct_messages
  ADD CONSTRAINT direct_messages_attachment_type_check
  CHECK (
    attachment_type IS NULL
    OR attachment_type IN (
      'tease', 'task', 'punishment', 'reward', 'request',
      'date', 'journal', 'submission', 'wishlist'
    )
  );

ALTER TABLE public.voice_notes DROP CONSTRAINT IF EXISTS voice_notes_entity_type_check;
ALTER TABLE public.voice_notes ADD CONSTRAINT voice_notes_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'task'::text, 'submission'::text, 'request'::text, 'comment'::text,
    'reward'::text, 'punishment'::text, 'check_in'::text, 'tease'::text,
    'ritual'::text, 'date'::text, 'journal'::text, 'wishlist'::text
  ]));

ALTER PUBLICATION supabase_realtime ADD TABLE public.wishlist_messages;

NOTIFY pgrst, 'reload schema';
