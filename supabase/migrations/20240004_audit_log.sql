-- ============================================================
-- Audit log — tracks all INSERT / UPDATE / DELETE on key tables
-- Start with movies; add other tables by creating a trigger:
--   CREATE TRIGGER <table>_audit AFTER INSERT OR UPDATE OR DELETE
--   ON <table> FOR EACH ROW EXECUTE FUNCTION record_change();
-- ============================================================

-- 1. Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
  id          bigserial PRIMARY KEY,
  table_name  text        NOT NULL,
  operation   text        NOT NULL,           -- INSERT | UPDATE | DELETE
  changed_at  timestamptz NOT NULL DEFAULT now(),
  changed_by  text,                           -- auth user UUID, or NULL for service_role
  old_data    jsonb,                          -- full row before the change (NULL on INSERT)
  new_data    jsonb                           -- full row after the change  (NULL on DELETE)
);

-- Only allow reads; writes come exclusively from the trigger (SECURITY DEFINER)
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON audit_log USING (true);

-- 2. Trigger function (shared across all audited tables)
CREATE OR REPLACE FUNCTION record_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO audit_log (table_name, operation, changed_by, old_data, new_data)
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    auth.uid()::text,   -- NULL when called from service_role / scripts
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE row_to_json(OLD)::jsonb END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE row_to_json(NEW)::jsonb END
  );
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Attach to movies
CREATE TRIGGER movies_audit
AFTER INSERT OR UPDATE OR DELETE ON movies
FOR EACH ROW EXECUTE FUNCTION record_change();
