ALTER TABLE challenges ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
