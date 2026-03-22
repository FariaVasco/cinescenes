-- Add tmdb_id to movies for deduplication in Insane Mode
ALTER TABLE movies ADD COLUMN IF NOT EXISTS tmdb_id integer;

-- Partial unique index: NULLs are allowed (legacy rows), non-NULLs must be unique
CREATE UNIQUE INDEX IF NOT EXISTS movies_tmdb_id_unique
  ON movies (tmdb_id)
  WHERE tmdb_id IS NOT NULL;
