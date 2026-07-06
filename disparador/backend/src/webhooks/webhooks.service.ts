import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';
import { BlacklistService } from '../blacklist/blacklist.service';
import { ResponseClassificationService } from '../response-classification/response-classification.service';
import { RiskService } from '../risk/risk.service';
import { AttendanceService } from '../attendance/attendance.service';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private supabase: SupabaseService,
    private blacklist: BlacklistService,
    private classification: ResponseClassificationService,
    private risk: RiskService,
    private attendance: AttendanceService,
  ) {}

  async processMessage(payload: any) {
    const { session, payload: msg } = payload;

    if (!msg?.from || !msg?.body) return;

    const telefone = '+' + msg.from.replace('@c.us', '').replace('@s.whatsapp.net', '');
    const mensagem = msg.body;

    this.logger.log(`Mensagem recebida de ${telefone} na sessão ${session}`);

    // 1. Identifica sessão
    const { data: sessionData } = await this.supabase.db
      .from('whatsapp_sessions')
      .select('id')
      .eq('waha_session_name', session)
      .maybeSingle();

    const sessionId = sessionData?.id;

    // 2. Localiza contato
    const { data: contact } = await this.supabase.db
      .from('contacts')
      .select('id, status_contato')
      .eq('telefone_normalizado', telefone)
      .maybeSingle();

    const contactId = contact?.id;

    // Busca campanha ativa para o contato
    let campaignId: string | null = null;
    if (contactId) {
      const { data: cc } = await this.supabase.db
        .from('campaign_contacts')
        .select('campaign_id')
        .eq('contact_id', contactId)
        .in('status', ['pendente', 'agendado', 'enviado'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      campaignId = cc?.campaign_id || null;
    }

    // 3. Salva mensagem recebida
    const { data: incoming } = await this.supabase.db
      .from('incoming_messages')
      .insert({
        session_id: sessionId,
        contact_id: contactId,
        campaign_id: campaignId,
        telefone,
        mensagem,
        waha_message_id: msg.id,
      })
      .select()
      .single();

    // 4. Verifica opt-out (rápido, sem IA)
    if (this.classification.isOptout(mensagem)) {
      await this.handleOptout(telefone, contactId, campaignId, mensagem, incoming?.id);
      return;
    }

    // 5. Classifica com IA
    const result = await this.classification.classify(mensagem, contactId, campaignId || undefined);

    // 6. Atualiza mensagem com classificação
    await this.supabase.db
      .from('incoming_messages')
      .update({
        classificacao: result.categoria,
        confianca: result.confianca,
        resumo_ia: result.resumo,
        acao_recomendada: result.acao_recomendada,
        processado: true,
      })
      .eq('id', incoming?.id);

    // 7. Executa ação conforme categoria
    if (contactId) {
      await this.executeAction(result.categoria, contactId, campaignId, telefone, mensagem);
    }

    // 8. Atualiza métricas
    if (campaignId) {
      await this.supabase.db.rpc('increment_campaign_metric', {
        p_campaign_id: campaignId,
        p_field: 'total_respostas',
      });
      await this.risk.evaluateCampaign(campaignId);
    }
  }

  private async handleOptout(telefone: string, contactId: string | null, campaignId: string | null, mensagem: string, incomingId?: string) {
    this.logger.log(`Opt-out detectado: ${telefone}`);

    await this.blacklist.add(telefone, 'opt_out', {
      campaign_id: campaignId || undefined,
      mensagem_detectada: mensagem,
    });

    await this.supabase.db.from('optout_records').insert({
      telefone,
      contact_id: contactId,
      campaign_id: campaignId,
      mensagem_detectada: mensagem,
    });

    if (campaignId) {
      await this.supabase.db.rpc('increment_campaign_metric', {
        p_campaign_id: campaignId,
        p_field: 'total_optout',
      });
      await this.risk.evaluateCampaign(campaignId);
    }
  }

  private async executeAction(categoria: string, contactId: string, campaignId: string | null, telefone: string, mensagem: string) {
    const statusMap: Record<string, string> = {
      interessado: 'interessado',
      convertido: 'convertido',
      sem_interesse: 'sem_interesse',
      resposta_ofensiva: 'bloqueado',
      numero_errado: 'numero_invalido',
      pediu_remocao: 'removido',
    };

    const novoStatus = statusMap[categoria];
    if (novoStatus) {
      await this.supabase.db
        .from('contacts')
        .update({
          status_contato: novoStatus,
          ultima_resposta_em: new Date().toISOString(),
          quantidade_respostas: this.supabase.db.rpc('increment', {}) as any,
        })
        .eq('id', contactId);
    }

    // Pediu remoção → blacklist
    if (categoria === 'pediu_remocao') {
      await this.blacklist.add(telefone, 'opt_out', {
        campaign_id: campaignId || undefined,
        mensagem_detectada: mensagem,
      });
    }

    // Interessado → cria card de atendimento
    if (['interessado', 'quer_atendimento_humano', 'pediu_preco', 'pediu_link'].includes(categoria)) {
      await this.attendance.createCard(contactId, campaignId || undefined, mensagem);
    }
  }

  async processSessionStatus(payload: any) {
    const { session, payload: statusPayload } = payload;
    const status = statusPayload?.status;

    if (!session || !status) return;

    const mapped = {
      WORKING: 'conectada',
      STOPPED: 'desconectada',
      FAILED: 'erro',
      SCAN_QR_CODE: 'aguardando_qrcode',
    }[status] || 'desconectada';

    await this.supabase.db
      .from('whatsapp_sessions')
      .update({ status: mapped })
      .eq('waha_session_name', session);
  }
}
