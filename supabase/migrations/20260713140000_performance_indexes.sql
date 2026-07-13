-- Hot-path indexes for smoother list/filter queries

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_deadline
  ON public.tasks (assigned_to, deadline);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status
  ON public.tasks (assigned_to, status);

CREATE INDEX IF NOT EXISTS idx_tasks_parent
  ON public.tasks (parent_task_id)
  WHERE parent_task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_submissions_by_user_time
  ON public.submissions (submitted_by, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_submissions_status_time
  ON public.submissions (status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_submission_media_submission
  ON public.submission_media (submission_id);

CREATE INDEX IF NOT EXISTS idx_teases_sent_to_created
  ON public.teases (sent_to, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tease_messages_tease
  ON public.tease_messages (tease_id, created_at);

CREATE INDEX IF NOT EXISTS idx_comments_submission
  ON public.comments (submission_id, created_at);

CREATE INDEX IF NOT EXISTS idx_voice_notes_entity
  ON public.voice_notes (entity_type, entity_id, created_at);

CREATE INDEX IF NOT EXISTS idx_punishments_issued_status
  ON public.punishments (issued_to, status);

CREATE INDEX IF NOT EXISTS idx_check_ins_assigned_status
  ON public.check_ins (assigned_to, status);

CREATE INDEX IF NOT EXISTS idx_rule_acks_user
  ON public.rule_acknowledgments (user_id, rule_id);

CREATE INDEX IF NOT EXISTS idx_direct_messages_conv_created
  ON public.direct_messages (conversation_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;
