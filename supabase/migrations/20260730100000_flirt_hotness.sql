-- Hotness level for flirt guys (0–100)
ALTER TABLE public.flirt_guys
  ADD COLUMN IF NOT EXISTS hotness_level INT NOT NULL DEFAULT 50
    CHECK (hotness_level BETWEEN 0 AND 100);
