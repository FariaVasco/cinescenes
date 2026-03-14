-- Track which player won the card for each turn.
-- Used to reconstruct accurate movie→year mappings per player
-- (avoids same-year collisions when multiple movies share a year).
ALTER TABLE turns ADD COLUMN IF NOT EXISTS winner_id uuid REFERENCES players(id);
