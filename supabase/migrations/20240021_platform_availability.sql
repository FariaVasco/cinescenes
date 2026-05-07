-- Per-platform trailer availability.
-- available_ios = false  → trailer has ads (iOS blocks them, Android does not)
-- available_android = false → trailer unavailable on Android for any reason
-- Both false → needs replacement (use scan_status = 'flagged' for those)
ALTER TABLE movies
  ADD COLUMN IF NOT EXISTS available_ios     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS available_android boolean NOT NULL DEFAULT true;
