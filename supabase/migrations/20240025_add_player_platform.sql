ALTER TABLE players ADD COLUMN IF NOT EXISTS platform text CHECK (platform IN ('ios', 'android'));
