import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupabaseService } from '../common/supabase/supabase.service';
import { BlacklistService } from '../blacklist/blacklist.service';
import { MessageVariationsService } from '../message-variations/message-variations.service';
import { WahaService } from '../waha/waha.service';

@Injectable()
export class FollowupService {
  private readonly logger = new Logger(FollowupService.name);

  constructor(
    private supabase: SupabaseService,
    private blacklist: BlacklistService,
    private variations: MessageVariationsService,
    private waha: WahaService,
  ) {}

  /** Roda a cada hora para verificar contatos sem resposta */
  @Cron(CronExpression.EVERY_HOUR)
  async processFollowups() {
    this.logger.log('Verificando follow-ups pendentes...');

    // Busca campanhas em execução com follow-up configurado
    const { data: campaigns } = await this.supabase.db
      .from('campaigns')
      .select('id, max_followups, session_id, whatsapp_sessions(waha_session_name)')
      .eq('status', 'em_execucao')
      .gt('max_followups', 0);

    if (!campaigns) return;

    for (const campaign of campaigns as any[]) {
      await this.processCampaignFollowups(campaign);
    }
  }

  private async processCampaignFollowups(campaign: any) {
    const now = new Date();
    const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const h72 = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();

    // Contatos enviados há +24h sem resposta, followup_count = 0
    const { data: followup1Candidates } = await this.supabase.db
      .from('campaign_contacts')
      .select('contact_id, contacts(telefone_normalizado, nome, status_contato)')
      .eq('campaign_id', campaign.id)
      .eq('status', 'enviado')
      .eq('followup_count', 0)
      .lt('updated_at', h24);

    for (const row of (followup1Candidates || []) as any[]) {
      await this.sendFollowup(row, campaign, 1);
    }

    if (campaign.max_followups >= 2) {
      // Contatos com followup_count = 1 e sem resposta há +72h
      const { data: followup2Candidates } = await this.supabase.db
        .from('campaign_contacts')
        .select('contact_id, contacts(telefone_normalizado, nome, status_contato)')
        .eq('campaign_id', campaign.id)
        .eq('status', 'enviado')
        .eq('followup_count', 1)
        .lt('updated_at', h72);

      for (const row of (followup2Candidates || []) as any[]) {
        await this.sendFollowup(row, campaign, 2);
      }
    }
  }

  private async sendFollowup(row: any, campaign: any, followupNum: number) {
    const contact = row.contacts;
    if (!contact) return;

    // Bloqueios
    const blocked = await this.blacklist.isBlacklisted(contact.telefone_normalizado);
    if (blocked) return;

    const skipStatuses = ['removido', 'bloqueado', 'interessado', 'convertido', 'sem_interesse', 'numero_invalido'];
    if (skipStatuses.includes(contact.status_contato)) return;

    // Pega variação de followup
    const { data: variation } = await this.supabase.db
      .from('message_variations')
      .select('mensagem')
      .eq('campaign_id', campaign.id)
      .eq('tipo', 'followup')
      .eq('aprovada', true)
      .limit(1)
      .maybeSingle();

    const mensagemBase = variation?.mensagem
      || await this.variations.getRandomApproved(campaign.id);

    if (!mensagemBase) return;

    const mensagem = mensagemBase.replace(/\{\{nome\}\}/gi, contact.nome || 'você');

    try {
      await this.waha.sendText(campaign.whatsapp_sessions.waha_session_name, contact.telefone_normalizado, mensagem);

      // Log
      await this.supabase.db.from('message_logs').insert({
        campaign_id: campaign.id,
        contact_id: row.contact_id,
        session_id: campaign.session_id,
        direcao: 'saida',
        mensagem,
        status: 'enviado',
        metadata: { tipo: `followup_${followupNum}` },
      });

      // Atualiza contador
      await this.supabase.db
        .from('campaign_contacts')
        .update({ followup_count: followupNum, updated_at: new Date().toISOString() })
        .eq('campaign_id', campaign.id)
        .eq('contact_id', row.contact_id);

      this.logger.log(`Follow-up ${followupNum} enviado para ${contact.telefone_normalizado}`);
    } catch (err: any) {
      this.logger.error(`Erro no follow-up: ${err.message}`);
    }
  }
}
