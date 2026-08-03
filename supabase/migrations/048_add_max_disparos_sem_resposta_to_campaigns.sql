-- Migration 048: Adicionar coluna max_disparos_sem_resposta para filtro anti-ban na tabela campaigns
ALTER TABLE wacrm.campaigns 
ADD COLUMN IF NOT EXISTS max_disparos_sem_resposta INTEGER DEFAULT 3;

-- Atualizar schema público caso haja views
DO $$ 
BEGIN 
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaigns') THEN
    ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS max_disparos_sem_resposta INTEGER DEFAULT 3;
  END IF;
END $$;

-- Recarregar cache de schema do PostgREST / Supabase
NOTIFY pgrst, 'reload schema';
