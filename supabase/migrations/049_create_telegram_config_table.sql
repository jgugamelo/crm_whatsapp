-- Migration 049: Create telegram_config table and add channel support for conversations, messages and contacts

CREATE SCHEMA IF NOT EXISTS wacrm;
SET search_path TO wacrm, public, extensions;

-- 1. Create telegram_config table
CREATE TABLE IF NOT EXISTS wacrm.telegram_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES wacrm.accounts(id) ON DELETE CASCADE,
  bot_token TEXT NOT NULL,
  bot_username TEXT,
  bot_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for telegram_config
ALTER TABLE wacrm.telegram_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Account members can manage telegram_config" ON wacrm.telegram_config;
CREATE POLICY "Account members can manage telegram_config" ON wacrm.telegram_config
  FOR ALL USING (account_id IN (
    SELECT account_id FROM public.profiles WHERE user_id = auth.uid()
  ));

-- Expose view in public schema
CREATE OR REPLACE VIEW public.telegram_config AS SELECT * FROM wacrm.telegram_config;

-- 2. Ensure contacts support telegram columns
ALTER TABLE wacrm.contacts ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
ALTER TABLE wacrm.contacts ADD COLUMN IF NOT EXISTS telegram_username TEXT;

-- 3. Ensure conversations and messages support channel column
ALTER TABLE wacrm.conversations ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp';
ALTER TABLE wacrm.messages ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp';
ALTER TABLE wacrm.messages ADD COLUMN IF NOT EXISTS telegram_message_id TEXT;

-- Recreate public views if needed
CREATE OR REPLACE VIEW public.conversations AS SELECT * FROM wacrm.conversations;
CREATE OR REPLACE VIEW public.messages AS SELECT * FROM wacrm.messages;
CREATE OR REPLACE VIEW public.contacts AS SELECT * FROM wacrm.contacts;
