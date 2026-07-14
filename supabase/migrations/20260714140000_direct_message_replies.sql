-- Reply-to on inbox messages (quote a specific message in thread)

ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.direct_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_direct_messages_reply_to
  ON public.direct_messages(reply_to_id)
  WHERE reply_to_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
