-- Mirror tease cards into Direct (general) inbox so both threads show them

INSERT INTO public.direct_messages (
  conversation_id, sender_id, content,
  attachment_type, attachment_id, created_at
)
SELECT
  g.id,
  t.sent_by,
  COALESCE(NULLIF(btrim(t.title), ''), NULLIF(btrim(t.message), ''), 'Tease'),
  'tease',
  t.id,
  t.created_at
FROM public.teases t
CROSS JOIN public.conversations g
WHERE g.topic = 'general'
  AND NOT EXISTS (
    SELECT 1
    FROM public.direct_messages x
    WHERE x.conversation_id = g.id
      AND x.attachment_type = 'tease'
      AND x.attachment_id = t.id
      AND x.deleted_at IS NULL
  );
