CREATE TABLE IF NOT EXISTS app_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  min_version_ios text NOT NULL DEFAULT '1.0.0',
  min_version_android text NOT NULL DEFAULT '1.0.0'
);

INSERT INTO app_config (id, min_version_ios, min_version_android)
VALUES (1, '1.0.0', '1.0.0')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_config is publicly readable"
  ON app_config FOR SELECT USING (true);
