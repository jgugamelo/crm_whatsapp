-- Migration 045: Fix RLS policies for wacrm.campaigns and wacrm.campaign_dispatches

CREATE SCHEMA IF NOT EXISTS wacrm;
SET search_path TO wacrm, public, extensions;

-- Enable RLS on campaigns
ALTER TABLE wacrm.campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaigns_select ON wacrm.campaigns;
DROP POLICY IF EXISTS campaigns_insert ON wacrm.campaigns;
DROP POLICY IF EXISTS campaigns_update ON wacrm.campaigns;
DROP POLICY IF EXISTS campaigns_delete ON wacrm.campaigns;

CREATE POLICY campaigns_select ON wacrm.campaigns FOR SELECT USING (wacrm.is_account_member(account_id));
CREATE POLICY campaigns_insert ON wacrm.campaigns FOR INSERT WITH CHECK (wacrm.is_account_member(account_id, 'agent'));
CREATE POLICY campaigns_update ON wacrm.campaigns FOR UPDATE USING (wacrm.is_account_member(account_id, 'agent'));
CREATE POLICY campaigns_delete ON wacrm.campaigns FOR DELETE USING (wacrm.is_account_member(account_id, 'agent'));

-- Enable RLS on campaign_dispatches if table exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'wacrm' AND tablename = 'campaign_dispatches') THEN
    EXECUTE 'ALTER TABLE wacrm.campaign_dispatches ENABLE ROW LEVEL SECURITY;';

    EXECUTE 'DROP POLICY IF EXISTS campaign_dispatches_select ON wacrm.campaign_dispatches;';
    EXECUTE 'DROP POLICY IF EXISTS campaign_dispatches_insert ON wacrm.campaign_dispatches;';
    EXECUTE 'DROP POLICY IF EXISTS campaign_dispatches_update ON wacrm.campaign_dispatches;';
    EXECUTE 'DROP POLICY IF EXISTS campaign_dispatches_delete ON wacrm.campaign_dispatches;';

    EXECUTE 'CREATE POLICY campaign_dispatches_select ON wacrm.campaign_dispatches FOR SELECT USING (wacrm.is_account_member(account_id));';
    EXECUTE 'CREATE POLICY campaign_dispatches_insert ON wacrm.campaign_dispatches FOR INSERT WITH CHECK (wacrm.is_account_member(account_id, ''agent''));';
    EXECUTE 'CREATE POLICY campaign_dispatches_update ON wacrm.campaign_dispatches FOR UPDATE USING (wacrm.is_account_member(account_id, ''agent''));';
    EXECUTE 'CREATE POLICY campaign_dispatches_delete ON wacrm.campaign_dispatches FOR DELETE USING (wacrm.is_account_member(account_id, ''agent''));';
  END IF;
END $$;

-- Re-grant full privileges to authenticated and service_role
GRANT ALL ON TABLE wacrm.campaigns TO authenticated, service_role;
