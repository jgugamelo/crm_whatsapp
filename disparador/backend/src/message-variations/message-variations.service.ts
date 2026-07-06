import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { SupabaseService } from '../common/supabase/supabase.service';

const FORBIDDEN_TERMS = ['ganhe dinheiro fácil', 'clique aqui', 'oferta imperdível', 'grátis agora'];

@Injectable()
export class MessageVariationsService {
  private readonly logger = new Logger(MessageVariationsService.name);
  private readonly openai: OpenAI;

  constructor(
    private config: ConfigService,
    private supabase: SupabaseService,
  ) {
    this.openai = new OpenAI({ apiKey: config.get('OPENAI_API_KEY') });
  }

  async generate(campaignId: string, options: {
    mensagem_base: string;
    quantidade: number;
    tom: string;
    limite_caracteres?: number;
  }) {
    const { mensagem_base, quantidade, tom, limite_caracteres = 800 } = options;

    const prompt = `Você é um assistente de copywriting para WhatsApp.

Crie ${quantidade} variações naturais da mensagem abaixo.

Regras obrigatórias:
- Não altere a oferta principal.
- Não invente benefícios.
- Não use tom agressivo.
- Não use caixa alta.
- Não use excesso de emojis (máximo 1-2 por mensagem).
- Não pareça mensagem em massa.
- Use linguagem brasileira natural e tom ${tom}.
- Mantenha até ${limite_caracteres} caracteres.
- Preserve variáveis como {{nome}}, {{produto}}, {{unidade}} e outras entre chaves duplas.
- Termine com uma pergunta simples e leve quando fizer sentido.

Mensagem base:
${mensagem_base}

Responda APENAS com um JSON válido no formato:
{
  "variacoes": ["variação 1", "variação 2", ...]
}`;

    const model = this.config.get('OPENAI_MODEL') || 'gpt-4o-mini';
    const startTime = Date.now();

    const response = await this.openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.8,
    });

    const usage = response.usage;
    const content = response.choices[0].message.content || '{}';
    let parsed: { variacoes?: string[] } = {};

    try {
      parsed = JSON.parse(content);
    } catch {
      this.logger.error('Erro ao parsear resposta OpenAI', content);
    }

    const variacoes = (parsed.variacoes || []).filter((v) =>
      !FORBIDDEN_TERMS.some((t) => v.toLowerCase().includes(t)) &&
      v.length <= limite_caracteres,
    );

    // Salva variações no banco
    const rows = variacoes.map((mensagem) => ({
      campaign_id: campaignId,
      mensagem,
      tipo: 'variacao',
      tom,
      aprovada: false,
      score_qualidade: null,
    }));

    const { data: saved } = await this.supabase.db
      .from('message_variations')
      .insert(rows)
      .select();

    // Log de geração
    await this.supabase.db.from('ai_generation_logs').insert({
      tipo: 'variacao',
      campaign_id: campaignId,
      prompt,
      resposta: content,
      modelo: model,
      tokens_prompt: usage?.prompt_tokens,
      tokens_resposta: usage?.completion_tokens,
    });

    return { variacoes: saved, total_gerado: variacoes.length };
  }

  async approve(variationId: string) {
    const { data } = await this.supabase.db
      .from('message_variations')
      .update({ aprovada: true })
      .eq('id', variationId)
      .select()
      .single();
    return data;
  }

  async reject(variationId: string) {
    const { data } = await this.supabase.db
      .from('message_variations')
      .update({ aprovada: false })
      .eq('id', variationId)
      .select()
      .single();
    return data;
  }

  async findByCampaign(campaignId: string, onlyApproved = false) {
    let query = this.supabase.db
      .from('message_variations')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });

    if (onlyApproved) query = query.eq('aprovada', true);

    const { data } = await query;
    return data;
  }

  async getRandomApproved(campaignId: string): Promise<string | null> {
    const { data } = await this.supabase.db
      .from('message_variations')
      .select('mensagem')
      .eq('campaign_id', campaignId)
      .eq('aprovada', true);

    if (!data || data.length === 0) return null;
    const idx = Math.floor(Math.random() * data.length);
    return data[idx].mensagem;
  }
}
