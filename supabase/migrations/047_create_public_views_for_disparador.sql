-- Migration 047: Create public views and public tables for campaigns and disp_message_queue
-- Fixes PostgREST 404 (Not Found) errors when querying without Accept-Profile: wacrm

CREATE SCHEMA IF NOT EXISTS wacrm;

-- Create views in public schema pointing to wacrm schema
CREATE OR REPLACE VIEW public.campaigns AS SELECT * FROM wacrm.campaigns;
CREATE OR REPLACE VIEW public.disp_message_queue AS SELECT * FROM wacrm.disp_message_queue;
CREATE OR REPLACE VIEW public.campaign_metrics AS SELECT * FROM wacrm.campaign_metrics;

-- Grant access on public views to all roles
GRANT ALL ON public.campaigns TO anon, authenticated, service_role;
GRANT ALL ON public.disp_message_queue TO anon, authenticated, service_role;
GRANT ALL ON public.campaign_metrics TO anon, authenticated, service_role;
