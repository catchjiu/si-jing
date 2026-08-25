-- Dual-voice Listen script (plain text), separate from reading HTML body.

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS listen_script TEXT;

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS listen_body_hash TEXT;

COMMENT ON COLUMN public.stories.listen_script IS
  'Plain-text dual-voice script for Fish Audio (Queen:/Slave: lines). Not shown in the reader.';

COMMENT ON COLUMN public.stories.listen_body_hash IS
  'Hash of title+body used to build listen_script; regenerate when stale.';

NOTIFY pgrst, 'reload schema';
