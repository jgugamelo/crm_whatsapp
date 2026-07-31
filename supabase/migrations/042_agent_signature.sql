-- Migration 042: Agent signature setting (identify agent name in WhatsApp messages)
-- Adds `include_agent_name` to profiles table so agents/consultants can toggle
-- automatic signature prefixing on outbound WhatsApp messages (e.g. "*Diego:* Olá!").

ALTER TABLE IF EXISTS wacrm.profiles 
  ADD COLUMN IF NOT EXISTS include_agent_name BOOLEAN DEFAULT false;

ALTER TABLE IF EXISTS public.profiles 
  ADD COLUMN IF NOT EXISTS include_agent_name BOOLEAN DEFAULT false;
