-- Incrementa envios_hoje de uma sessão
CREATE OR REPLACE FUNCTION increment_session_envios(p_session_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE whatsapp_sessions SET envios_hoje = envios_hoje + 1 WHERE id = p_session_id;
  
  INSERT INTO daily_limits (session_id, data, total_enviados)
  VALUES (p_session_id, CURRENT_DATE, 1)
  ON CONFLICT (session_id, data)
  DO UPDATE SET total_enviados = daily_limits.total_enviados + 1, updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Zera envios_hoje todo dia à meia-noite (executar via cron do Supabase)
CREATE OR REPLACE FUNCTION reset_daily_session_counts()
RETURNS void AS $$
BEGIN
  UPDATE whatsapp_sessions SET envios_hoje = 0;
END;
$$ LANGUAGE plpgsql;

-- Incrementa métrica de campanha
CREATE OR REPLACE FUNCTION increment_campaign_metric(p_campaign_id UUID, p_field TEXT)
RETURNS void AS $$
BEGIN
  EXECUTE format('UPDATE campaign_metrics SET %I = %I + 1, updated_at = NOW() WHERE campaign_id = $1', p_field, p_field)
  USING p_campaign_id;
  
  -- Recalcula taxas
  UPDATE campaign_metrics
  SET
    taxa_resposta = CASE WHEN total_enviados > 0 THEN total_respostas::numeric / total_enviados ELSE 0 END,
    taxa_optout   = CASE WHEN total_enviados > 0 THEN total_optout::numeric   / total_enviados ELSE 0 END,
    taxa_erro     = CASE WHEN total_enviados > 0 THEN total_erros::numeric    / total_enviados ELSE 0 END,
    taxa_interesse= CASE WHEN total_enviados > 0 THEN total_interessados::numeric / total_enviados ELSE 0 END,
    updated_at = NOW()
  WHERE campaign_id = p_campaign_id;
END;
$$ LANGUAGE plpgsql;
