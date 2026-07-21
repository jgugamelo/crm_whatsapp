-- ============================================================
-- WAHA Proxy configuration
--
-- What this migration adds:
--
--   1. `proxy_enabled` - boolean flag to enable/disable proxy for the session
--   2. `proxy_server` - host:port proxy server address
--   3. `proxy_username` - username for proxy auth (optional)
--   4. `proxy_password` - password for proxy auth (optional)
-- ============================================================

ALTER TABLE wacrm.whatsapp_config 
  ADD COLUMN IF NOT EXISTS proxy_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS proxy_server TEXT,
  ADD COLUMN IF NOT EXISTS proxy_username TEXT,
  ADD COLUMN IF NOT EXISTS proxy_password TEXT;

-- Re-grant schema permissions to roles so the new columns are queryable
GRANT ALL ON ALL TABLES IN SCHEMA wacrm TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA wacrm TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA wacrm TO anon, authenticated, service_role;
