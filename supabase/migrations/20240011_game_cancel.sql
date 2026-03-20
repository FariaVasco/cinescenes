-- Add 'cancelled' to games status constraint
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.games'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    EXECUTE 'ALTER TABLE public.games DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.games
  ADD CONSTRAINT games_status_check
  CHECK (status IN ('lobby', 'active', 'finished', 'cancelled'));

-- Auto-cancel lobby games older than 10 minutes (requires pg_cron extension).
-- Enable it first: Supabase Dashboard → Database → Extensions → pg_cron → Enable.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'cancel-stale-lobby-games',
  '* * * * *',
  $$
    UPDATE public.games
    SET status = 'cancelled'
    WHERE status = 'lobby'
      AND created_at < NOW() - INTERVAL '10 minutes';
  $$
);
