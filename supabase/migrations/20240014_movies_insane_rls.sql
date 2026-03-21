-- Allow anon users to insert unvalidated movies (for Insane Mode live fetching)
CREATE POLICY "Anon can insert unvalidated insane-mode movies"
  ON movies FOR INSERT TO anon
  WITH CHECK (scan_status = 'unvalidated' AND standard_pool = false);
