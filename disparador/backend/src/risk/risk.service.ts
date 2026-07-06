import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';

const OPTOUT_WARN = 0.03;   // 3% → reduzir velocidade
const OPTOUT_PAUSE = 0.05;  // 5% → pausar campanha
const ERROR_PAUSE = 0.10;   // 10% → pausar sessão
const NEG_WARN = 0.08;      // 8% → revisar mensagem

@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);

  constructor(private supabase: SupabaseService) {}

  async evaluateCampaign(campaignId: string): Promise<void> {
    const { data: metrics } = await this.supabase.db
      .from('campaign_metrics')
      .select('*')
      .eq('campaign_id', campaignId)
      .single();

    if (!metrics || metrics.total_enviados < 10) return; // mínimo para avaliar

    const taxaOptout = metrics.total_optout / metrics.total_enviados;
    const taxaErro = metrics.total_erros / metrics.total_enviados;

    let score = 0;
    let acao: string | null = null;

    if (taxaOptout >= OPTOUT_PAUSE) {
      score = 80;
      acao = 'pausar_campanha';
      await this.pauseCampaign(campaignId, `Opt-out ${(taxaOptout * 100).toFixed(1)}% > ${OPTOUT_PAUSE * 100}%`);
    } else if (taxaOptout >= OPTOUT_WARN) {
      score = 50;
      acao = 'reduzir_velocidade';
    } else if (taxaErro >= ERROR_PAUSE) {
      score = 60;
      acao = 'verificar_sessao';
    }

    await this.supabase.db
      .from('campaign_metrics')
      .update({ score_risco: score })
      .eq('campaign_id', campaignId);

    if (acao) {
      await this.supabase.db.from('risk_events').insert({
        tipo: 'metrica_campanha',
        nivel: score >= 80 ? 'alto' : 'medio',
        campaign_id: campaignId,
        descricao: `Taxa optout: ${(taxaOptout * 100).toFixed(1)}%, Taxa erro: ${(taxaErro * 100).toFixed(1)}%`,
        acao_tomada: acao,
        metadata: { taxaOptout, taxaErro, total_enviados: metrics.total_enviados },
      });
    }
  }

  async evaluateSession(sessionId: string): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const { data: limits } = await this.supabase.db
      .from('daily_limits')
      .select('*')
      .eq('session_id', sessionId)
      .eq('data', today)
      .single();

    if (!limits || limits.total_enviados < 5) return;

    const taxaErro = limits.total_erros / limits.total_enviados;

    if (taxaErro >= ERROR_PAUSE) {
      await this.supabase.db
        .from('whatsapp_sessions')
        .update({ status: 'pausada' })
        .eq('id', sessionId);

      await this.supabase.db.from('risk_events').insert({
        tipo: 'erro_sessao',
        nivel: 'alto',
        session_id: sessionId,
        descricao: `Taxa de erro ${(taxaErro * 100).toFixed(1)}% — sessão pausada`,
        acao_tomada: 'pausar_sessao',
      });

      this.logger.warn(`Sessão ${sessionId} pausada por alta taxa de erro`);
    }
  }

  private async pauseCampaign(campaignId: string, motivo: string) {
    await this.supabase.db
      .from('campaigns')
      .update({ status: 'pausada' })
      .eq('id', campaignId);

    this.logger.warn(`Campanha ${campaignId} pausada: ${motivo}`);
  }

  async getEventsForCampaign(campaignId: string) {
    const { data } = await this.supabase.db
      .from('risk_events')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .limit(50);
    return data;
  }
}
