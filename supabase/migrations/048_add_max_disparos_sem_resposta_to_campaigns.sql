-- Migration 048: Adicionar coluna max_disparos_sem_resposta e recriar view publica
ALTER TABLE wacrm.campaigns 
ADD COLUMN IF NOT EXISTS max_disparos_sem_resposta INTEGER DEFAULT 3;

-- Recriar view publica para incluir a nova coluna
CREATE OR REPLACE VIEW public.campaigns AS SELECT * FROM wacrm.campaigns;
GRANT ALL ON public.campaigns TO anon, authenticated, service_role;

-- Notificar PostgREST para atualizar o cache de schema
NOTIFY pgrst, 'reload schema';
