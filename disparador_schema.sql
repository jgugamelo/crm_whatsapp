-- ============================================================
-- WhatsSmart Sender - Tabelas do Disparador para o CRM (Esquema wacrm)
-- Execute este arquivo no SQL Editor do Supabase DEPOIS de rodar o all_migrations.sql
-- ============================================================

-- 1. Tabela de Campanhas
CREATE TABLE IF NOT EXISTS wacrm.campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  descricao TEXT,
  objetivo TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho',
  nivel_risco TEXT DEFAULT 'medio',
  limite_diario INTEGER DEFAULT 50,
  limite_por_hora INTEGER DEFAULT 10,
  intervalo_min_segundos INTEGER DEFAULT 90,
  intervalo_max_segundos INTEGER DEFAULT 300,
  janela_inicio TIME DEFAULT '00:00',
  janela_fim TIME DEFAULT '23:59',
  dias_permitidos JSONB DEFAULT '[1,2,3,4,5,6]',
  max_followups INTEGER DEFAULT 2,
  score_risco NUMERIC DEFAULT 0,
  tom TEXT DEFAULT 'consultivo',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  session_ids UUID[] DEFAULT '{}',
  tags_filtro TEXT[] DEFAULT '{}',
  intervalo_min INTEGER DEFAULT 90,
  intervalo_max INTEGER DEFAULT 300,
  mensagens JSONB DEFAULT '[]',
  agendamento TIMESTAMPTZ
);

-- 2. Tabela de Blacklist
CREATE TABLE IF NOT EXISTS wacrm.blacklist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telefone TEXT NOT NULL UNIQUE,
  motivo TEXT NOT NULL,
  campaign_id UUID,
  mensagem_detectada TEXT,
  data_bloqueio TIMESTAMPTZ DEFAULT NOW(),
  bloqueado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Fila de mensagens do disparador (disp_message_queue)
CREATE TABLE IF NOT EXISTS wacrm.disp_message_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES wacrm.campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES wacrm.contacts(id) ON DELETE CASCADE,
  session_id UUID REFERENCES wacrm.whatsapp_config(id) ON DELETE SET NULL,
  mensagem_final TEXT NOT NULL,
  variation_id UUID,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'agendado',
  erro TEXT,
  tentativas INTEGER DEFAULT 0,
  tipo TEXT NOT NULL DEFAULT 'texto',
  waha_message_id TEXT,
  media_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Métricas das Campanhas
CREATE TABLE IF NOT EXISTS wacrm.campaign_metrics (
  campaign_id UUID PRIMARY KEY REFERENCES wacrm.campaigns(id) ON DELETE CASCADE,
  total_contatos INTEGER DEFAULT 0,
  total_enviados INTEGER DEFAULT 0,
  total_entregues INTEGER DEFAULT 0,
  total_lidos INTEGER DEFAULT 0,
  total_respostas INTEGER DEFAULT 0,
  total_blacklist INTEGER DEFAULT 0,
  total_erros INTEGER DEFAULT 0,
  tempo_medio_resposta INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Desativar RLS nas tabelas do disparador para compatibilidade
ALTER TABLE wacrm.campaigns DISABLE ROW LEVEL SECURITY;
ALTER TABLE wacrm.blacklist DISABLE ROW LEVEL SECURITY;
ALTER TABLE wacrm.disp_message_queue DISABLE ROW LEVEL SECURITY;
ALTER TABLE wacrm.campaign_metrics DISABLE ROW LEVEL SECURITY;

-- 6. Função de incremento de métricas
CREATE OR REPLACE FUNCTION wacrm.increment_campaign_metric(p_campaign_id UUID, p_field TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE format('
    INSERT INTO wacrm.campaign_metrics (campaign_id, %I)
    VALUES ($1, 1)
    ON CONFLICT (campaign_id)
    DO UPDATE SET %I = COALESCE(wacrm.campaign_metrics.%I, 0) + 1, updated_at = NOW()', p_field, p_field, p_field)
  USING p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Atualizar cache do Supabase
NOTIFY pgrst, 'reload schema';
