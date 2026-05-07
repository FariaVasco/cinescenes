-- Add 'flagged' to scan_status: trailers that fail to load, show ads,
-- are age-restricted, or private — distinct from 'unusable' (no clean window).
ALTER TABLE movies
  DROP CONSTRAINT IF EXISTS movies_scan_status_check;

ALTER TABLE movies
  ADD CONSTRAINT movies_scan_status_check
  CHECK (scan_status IN ('validated', 'unvalidated', 'unusable', 'flagged'));
