-- Backfill historical entities into topic inbox threads (idempotent via source UUIDs as DM ids)

SELECT public.ensure_topic_conversations();

-- Teases
INSERT INTO public.direct_messages (
  id, conversation_id, sender_id, content, media_path, media_type,
  attachment_type, attachment_id, created_at
)
SELECT
  t.id,
  c.id,
  t.sent_by,
  COALESCE(NULLIF(btrim(t.title), ''), NULLIF(btrim(t.message), ''), 'Tease'),
  t.image_path,
  CASE WHEN t.image_path IS NOT NULL THEN 'image' ELSE NULL END,
  'tease',
  t.id,
  t.created_at
FROM public.teases t
JOIN public.conversations c ON c.topic = 'teases'
ON CONFLICT (id) DO NOTHING;

-- Tease beg / reply messages
INSERT INTO public.direct_messages (
  id, conversation_id, sender_id, content,
  attachment_type, attachment_id, created_at
)
SELECT
  tm.id,
  c.id,
  tm.author_id,
  tm.content,
  'tease',
  tm.tease_id,
  tm.created_at
FROM public.tease_messages tm
JOIN public.conversations c ON c.topic = 'teases'
WHERE tm.content IS NOT NULL AND btrim(tm.content) <> ''
ON CONFLICT (id) DO NOTHING;

-- Punishments
INSERT INTO public.direct_messages (
  id, conversation_id, sender_id, content,
  attachment_type, attachment_id, created_at
)
SELECT
  p.id,
  c.id,
  p.issued_by,
  COALESCE(NULLIF(btrim(p.title), ''), NULLIF(btrim(p.reason), ''), 'Punishment'),
  'punishment',
  p.id,
  p.created_at
FROM public.punishments p
JOIN public.conversations c ON c.topic = 'punishments'
ON CONFLICT (id) DO NOTHING;

-- Date timeline posts
INSERT INTO public.direct_messages (
  id, conversation_id, sender_id, content, media_path, media_type,
  attachment_type, attachment_id, created_at
)
SELECT
  dp.id,
  c.id,
  dp.author_id,
  COALESCE(NULLIF(btrim(dp.body), ''), 'Timeline post'),
  dp.file_path,
  CASE
    WHEN dp.media_kind IN ('image', 'video') THEN dp.media_kind
    WHEN dp.file_path IS NOT NULL THEN 'image'
    ELSE NULL
  END,
  'date',
  dp.date_id,
  dp.created_at
FROM public.date_posts dp
JOIN public.conversations c ON c.topic = 'dates'
ON CONFLICT (id) DO NOTHING;

-- Tasks (roots + any occurrence with real activity; skip empty recurring slots)
INSERT INTO public.direct_messages (
  id, conversation_id, sender_id, content,
  attachment_type, attachment_id, created_at
)
SELECT
  t.id,
  c.id,
  t.assigned_by,
  COALESCE(NULLIF(btrim(t.title), ''), 'Task'),
  'task',
  t.id,
  t.created_at
FROM public.tasks t
JOIN public.conversations c ON c.topic = 'tasks'
WHERE t.parent_task_id IS NULL
   OR t.status <> 'pending'
   OR EXISTS (SELECT 1 FROM public.submissions s WHERE s.task_id = t.id)
ON CONFLICT (id) DO NOTHING;

-- Submissions
INSERT INTO public.direct_messages (
  id, conversation_id, sender_id, content,
  attachment_type, attachment_id, created_at
)
SELECT
  s.id,
  c.id,
  s.submitted_by,
  COALESCE(NULLIF(btrim(s.submission_text), ''), 'Submission'),
  'submission',
  s.id,
  COALESCE(s.submitted_at, now())
FROM public.submissions s
JOIN public.conversations c ON c.topic = 'tasks'
ON CONFLICT (id) DO NOTHING;

-- Submission comments
INSERT INTO public.direct_messages (
  id, conversation_id, sender_id, content,
  attachment_type, attachment_id, created_at
)
SELECT
  cm.id,
  c.id,
  cm.commented_by,
  cm.content,
  'submission',
  cm.submission_id,
  cm.created_at
FROM public.comments cm
JOIN public.conversations c ON c.topic = 'tasks'
WHERE cm.content IS NOT NULL AND btrim(cm.content) <> ''
ON CONFLICT (id) DO NOTHING;

-- Rewards
INSERT INTO public.direct_messages (
  id, conversation_id, sender_id, content, media_path, media_type,
  attachment_type, attachment_id, created_at
)
SELECT
  r.id,
  c.id,
  r.sent_by,
  COALESCE(NULLIF(btrim(r.title), ''), NULLIF(btrim(r.message), ''), 'Reward'),
  r.image_path,
  CASE WHEN r.image_path IS NOT NULL THEN 'image' ELSE NULL END,
  'reward',
  r.id,
  r.created_at
FROM public.rewards r
JOIN public.conversations c ON c.topic = 'rewards'
ON CONFLICT (id) DO NOTHING;

-- Reward comments
INSERT INTO public.direct_messages (
  id, conversation_id, sender_id, content,
  attachment_type, attachment_id, created_at
)
SELECT
  rm.id,
  c.id,
  rm.author_id,
  rm.content,
  'reward',
  rm.reward_id,
  rm.created_at
FROM public.reward_messages rm
JOIN public.conversations c ON c.topic = 'rewards'
WHERE rm.content IS NOT NULL AND btrim(rm.content) <> ''
ON CONFLICT (id) DO NOTHING;

-- Requests (initial post)
INSERT INTO public.direct_messages (
  id, conversation_id, sender_id, content,
  attachment_type, attachment_id, created_at
)
SELECT
  r.id,
  c.id,
  r.requested_by,
  COALESCE(NULLIF(btrim(r.title), ''), NULLIF(btrim(r.message), ''), 'Request'),
  'request',
  r.id,
  r.created_at
FROM public.requests r
JOIN public.conversations c ON c.topic = 'requests'
ON CONFLICT (id) DO NOTHING;

-- Request thread messages
INSERT INTO public.direct_messages (
  id, conversation_id, sender_id, content,
  attachment_type, attachment_id, created_at
)
SELECT
  rm.id,
  c.id,
  rm.author_id,
  rm.content,
  'request',
  rm.request_id,
  rm.created_at
FROM public.request_messages rm
JOIN public.conversations c ON c.topic = 'requests'
WHERE rm.content IS NOT NULL AND btrim(rm.content) <> ''
ON CONFLICT (id) DO NOTHING;

-- Journal entries
INSERT INTO public.direct_messages (
  id, conversation_id, sender_id, content,
  attachment_type, attachment_id, created_at
)
SELECT
  j.id,
  c.id,
  j.author_id,
  COALESCE(NULLIF(btrim(j.body), ''), 'Journal entry'),
  'journal',
  j.id,
  j.created_at
FROM public.journal_entries j
JOIN public.conversations c ON c.topic = 'journal'
ON CONFLICT (id) DO NOTHING;

-- Journal comments
INSERT INTO public.direct_messages (
  id, conversation_id, sender_id, content,
  attachment_type, attachment_id, created_at
)
SELECT
  jc.id,
  c.id,
  jc.author_id,
  jc.content,
  'journal',
  jc.entry_id,
  jc.created_at
FROM public.journal_comments jc
JOIN public.conversations c ON c.topic = 'journal'
WHERE jc.content IS NOT NULL AND btrim(jc.content) <> ''
ON CONFLICT (id) DO NOTHING;
