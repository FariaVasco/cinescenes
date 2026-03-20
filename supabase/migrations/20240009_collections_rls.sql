ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

-- Collections are read-only public catalog data.
-- Any authenticated or anonymous client can read; only service role can write.
CREATE POLICY "collections_read_all"
  ON collections
  FOR SELECT
  USING (true);
