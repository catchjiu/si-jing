-- Deep-link inbox attachments to the exact tease / worship action

ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS attachment_anchor TEXT;
