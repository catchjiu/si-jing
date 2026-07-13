-- Optional photo attachment on slave petitions
ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS image_path TEXT;
