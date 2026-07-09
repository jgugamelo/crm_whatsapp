-- 034_add_elevenlabs_and_search_to_ai_config.sql
-- Add ElevenLabs, Google Search, and Multimodal columns to wacrm.ai_config

ALTER TABLE wacrm.ai_config
  ADD COLUMN IF NOT EXISTS google_search_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS multimodal_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS elevenlabs_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS elevenlabs_api_key TEXT,
  ADD COLUMN IF NOT EXISTS elevenlabs_voice_id TEXT;
