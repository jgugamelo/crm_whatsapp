-- ============================================================
-- WhatsSmart Sender — Schema Inicial
-- Execute no Supabase SQL Editor (em ordem)
-- ============================================================

-- Extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- USERS (espelha auth.users do Supabase)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'operador' CHECK (role IN ('admin', 'gestor', 'operador')),
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- WHATSAPP SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome_sessao TEXT NOT NULL UNIQUE,
  telefone TEXT,
  status TEXT NOT NULL DEFAULT 'desconectada'
    CHECK (status IN ('conectada','desconectada','aguardando_qrcode','instavel','bloqueada','pausada','erro')),
  limite_diario INTEGER NOT NULL DEFAULT 50,
  envios_hoje INTEGER NOT NULL DEFAULT 0,
  ultimo_envio_em TIMESTAMPTZ,
  modo_aquecimento BOOLEAN DEFAULT FALSE,
  dia_aquecimento INTEGER DEFAULT 1,
  nivel_risco TEXT DEFAULT 'baixo' CHECK (nivel_risco IN ('baixo','medio','alto')),
  waha_session_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CONTACTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT,
  telefone TEXT NOT NULL,
  telefone_normalizado TEXT,
  email TEXT,
  origem TEXT,
  tipo_base TEXT,
  nivel_risco TEXT DEFAULT 'medio' CHECK (nivel_risco IN ('baixo','medio','alto')),
  tags JSONB DEFAULT '[]',
  status_contato TEXT NOT NULL DEFAULT 'novo'
    CHECK (status_contato IN ('novo','apto_para_envio','em_campanha','respondeu','interessado','sem_interesse','removido','bloqueado','numero_invalido','risco_alto','convertido')),
  ultimo_envio_em TIMESTAMPTZ,
  ultima_resposta_em TIMESTAMPTZ,
  quantidade_envios INTEGER DEFAULT 0,
  quantidade_respostas INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS contacts_telefone_normalizado_idx ON public.contacts(telefone_normalizado);
CREATE INDEX IF NOT EXISTS contacts_status_idx ON public.contacts(status_contato);
CREATE INDEX IF NOT EXISTS contacts_nivel_risco_idx ON public.contacts(nivel_risco);

-- ============================================================
-- BLACKLIST
-- ============================================================
CREATE TABLE IF NOT EXISTS public.blacklist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telefone TEXT NOT NULL UNIQUE,
  motivo TEXT NOT NULL CHECK (motivo IN ('opt_out','bloqueio_manual','numero_invalido','reclamacao','risco_juridico','resposta_negativa')),
  campaign_id UUID,
  mensagem_detectada TEXT,
  data_bloqueio TIMESTAMPTZ DEFAULT NOW(),
  bloqueado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS blacklist_telefone_idx ON public.blacklist(telefone);

-- ============================================================
-- CAMPAIGNS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  descricao TEXT,
  objetivo TEXT,
  mensagem_base TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','aguardando_aprovacao','aprovada','em_execucao','pausada','encerrada','bloqueada_por_risco','erro')),
  nivel_risco TEXT DEFAULT 'medio' CHECK (nivel_risco IN ('baixo','medio','alto')),
  session_id UUID REFERENCES public.whatsapp_sessions(id),
  limite_diario INTEGER DEFAULT 50,
  limite_por_hora INTEGER DEFAULT 10,
  intervalo_min_segundos INTEGER DEFAULT 90,
  intervalo_max_segundos INTEGER DEFAULT 300,
  janela_inicio TIME DEFAULT '08:00',
  janela_fim TIME DEFAULT '18:00',
  dias_permitidos JSONB DEFAULT '[1,2,3,4,5,6]',
  max_followups INTEGER DEFAULT 2,
  score_risco NUMERIC DEFAULT 0,
  tom TEXT DEFAULT 'consultivo'
    CHECK (tom IN ('consultivo','comercial_leve','educacional','institucional','amigavel','objetivo','reativacao','followup')),
  created_by UUID REFERENCES public.users(id),
  approved_by UUID REFERENCES public.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS campaigns_status_idx ON public.campaigns(status);
CREATE INDEX IF NOT EXISTS campaigns_session_idx ON public.campaigns(session_id);

-- ============================================================
-- CAMPAIGN_CONTACTS (contatos vinculados à campanha)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.campaign_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pendente'
    CHECK (status IN ('pendente','agendado','enviado','respondeu','interessado','sem_interesse','convertido','removido','erro')),
  followup_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, contact_id)
);

CREATE INDEX IF NOT EXISTS campaign_contacts_campaign_idx ON public.campaign_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS campaign_contacts_contact_idx ON public.campaign_contacts(contact_id);

-- ============================================================
-- MESSAGE VARIATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.message_variations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  mensagem TEXT NOT NULL,
  tipo TEXT DEFAULT 'variacao' CHECK (tipo IN ('base','variacao','followup')),
  tom TEXT,
  aprovada BOOLEAN DEFAULT FALSE,
  score_qualidade NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS message_variations_campaign_idx ON public.message_variations(campaign_id);
CREATE INDEX IF NOT EXISTS message_variations_aprovada_idx ON public.message_variations(aprovada);

-- ============================================================
-- MESSAGE QUEUE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.message_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id),
  contact_id UUID NOT NULL REFERENCES public.contacts(id),
  session_id UUID NOT NULL REFERENCES public.whatsapp_sessions(id),
  mensagem_final TEXT NOT NULL,
  variation_id UUID REFERENCES public.message_variations(id),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','agendado','enviando','enviado','respondido','erro','cancelado','bloqueado','pausado')),
  erro TEXT,
  tentativas INTEGER DEFAULT 0,
  tipo TEXT DEFAULT 'inicial' CHECK (tipo IN ('inicial','followup_1','followup_2')),
  waha_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS message_queue_status_idx ON public.message_queue(status);
CREATE INDEX IF NOT EXISTS message_queue_campaign_idx ON public.message_queue(campaign_id);
CREATE INDEX IF NOT EXISTS message_queue_scheduled_idx ON public.message_queue(scheduled_at);
CREATE INDEX IF NOT EXISTS message_queue_contact_idx ON public.message_queue(contact_id);

-- ============================================================
-- MESSAGE LOGS (histórico imutável)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.message_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  queue_id UUID REFERENCES public.message_queue(id),
  campaign_id UUID REFERENCES public.campaigns(id),
  contact_id UUID REFERENCES public.contacts(id),
  session_id UUID REFERENCES public.whatsapp_sessions(id),
  direcao TEXT NOT NULL CHECK (direcao IN ('saida','entrada')),
  mensagem TEXT NOT NULL,
  status TEXT,
  waha_message_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS message_logs_contact_idx ON public.message_logs(contact_id);
CREATE INDEX IF NOT EXISTS message_logs_campaign_idx ON public.message_logs(campaign_id);
CREATE INDEX IF NOT EXISTS message_logs_created_idx ON public.message_logs(created_at DESC);

-- ============================================================
-- INCOMING MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.incoming_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES public.whatsapp_sessions(id),
  contact_id UUID REFERENCES public.contacts(id),
  campaign_id UUID REFERENCES public.campaigns(id),
  telefone TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  waha_message_id TEXT,
  classificacao TEXT,
  confianca NUMERIC,
  resumo_ia TEXT,
  acao_recomendada TEXT,
  processado BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS incoming_messages_contact_idx ON public.incoming_messages(contact_id);
CREATE INDEX IF NOT EXISTS incoming_messages_session_idx ON public.incoming_messages(session_id);
CREATE INDEX IF NOT EXISTS incoming_messages_processado_idx ON public.incoming_messages(processado);

-- ============================================================
-- OPTOUT RECORDS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.optout_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telefone TEXT NOT NULL,
  contact_id UUID REFERENCES public.contacts(id),
  campaign_id UUID REFERENCES public.campaigns(id),
  mensagem_detectada TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RISK EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.risk_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo TEXT NOT NULL,
  nivel TEXT NOT NULL CHECK (nivel IN ('baixo','medio','alto','critico')),
  campaign_id UUID REFERENCES public.campaigns(id),
  session_id UUID REFERENCES public.whatsapp_sessions(id),
  descricao TEXT,
  acao_tomada TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS risk_events_campaign_idx ON public.risk_events(campaign_id);
CREATE INDEX IF NOT EXISTS risk_events_session_idx ON public.risk_events(session_id);

-- ============================================================
-- AI GENERATION LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_generation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo TEXT NOT NULL CHECK (tipo IN ('variacao','classificacao','sugestao_resposta')),
  campaign_id UUID REFERENCES public.campaigns(id),
  contact_id UUID REFERENCES public.contacts(id),
  prompt TEXT,
  resposta TEXT,
  modelo TEXT,
  tokens_prompt INTEGER,
  tokens_resposta INTEGER,
  custo_estimado NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DAILY LIMITS (controle de envios por dia/sessão)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.daily_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES public.whatsapp_sessions(id),
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  total_enviados INTEGER DEFAULT 0,
  total_erros INTEGER DEFAULT 0,
  total_optout INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, data)
);

-- ============================================================
-- CAMPAIGN METRICS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.campaign_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  total_contatos INTEGER DEFAULT 0,
  total_enviados INTEGER DEFAULT 0,
  total_erros INTEGER DEFAULT 0,
  total_respostas INTEGER DEFAULT 0,
  total_interessados INTEGER DEFAULT 0,
  total_sem_interesse INTEGER DEFAULT 0,
  total_optout INTEGER DEFAULT 0,
  total_convertidos INTEGER DEFAULT 0,
  taxa_resposta NUMERIC DEFAULT 0,
  taxa_interesse NUMERIC DEFAULT 0,
  taxa_optout NUMERIC DEFAULT 0,
  taxa_erro NUMERIC DEFAULT 0,
  score_risco NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id)
);

-- ============================================================
-- ATTENDANCE CARDS (atendimento humano)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.attendance_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id),
  campaign_id UUID REFERENCES public.campaigns(id),
  session_id UUID REFERENCES public.whatsapp_sessions(id),
  assigned_to UUID REFERENCES public.users(id),
  status TEXT NOT NULL DEFAULT 'novo'
    CHECK (status IN ('novo','aguardando_vendedor','em_atendimento','aguardando_cliente','concluido','perdido','convertido')),
  resumo_ia TEXT,
  resultado TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS attendance_cards_status_idx ON public.attendance_cards(status);
CREATE INDEX IF NOT EXISTS attendance_cards_assigned_idx ON public.attendance_cards(assigned_to);

-- ============================================================
-- TRIGGERS: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','whatsapp_sessions','contacts','campaigns',
    'campaign_contacts','message_queue','attendance_cards','daily_limits'
  ] LOOP
    EXECUTE format('
      CREATE TRIGGER trigger_updated_at_%s
      BEFORE UPDATE ON public.%s
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    ', t, t);
  END LOOP;
END;
$$;

-- ============================================================
-- RLS: habilitar em todas as tabelas
-- ============================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incoming_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.optout_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_cards ENABLE ROW LEVEL SECURITY;

-- Política básica: usuários autenticados têm acesso (o backend usa service_role e bypassa RLS)
CREATE POLICY "authenticated_full_access" ON public.users
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
