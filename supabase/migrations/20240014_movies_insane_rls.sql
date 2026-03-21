-- Allow authenticated (and anon) users to insert unvalidated movies (for Insane Mode live fetching)
DROP POLICY IF EXISTS "Anon can insert unvalidated insane-mode movies" ON movies;
DROP POLICY IF EXISTS "Anon can insert insane movies" ON movies;
CREATE POLICY "Users can insert insane movies"
  ON movies FOR INSERT TO anon, authenticated
  WITH CHECK (true);
