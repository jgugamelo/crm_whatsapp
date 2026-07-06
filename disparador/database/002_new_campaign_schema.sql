-- ============================================================
-- Migração 002: Novo schema de campanhas e fila
-- Execute no Supabase SQL Editor
-- EXECUTE TUDO DE UMA VEZ (selecione tudo e clique em Run)
-- ============================================================

-- 1. Campanhas: tornar mensagem_base opcional
ALTER TABLE public.campaigns
  ALTER COLUMN mensagem_base DROP NOT NULL;

-- 2. Campanhas: adicionar colunas do novo formato
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS session_ids  UUID[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tags_filtro  TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS intervalo_min INTEGER DEFAULT 90,
  ADD COLUMN IF NOT EXISTS intervalo_max INTEGER DEFAULT 300,
  ADD COLUMN IF NOT EXISTS mensagens    JSONB   DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS agendamento  TIMESTAMPTZ;

-- 3. Fila de mensagens: adicionar colunas de mídia
ALTER TABLE public.message_queue
  ADD COLUMN IF NOT EXISTS media_url TEXT;

-- 4. Fila de mensagens: expandir constraint de tipo para suportar todos os tipos
ALTER TABLE public.message_queue
  DROP CONSTRAINT IF EXISTS message_queue_tipo_check;

ALTER TABLE public.message_queue
  ADD CONSTRAINT message_queue_tipo_check
  CHECK (tipo IN ('inicial','followup_1','followup_2','texto','imagem','video','audio','arquivo','ia'));

-- 5. Fila de mensagens: adicionar ON DELETE CASCADE na FK campaigns
--    (necessário para deletar campanhas sem erro)
ALTER TABLE public.message_queue
  DROP CONSTRAINT IF EXISTS message_queue_campaign_id_fkey;

ALTER TABLE public.message_queue
  ADD CONSTRAINT message_queue_campaign_id_fkey
  FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

-- 6. Contatos: adicionar colunas de tags e campos de variáveis
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS tags      TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS curso     TEXT,
  ADD COLUMN IF NOT EXISTS categoria TEXT;

-- 7. Campanhas: mudar janela padrão para 24h (evitar bloqueio por horário)
ALTER TABLE public.campaigns
  ALTER COLUMN janela_inicio SET DEFAULT '00:00',
  ALTER COLUMN janela_fim    SET DEFAULT '23:59';

-- Atualizar campanhas existentes que usam a janela restritiva padrão antiga
UPDATE public.campaigns
SET janela_inicio = '00:00', janela_fim = '23:59'
WHERE janela_inicio = '08:00' OR janela_fim = '18:00';

-- 8. Storage bucket para mídias
--    (faça isso no Supabase Dashboard → Storage → New Bucket)
--    Bucket name: media | Public: true

-- ── Verificação ───────────────────────────────────────────────
SELECT 'campaigns' as tabela, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'campaigns'
  AND column_name IN ('session_ids','tags_filtro','intervalo_min','intervalo_max','mensagens','agendamento')
UNION ALL
SELECT 'message_queue', column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'message_queue'
  AND column_name IN ('media_url')
UNION ALL
SELECT 'contacts', column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'contacts'
  AND column_name IN ('tags','curso','categoria')
ORDER BY 1, 2;
