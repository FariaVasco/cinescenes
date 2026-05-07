-- Store the device platform per player so turn-movie selection can filter
-- by the NEXT player's platform (not the current device's).
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS platform text CHECK (platform IN ('ios', 'android'));
