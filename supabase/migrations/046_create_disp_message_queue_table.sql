-- Migration 046: Ensure disp_message_queue, campaigns, and disparador tables exist with correct schema

CREATE SCHEMA IF NOT EXISTS wacrm;
SET search_path TO wacrm, public, extensions;

-- 1. Ensure campaigns table exists
CREATE TABLE IF NOT EXISTS wacrm.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES wacrm.accounts(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  objetivo TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho',
  session_ids TEXT[] DEFAULT '{}',
  tags_filtro TEXT[] DEFAULT '{}',
  pipeline_id UUID REFERENCES wacrm.pipelines(id) ON DELETE SET NULL,
  stage_ids TEXT[] DEFAULT '{}',
  mensagens JSONB DEFAULT '[]',
  intervalo_min INTEGER DEFAULT 30,
  intervalo_max INTEGER DEFAULT 60,
  janela_inicio TIME DEFAULT '08:00',
  janela_fim TIME DEFAULT '18:00',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Ensure disp_message_queue table exists
CREATE TABLE IF NOT EXISTS wacrm.disp_message_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES wacrm.accounts(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES wacrm.campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES wacrm.contacts(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  mensagem_final TEXT,
  status TEXT NOT NULL DEFAULT 'agendado',
  tipo TEXT NOT NULL DEFAULT 'texto',
  media_url TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  wamid TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Ensure campaign_metrics table exists
CREATE TABLE IF NOT EXISTS wacrm.campaign_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID UNIQUE REFERENCES wacrm.campaigns(id) ON DELETE CASCADE,
  total_contatos INTEGER DEFAULT 0,
  total_enviados INTEGER DEFAULT 0,
  total_erros INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Enable RLS and create policies for disp_message_queue
ALTER TABLE wacrm.disp_message_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE wacrm.campaign_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS disp_message_queue_select ON wacrm.disp_message_queue;
DROP POLICY IF EXISTS disp_message_queue_insert ON wacrm.disp_message_queue;
DROP POLICY IF EXISTS disp_message_queue_update ON wacrm.disp_message_queue;
DROP POLICY IF EXISTS disp_message_queue_delete ON wacrm.disp_message_queue;

CREATE POLICY disp_message_queue_select ON wacrm.disp_message_queue FOR SELECT USING (wacrm.is_account_member(account_id));
CREATE POLICY disp_message_queue_insert ON wacrm.disp_message_queue FOR INSERT WITH CHECK (wacrm.is_account_member(account_id, 'agent'));
CREATE POLICY disp_message_queue_update ON wacrm.disp_message_queue FOR UPDATE USING (wacrm.is_account_member(account_id, 'agent'));
CREATE POLICY disp_message_queue_delete ON wacrm.disp_message_queue FOR DELETE USING (wacrm.is_account_member(account_id, 'agent'));

GRANT ALL ON ALL TABLES IN SCHEMA wacrm TO anon, authenticated, service_role;
