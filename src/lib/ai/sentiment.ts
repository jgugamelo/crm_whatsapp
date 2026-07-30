import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = () =>
  createClient(supabaseUrl, supabaseServiceKey, {
    db: {
      schema: "wacrm",
    },
  });

export async function analyzeConversationSentimentAndTags(
  accountId: string,
  contactId: string,
  conversationId: string
) {
  const db = supabaseAdmin();

  // 1. Fetch AI Configuration
  const { data: aiConfig } = await db
    .from("ai_config")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();

  const provider =
    aiConfig?.api_provider ||
    (process.env.OPENAI_API_KEY
      ? "openai"
      : process.env.OPENROUTER_API_KEY
      ? "hermes"
      : "gemini");

  const configKey = aiConfig?.api_key?.trim();

  let masterKey = "";
  if (provider === "hermes") {
    masterKey = process.env.OPENROUTER_API_KEY || "";
  } else if (provider === "openai") {
    masterKey = process.env.OPENAI_API_KEY || "";
  } else if (provider === "claude") {
    masterKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || "";
  } else if (provider === "gemini") {
    masterKey = process.env.GEMINI_API_KEY || "";
  }

  const activeKey = !configKey ? masterKey : configKey;

  if (!activeKey) {
    return; // No active API key found
  }

  // 2. Fetch existing tags for the account
  const { data: existingTags } = await db
    .from("tags")
    .select("id, name")
    .eq("account_id", accountId);

  const tagsList = existingTags || [];

  // 3. Load recent conversation history (last 15 messages)
  const { data: messages, error: messagesError } = await db
    .from("messages")
    .select("content_text, created_at, sender_type")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(15);

  if (messagesError || !messages || messages.length === 0) {
    return;
  }

  // Chronological order
  const history = messages.reverse();

  // Format history text for the LLM
  const historyText = history
    .map((m) => {
      const role = m.sender_type === "customer" ? "Cliente" : "Atendente";
      return `${role}: ${m.content_text || ""}`;
    })
    .join("\n");

  const prompt = `Você é um analista de CRM inteligente para WhatsApp. Analise o histórico da conversa abaixo e extraia:
1. O sentimento predominante do cliente (positive, neutral, negative ou mixed).
2. As tags aplicáveis a este contato.

Tags existentes no sistema:
${JSON.stringify(tagsList.map((t) => t.name))}

Sua resposta deve ser um objeto JSON válido, sem qualquer texto explicativo antes ou depois, sem aspas de bloco de código (\`\`\`), contendo a seguinte estrutura:
{
  "sentiment": "positive" | "neutral" | "negative" | "mixed",
  "tags_to_add": ["nome da tag existente que se aplica perfeitamente à conversa"],
  "tags_to_create": ["nova tag curta e útil baseada no interesse do cliente (ex: Interessado em Curso, Suporte Técnico, Reclamação) apenas se não houver tag existente correspondente"]
}

Histórico da Conversa:
"""
${historyText}
"""`;

  try {
    const rawResult = await callLlmForAnalysis(provider, activeKey, prompt);

    const cleanJson = rawResult
      .trim()
      .replace(/^```json/i, "")
      .replace(/^```/, "")
      .replace(/```$/, "")
      .trim();

    const data = JSON.parse(cleanJson);
    const sentiment = data.sentiment;
    const tagsToAdd: string[] = Array.isArray(data.tags_to_add) ? data.tags_to_add : [];
    const tagsToCreate: string[] = Array.isArray(data.tags_to_create) ? data.tags_to_create : [];

    // Update conversation sentiment
    if (["positive", "neutral", "negative", "mixed"].includes(sentiment)) {
      await db
        .from("conversations")
        .update({ sentiment })
        .eq("id", conversationId);
    }

    // Get a valid user_id to assign as tag owner/creator
    const { data: firstProfile } = await db
      .from("profiles")
      .select("user_id")
      .eq("account_id", accountId)
      .limit(1)
      .maybeSingle();

    const userId = firstProfile?.user_id;
    if (!userId) return;

    const tagIdsToLink: string[] = [];

    // Match tags to add
    for (const tagName of tagsToAdd) {
      const match = tagsList.find((t) => t.name.toLowerCase() === tagName.toLowerCase());
      if (match) {
        tagIdsToLink.push(match.id);
      }
    }

    // Match or create new tags
    for (const tagName of tagsToCreate) {
      const cleanTagName = tagName.trim();
      if (!cleanTagName) continue;

      const existingMatch = tagsList.find(
        (t) => t.name.toLowerCase() === cleanTagName.toLowerCase()
      );

      if (existingMatch) {
        tagIdsToLink.push(existingMatch.id);
      } else {
        const { data: newTag } = await db
          .from("tags")
          .insert({
            account_id: accountId,
            name: cleanTagName,
            color: "#3b82f6",
            created_by: userId,
          })
          .select("id")
          .single();

        if (newTag) {
          tagIdsToLink.push(newTag.id);
        }
      }
    }

    // Attach tags to contact
    for (const tagId of tagIdsToLink) {
      const { data: existingLink } = await db
        .from("contact_tags")
        .select("*")
        .eq("contact_id", contactId)
        .eq("tag_id", tagId)
        .maybeSingle();

      if (!existingLink) {
        await db.from("contact_tags").insert({
          contact_id: contactId,
          tag_id: tagId,
        });
      }
    }
  } catch (err) {
    console.error("[Sentiment & Tags Analysis] Error processing LLM response:", err);
  }
}

export async function generateReplySuggestion(
  accountId: string,
  conversationId: string
): Promise<string> {
  const db = supabaseAdmin();

  // 1. Fetch AI Configuration
  const { data: aiConfig } = await db
    .from("ai_config")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();

  const provider =
    aiConfig?.api_provider ||
    (process.env.OPENAI_API_KEY
      ? "openai"
      : process.env.OPENROUTER_API_KEY
      ? "hermes"
      : "gemini");

  const configKey = aiConfig?.api_key?.trim();

  let masterKey = "";
  if (provider === "hermes") {
    masterKey = process.env.OPENROUTER_API_KEY || "";
  } else if (provider === "openai") {
    masterKey = process.env.OPENAI_API_KEY || "";
  } else if (provider === "claude") {
    masterKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || "";
  } else if (provider === "gemini") {
    masterKey = process.env.GEMINI_API_KEY || "";
  }

  const activeKey = !configKey ? masterKey : configKey;

  if (!activeKey) {
    throw new Error("Chave de API de Inteligência Artificial não configurada.");
  }

  // 2. Load recent conversation history (last 15 messages)
  const { data: messages } = await db
    .from("messages")
    .select("content_text, created_at, sender_type")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(15);

  if (!messages || messages.length === 0) {
    return "Olá! Como posso ajudar você hoje?";
  }

  const history = messages.reverse();
  const historyText = history
    .map((m) => {
      const role = m.sender_type === "customer" ? "Cliente" : "Consultor";
      return `${role}: ${m.content_text || ""}`;
    })
    .join("\n");

  const prompt = `Você é um consultor comercial especialista em vendas e negociação de alta conversão no WhatsApp.
Analise o histórico recente da conversa abaixo entre o Cliente e o Consultor:

Histórico da conversa:
"""
${historyText}
"""

Sua tarefa:
Gere a MELHOR SUGESTÃO DE RESPOSTA para o consultor enviar ao cliente agora.
Diretrizes:
- Escreva de forma curta, natural, empática e persuasiva (máximo 2 a 3 frases).
- Se o cliente apresentou dúvidas ou objeções (ex: preço, prazo, incerteza), quebre a objeção com clareza e valor.
- Termine sempre com uma pergunta estratégica ou Chamada para Ação (CTA) clara para continuar o atendimento e avançar para o fechamento.
- Responda EXCLUSIVAMENTE com o texto final da mensagem a ser enviada no WhatsApp. Não inclua aspas, introduções ("Sugestão:"), nem explicações.`;

  const rawResult = await callLlmForText(provider, activeKey, prompt);

  let cleaned = rawResult
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^(Aqui está uma sugestão|Sugestão de resposta|Resposta|Sugestão):\s*/i, "")
    .trim();

  return cleaned || "Olá! Gostaria de tirar mais alguma dúvida para podermos avançar?";
}

async function callLlmForAnalysis(
  provider: string,
  apiKey: string,
  prompt: string
): Promise<string> {
  if (provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);
    const data = await response.json();
    return data?.choices?.[0]?.message?.content || "";
  } else if (provider === "claude") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) throw new Error(`Claude error: ${response.status}`);
    const data = await response.json();
    return data?.content?.[0]?.text || "";
  } else if (provider === "hermes") {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://wacrm.vercel.app",
        "X-Title": "WA CRM",
      },
      body: JSON.stringify({
        model: "nousresearch/hermes-3-llama-3.1-405b",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) throw new Error(`Hermes error: ${response.status}`);
    const data = await response.json();
    return data?.choices?.[0]?.message?.content || "";
  } else {
    // Gemini
    const model = "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 500,
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    });
    if (!response.ok) throw new Error(`Gemini error: ${response.status}`);
    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }
}

async function callLlmForText(
  provider: string,
  apiKey: string,
  prompt: string
): Promise<string> {
  if (provider === "openai") {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
      }),
    });
    if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);
    const data = await response.json();
    return data?.choices?.[0]?.message?.content || "";
  } else if (provider === "claude") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) throw new Error(`Claude error: ${response.status}`);
    const data = await response.json();
    return data?.content?.[0]?.text || "";
  } else if (provider === "hermes") {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://wacrm.vercel.app",
        "X-Title": "WA CRM",
      },
      body: JSON.stringify({
        model: "nousresearch/hermes-3-llama-3.1-405b",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
      }),
    });
    if (!response.ok) throw new Error(`Hermes error: ${response.status}`);
    const data = await response.json();
    return data?.choices?.[0]?.message?.content || "";
  } else {
    // Gemini
    const model = "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 500,
          temperature: 0.5,
        },
      }),
    });
    if (!response.ok) throw new Error(`Gemini error: ${response.status}`);
    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }
}
