ALTER TABLE games
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'invite_only'
  CHECK (visibility IN ('public', 'invite_only'));
