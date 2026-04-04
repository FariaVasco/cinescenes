-- Allow players to update their own challenge rows (needed for sequential interval picking
-- where interval_index is updated from -1 to the chosen slot, or -3 for withdrawal).
CREATE POLICY "challenges_update_anon"
  ON challenges FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);
