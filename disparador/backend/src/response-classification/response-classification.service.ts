import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { SupabaseService } from '../common/supabase/supabase.service';

const CATEGORIES = [
  'interessado', 'quer_mais_informacoes', 'pediu_preco', 'pediu_link',
  'quer_atendimento_humano', 'sem_interesse', 'pediu_remocao',
  'resposta_ofensiva', 'numero_errado', 'fora_de_contexto', 'duvida', 'convertido',
];

export interface ClassificationResult {
  categoria: string;
  confianca: number;
  resumo: string;
  acao_recomendada: string;
}

@Injectable()
export class ResponseClassificationService {
  private readonly logger = new Logger(ResponseClassificationService.name);
  private readonly openai: OpenAI;

  constructor(private config: ConfigService, private supabase: SupabaseService) {
    this.openai = new OpenAI({ apiKey: config.get('OPENAI_API_KEY') });
  }

  async classify(mensagem: string, contactId?: string, campaignId?: string): Promise<ClassificationResult> {
    const prompt = `Classifique a resposta abaixo em uma das categorias permitidas.

Categorias: ${CATEGORIES.join(', ')}.

Responda apenas em JSON válido:
{
  "categoria": "",
  "confianca": 0,
  "resumo": "",
  "acao_recomendada": ""
}

Mensagem do contato:
${mensagem}`;

    const model = this.config.get('OPENAI_MODEL') || 'gpt-4o-mini';

    const response = await this.openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const content = response.choices[0].message.content || '{}';
    let result: ClassificationResult;

    try {
      result = JSON.parse(content);
    } catch {
      result = { categoria: 'fora_de_contexto', confianca: 0, resumo: mensagem, acao_recomendada: 'verificar_manualmente' };
    }

    // Log
    await this.supabase.db.from('ai_generation_logs').insert({
      tipo: 'classificacao',
      contact_id: contactId,
      campaign_id: campaignId,
      prompt,
      resposta: content,
      modelo: model,
      tokens_prompt: response.usage?.prompt_tokens,
      tokens_resposta: response.usage?.completion_tokens,
    });

    return result;
  }

  /** Detecta opt-out por palavras-chave (sem IA, mais rápido) */
  isOptout(mensagem: string): boolean {
    const keywords = [
      'sair', 'parar', 'remover', 'cancelar', 'não quero',
      'nao quero', 'não tenho interesse', 'pare de mandar',
      'me tira da lista', 'descadastrar', 'bloquear', 'stop',
      'não me mande mais', 'nao me mande mais', 'para de mandar',
    ];
    const lower = mensagem.toLowerCase();
    return keywords.some((kw) => lower.includes(kw));
  }
}
