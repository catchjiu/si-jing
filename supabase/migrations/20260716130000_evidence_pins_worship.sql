-- Allow pinning worship comment photos into Evidence

ALTER TABLE public.evidence_pins
  DROP CONSTRAINT IF EXISTS evidence_pins_source_type_check;

ALTER TABLE public.evidence_pins
  ADD CONSTRAINT evidence_pins_source_type_check
  CHECK (
    source_type IN (
      'date',
      'tease',
      'voice_note',
      'date_post',
      'direct_message',
      'worship_message',
      'worship_gallery_message'
    )
  );

ALTER TABLE public.evidence_pins
  DROP CONSTRAINT IF EXISTS evidence_pins_storage_bucket_check;

ALTER TABLE public.evidence_pins
  ADD CONSTRAINT evidence_pins_storage_bucket_check
  CHECK (
    storage_bucket IS NULL
    OR storage_bucket IN (
      'teases',
      'voice',
      'submissions',
      'date_posts',
      'messages',
      'worship'
    )
  );
