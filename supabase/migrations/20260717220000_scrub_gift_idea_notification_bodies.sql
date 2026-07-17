-- Gift idea alerts must not leak item names to Queen (secret until Arrived/Reveal).

UPDATE public.notifications
SET body = 'D suggested a gift for you'
WHERE title = 'Gift idea on wishlist'
  AND body IS DISTINCT FROM 'D suggested a gift for you';
