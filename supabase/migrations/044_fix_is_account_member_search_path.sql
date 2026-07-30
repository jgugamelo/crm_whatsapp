-- Migration 044: Fix is_account_member search_path & RLS Evaluation for wacrm Schema

-- Ensure type exists in wacrm schema for backwards compatibility
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t 
    JOIN pg_namespace n ON n.oid = t.typnamespace 
    WHERE t.typname = 'account_role_enum' AND n.nspname = 'wacrm'
  ) THEN
    CREATE TYPE wacrm.account_role_enum AS ENUM ('owner', 'admin', 'agent', 'viewer');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION wacrm.is_account_member(
  target_account_id UUID,
  min_role TEXT DEFAULT 'viewer'
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = wacrm, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM wacrm.profiles p
    WHERE p.user_id = auth.uid()
      AND p.account_id = target_account_id
      AND CASE p.account_role::text
            WHEN 'owner'  THEN 4
            WHEN 'admin'  THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
            ELSE 0
          END
        >=
          CASE min_role
            WHEN 'owner'  THEN 4
            WHEN 'admin'  THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
            ELSE 1
          END
  );
$$;

ALTER FUNCTION wacrm.is_account_member(UUID, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION wacrm.is_account_member(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_account_member(
  target_account_id UUID,
  min_role TEXT DEFAULT 'viewer'
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = wacrm, public
AS $$
  SELECT wacrm.is_account_member(target_account_id, min_role);
$$;

ALTER FUNCTION public.is_account_member(UUID, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_account_member(UUID, TEXT) TO authenticated, service_role;
