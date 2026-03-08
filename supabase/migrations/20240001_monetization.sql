-- Monetization Phase 1+2: profiles, collections, movie pool flags, game mode columns

-- 1. User profiles
CREATE TABLE IF NOT EXISTS profiles (
  id                 uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_premium         boolean DEFAULT false,
  premium_expires_at timestamptz,
  trial_used_at      timestamptz,
  created_at         timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own profile"    ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Service role can update profiles" ON profiles FOR UPDATE USING (true);

-- 2. Movie pool flag + tags
ALTER TABLE movies ADD COLUMN IF NOT EXISTS standard_pool boolean DEFAULT false;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- Backfill: all currently active movies become the standard pool
UPDATE movies SET standard_pool = true WHERE active = true;

-- 3. Collections
CREATE TABLE IF NOT EXISTS collections (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  description     text,
  display_type    text DEFAULT 'theme',
  tag             text NOT NULL,
  cover_movie_id  uuid REFERENCES movies(id),
  is_active       boolean DEFAULT true
);

-- Seed initial collections
INSERT INTO collections (id, name, description, display_type, tag) VALUES
  ('christmas', 'Christmas Movies', 'Festive films for the holiday season', 'theme',  'christmas'),
  ('horror',    'Horror',           'Spine-chilling horror films',           'theme',  'horror'),
  ('era_2010s', 'The 2010s',        'Movies from 2010 to 2019',              'era',    'era_2010s')
ON CONFLICT (id) DO NOTHING;

-- Era tag backfill for existing movies
UPDATE movies
SET tags = array_append(COALESCE(tags, '{}'), 'era_2010s')
WHERE year BETWEEN 2010 AND 2019
  AND NOT (tags @> ARRAY['era_2010s']);

-- 4. Game mode columns
ALTER TABLE games ADD COLUMN IF NOT EXISTS game_mode text DEFAULT 'standard';
ALTER TABLE games ADD COLUMN IF NOT EXISTS collection_id text REFERENCES collections(id);
