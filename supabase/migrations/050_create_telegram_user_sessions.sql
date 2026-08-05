-- Migration 050: Create telegram_user_sessions table for Phone Number MTProto logins

CREATE SCHEMA IF NOT EXISTS wacrm;
SET search_path TO wacrm, public, extensions;

-- 1. Create telegram_user_sessions table
CREATE TABLE IF NOT EXISTS wacrm.telegram_user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES wacrm.accounts(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  session_string TEXT NOT NULL,
  telegram_user_id TEXT,
  first_name TEXT,
  username TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for telegram_user_sessions
ALTER TABLE wacrm.telegram_user_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Account members can manage telegram_user_sessions" ON wacrm.telegram_user_sessions;
CREATE POLICY "Account members can manage telegram_user_sessions" ON wacrm.telegram_user_sessions
  FOR ALL USING (account_id IN (
    SELECT account_id FROM wacrm.profiles WHERE user_id = auth.uid()
  ));

-- Grant permissions for wacrm schema & table
GRANT USAGE ON SCHEMA wacrm TO anon, authenticated, service_role;
GRANT ALL ON TABLE wacrm.telegram_user_sessions TO anon, authenticated, service_role;

-- Expose view in public schema
CREATE OR REPLACE VIEW public.telegram_user_sessions AS SELECT * FROM wacrm.telegram_user_sessions;
GRANT ALL ON public.telegram_user_sessions TO anon, authenticated, service_role;

-- Notify PostgREST
NOTIFY pgrst, 'reload schema';
