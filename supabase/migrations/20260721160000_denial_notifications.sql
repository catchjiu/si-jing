-- Allow denial edge / comment deep links in inbox thread attachments.

ALTER TABLE public.direct_messages
  DROP CONSTRAINT IF EXISTS direct_messages_attachment_type_check;

ALTER TABLE public.direct_messages
  ADD CONSTRAINT direct_messages_attachment_type_check
  CHECK (
    attachment_type IS NULL
    OR attachment_type IN (
      'tease', 'task', 'punishment', 'reward', 'request',
      'date', 'journal', 'submission', 'wishlist', 'worship',
      'shop', 'worship_assignment', 'denial'
    )
  );

NOTIFY pgrst, 'reload schema';
