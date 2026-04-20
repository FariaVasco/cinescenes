-- Guarantee at most one live (non-complete) turn per game.
-- Phantom starting-card rows use status='complete' and are excluded, so the
-- partial index only constrains real turns. A duplicate handleNextTurn insert
-- now fails with 23505 instead of quietly creating a phantom successor that
-- flips the turn order.

-- First, reconcile any existing duplicates from past bugged sessions: for each
-- game, keep only the newest non-complete turn and mark older ones 'complete'.
UPDATE public.turns t
SET status = 'complete'
WHERE status <> 'complete'
  AND EXISTS (
    SELECT 1
    FROM public.turns t2
    WHERE t2.game_id = t.game_id
      AND t2.status <> 'complete'
      AND t2.created_at > t.created_at
  );

CREATE UNIQUE INDEX IF NOT EXISTS turns_one_live_per_game_idx
  ON public.turns (game_id)
  WHERE status <> 'complete';
