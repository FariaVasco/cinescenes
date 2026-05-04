-- Soft-delete for players who leave a game mid-session.
-- A non-null left_at means the player is gone; rotation, timeline and player chips
-- must filter on left_at IS NULL.
alter table players
  add column if not exists left_at timestamptz;

-- Speeds up the per-game "active players" lookup the polling layer runs every 2s.
create index if not exists players_game_active_idx
  on players (game_id)
  where left_at is null;
