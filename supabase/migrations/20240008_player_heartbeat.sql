ALTER TABLE players ADD COLUMN IF NOT EXISTS last_seen timestamptz DEFAULT now();
