-- Optional point charge recorded when Queen approves a petition

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS point_cost INTEGER;

NOTIFY pgrst, 'reload schema';
