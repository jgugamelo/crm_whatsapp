import { Injectable, BadRequestException } from '@nestjs/common';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { SupabaseService } from '../common/supabase/supabase.service';
import { BlacklistService } from '../blacklist/blacklist.service';

@Injectable()
export class ContactsService {
  constructor(
    private supabase: SupabaseService,
    private blacklist: BlacklistService,
  ) {}

  /** Normaliza telefone para E.164 com DDI Brasil como fallback */
  normalizePhone(raw: string): string | null {
    if (!raw) return null;
    const cleaned = raw.replace(/\D/g, '');
    // Tenta com DDI Brasil se não tiver
    const withDdi = cleaned.startsWith('55') ? `+${cleaned}` : `+55${cleaned}`;
    const phone = parsePhoneNumberFromString(withDdi, 'BR');
    return phone?.isValid() ? phone.number : null;
  }

  async importContacts(
    rows: Array<{ nome?: string; telefone: string; email?: string; origem?: string; tags?: string }>,
    userId: string,
  ) {
    const results = { importados: 0, duplicados: 0, invalidos: 0, blacklisted: 0, erros: [] as string[] };

    for (const row of rows) {
      const normalized = this.normalizePhone(row.telefone);

      if (!normalized) {
        results.invalidos++;
        continue;
      }

      // Checar blacklist
      const inBlacklist = await this.blacklist.isBlacklisted(normalized);
      if (inBlacklist) {
        results.blacklisted++;
        continue;
      }

      const contact = {
        nome: row.nome || null,
        telefone: row.telefone,
        telefone_normalizado: normalized,
        email: row.email || null,
        origem: row.origem || 'importacao',
        tags: row.tags ? row.tags.split(',').map((t) => t.trim()) : [],
        status_contato: 'apto_para_envio',
      };

      const { error } = await this.supabase.db
        .from('contacts')
        .upsert(contact, { onConflict: 'telefone_normalizado', ignoreDuplicates: true });

      if (error) {
        if (error.code === '23505') {
          results.duplicados++;
        } else {
          results.erros.push(`${row.telefone}: ${error.message}`);
        }
      } else {
        results.importados++;
      }
    }

    return results;
  }

  async listTags(): Promise<string[]> {
    const { data } = await this.supabase.db
      .from('contacts')
      .select('tags')
      .not('tags', 'is', null)
      .range(0, 9999); // suporta até 10k contatos sem bater no limite padrão do PostgREST
    const all = (data || []).flatMap((c: any) => c.tags || []);
    return [...new Set(all)].sort();
  }

  async createOne(body: { nome?: string; telefone: string; email?: string; origem?: string; tags?: string[] }, userId: string) {
    const normalized = this.normalizePhone(body.telefone);
    if (!normalized) throw new BadRequestException('Telefone inválido');

    const inBlacklist = await this.blacklist.isBlacklisted(normalized);
    if (inBlacklist) throw new BadRequestException('Número está na blacklist');

    const { data, error } = await this.supabase.db
      .from('contacts')
      .upsert({
        nome: body.nome || null,
        telefone: body.telefone,
        telefone_normalizado: normalized,
        email: body.email || null,
        origem: body.origem || 'manual',
        tags: body.tags || [],
        status_contato: 'apto_para_envio',
      }, { onConflict: 'telefone_normalizado', ignoreDuplicates: false })
      .select()
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async findAll(filters: {
    status?: string;
    nivel_risco?: string;
    origem?: string;
    search?: string;
    tag?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, nivel_risco, origem, search, tag, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;

    let query = this.supabase.db
      .from('contacts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status_contato', status);
    if (nivel_risco) query = query.eq('nivel_risco', nivel_risco);
    if (origem) query = query.eq('origem', origem);
    // .contains() gera notação {val} (text[]) — JSONB precisa de ["val"]
    if (tag) query = (query as any).filter('tags', 'cs', JSON.stringify([tag]));
    if (search) {
      query = query.or(`nome.ilike.%${search}%,telefone_normalizado.ilike.%${search}%`);
    }

    const { data, count, error } = await query;
    if (error) throw new BadRequestException(error.message);

    return { data, total: count, page, limit };
  }

  async findOne(id: string) {
    const { data } = await this.supabase.db
      .from('contacts')
      .select('*, message_logs(*), incoming_messages(*)')
      .eq('id', id)
      .single();
    return data;
  }

  async updateStatus(id: string, status: string) {
    const { data } = await this.supabase.db
      .from('contacts')
      .update({ status_contato: status })
      .eq('id', id)
      .select()
      .single();
    return data;
  }

  async blockContact(id: string, motivo: string) {
    const { data: contact } = await this.supabase.db
      .from('contacts')
      .select('telefone_normalizado')
      .eq('id', id)
      .single();

    if (!contact) throw new BadRequestException('Contato não encontrado');

    await this.blacklist.add(contact.telefone_normalizado, 'bloqueio_manual');
    return this.updateStatus(id, 'bloqueado');
  }

  async update(id: string, body: { nome?: string; telefone?: string; email?: string; origem?: string; tags?: string[]; curso?: string; categoria?: string; status_contato?: string }) {
    const updates: any = {};
    if (body.nome !== undefined)           updates.nome = body.nome;
    if (body.email !== undefined)          updates.email = body.email;
    if (body.origem !== undefined)         updates.origem = body.origem;
    if (body.tags !== undefined)           updates.tags = body.tags;
    if (body.curso !== undefined)          updates.curso = body.curso;
    if (body.categoria !== undefined)      updates.categoria = body.categoria;
    if (body.status_contato !== undefined) updates.status_contato = body.status_contato;
    if (body.telefone !== undefined) {
      const normalized = this.normalizePhone(body.telefone);
      if (!normalized) throw new BadRequestException('Telefone inválido');
      updates.telefone_normalizado = normalized;
    }
    const { data, error } = await this.supabase.db
      .from('contacts').update(updates).eq('id', id).select().single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async delete(id: string) {
    const { error } = await this.supabase.db.from('contacts').delete().eq('id', id);
    if (error) throw new BadRequestException(error.message);
    return { deleted: true };
  }

  async bulkDelete(ids: string[]) {
    if (!ids?.length) throw new BadRequestException('Nenhum ID fornecido');
    const { error } = await this.supabase.db.from('contacts').delete().in('id', ids);
    if (error) throw new BadRequestException(error.message);
    return { deleted: ids.length };
  }
}
