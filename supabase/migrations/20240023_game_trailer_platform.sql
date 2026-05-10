-- Capture the most restrictive trailer platform for a game at start time.
-- Local: host's device OS (only their phone plays the trailer).
-- Online: 'android' if any player is on Android, 'ios' otherwise
--         (everyone watches the trailer to decide whether to challenge).
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS trailer_platform text
  CHECK (trailer_platform IN ('ios', 'android'));
