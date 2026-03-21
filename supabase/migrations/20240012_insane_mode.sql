-- Add scan_status to movies
ALTER TABLE movies
  ADD COLUMN IF NOT EXISTS scan_status text NOT NULL DEFAULT 'validated'
  CHECK (scan_status IN ('validated', 'unvalidated', 'unusable'));

-- Back-fill: existing movies with no safe_start are effectively unvalidated
UPDATE movies SET scan_status = 'unvalidated' WHERE safe_start IS NULL;

-- Extend game_mode constraint to include 'insane'
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_game_mode_check;
ALTER TABLE games
  ADD CONSTRAINT games_game_mode_check
  CHECK (game_mode IN ('standard', 'collection', 'insane'));
