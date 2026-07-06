import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../common/supabase/supabase.service';

@Injectable()
export class AttendanceService {
  constructor(private supabase: SupabaseService) {}

  async createCard(contactId: string, campaignId?: string, resumoIa?: string) {
    // Evita duplicar card aberto
    const { data: existing } = await this.supabase.db
      .from('attendance_cards')
      .select('id')
      .eq('contact_id', contactId)
      .in('status', ['novo', 'aguardando_vendedor', 'em_atendimento', 'aguardando_cliente'])
      .maybeSingle();

    if (existing) return existing;

    const { data } = await this.supabase.db
      .from('attendance_cards')
      .insert({ contact_id: contactId, campaign_id: campaignId, resumo_ia: resumoIa, status: 'novo' })
      .select()
      .single();
    return data;
  }

  async findAll(filters: { status?: string; assigned_to?: string; page?: number; limit?: number }) {
    const { status, assigned_to, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let query = this.supabase.db
      .from('attendance_cards')
      .select(`
        *,
        contacts(nome, telefone_normalizado),
        campaigns(nome),
        users!attendance_cards_assigned_to_fkey(nome)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);
    if (assigned_to) query = query.eq('assigned_to', assigned_to);

    const { data, count } = await query;
    return { data, total: count, page, limit };
  }

  async findOne(id: string) {
    const { data } = await this.supabase.db
      .from('attendance_cards')
      .select(`
        *,
        contacts(*, message_logs(*), incoming_messages(*)),
        campaigns(nome),
        users!attendance_cards_assigned_to_fkey(nome, email)
      `)
      .eq('id', id)
      .single();
    return data;
  }

  async assign(id: string, userId: string) {
    const { data } = await this.supabase.db
      .from('attendance_cards')
      .update({ assigned_to: userId, status: 'em_atendimento' })
      .eq('id', id)
      .select()
      .single();
    return data;
  }

  async updateStatus(id: string, status: string, resultado?: string) {
    const { data } = await this.supabase.db
      .from('attendance_cards')
      .update({ status, resultado })
      .eq('id', id)
      .select()
      .single();
    return data;
  }
}
