-- Six protocol features (applied remotely as migration six_protocol_features)

ALTER TABLE public.punishments DROP CONSTRAINT IF EXISTS punishments_status_check;
ALTER TABLE public.punishments ADD CONSTRAINT punishments_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'completed'::text, 'lifted'::text]));

ALTER TABLE public.voice_notes DROP CONSTRAINT IF EXISTS voice_notes_entity_type_check;
ALTER TABLE public.voice_notes ADD CONSTRAINT voice_notes_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'task'::text, 'submission'::text, 'request'::text, 'comment'::text,
    'reward'::text, 'punishment'::text, 'check_in'::text, 'tease'::text, 'ritual'::text
  ]));

-- Tables: rules, rule_acknowledgments, check_ins, teases, rituals, ritual_occurrences
-- RPCs: open_due_check_ins, flag_missed_check_ins, ensure_ritual_occurrences,
--        flag_missed_rituals, ritual_streak
-- Storage: teases bucket
-- See live Supabase project for full RLS + function bodies.
