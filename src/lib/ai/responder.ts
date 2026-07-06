import { createClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/whatsapp/encryption";
import { sendTextMessage } from "@/lib/whatsapp/meta-api";
import { sendWahaTextMessage } from "@/lib/whatsapp/waha-api";
import {
  sanitizePhoneForMeta,
  phoneVariants,
  isValidE164,
  isRecipientNotAllowedError,
} from "@/lib/whatsapp/phone-utils";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = () => createClient(supabaseUrl, supabaseServiceKey, {
  db: {
    schema: 'wacrm'
  }
});

export async function handleAiAutoResponse(
  accountId: string,
  contactId: string,
  conversationId: string,
  incomingText: string
) {
  const db = supabaseAdmin();

  // 1. Fetch AI Configuration
  const { data: aiConfig, error: aiConfigError } = await db
    .from("ai_config")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();

  if (aiConfigError || !aiConfig || !aiConfig.enabled) {
    return; // AI disabled or not configured
  }

  // 2. Load recent conversation history (last 10 messages)
  const { data: messages, error: messagesError } = await db
    .from("messages")
    .select("content_text, created_at, sender_type")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (messagesError) {
    console.error("[AI Agent] failed to load messages context:", messagesError);
    return;
  }

  // Order chronologically for the LLM
  const history = (messages || []).reverse();

  // 3. Generate response using chosen LLM API
  let generatedText = "";
  const configKey = aiConfig.api_key?.trim();

  let masterKey = "";
  if (aiConfig.api_provider === "hermes") {
    masterKey = process.env.OPENROUTER_API_KEY || "";
  } else if (aiConfig.api_provider === "openai") {
    masterKey = process.env.OPENAI_API_KEY || "";
  } else if (aiConfig.api_provider === "claude") {
    masterKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || "";
  } else if (aiConfig.api_provider === "gemini") {
    masterKey = process.env.GEMINI_API_KEY || "";
  }

  const activeKey = !configKey ? masterKey : configKey;

  if (!activeKey) {
    console.warn(`[AI Agent] Missing API Key for provider: ${aiConfig.api_provider}`);
    return;
  }

  try {
    if (aiConfig.api_provider === "openai") {
      generatedText = await generateOpenAiResponse(
        activeKey,
        aiConfig.system_prompt || "Você é um assistente virtual.",
        history
      );
    } else if (aiConfig.api_provider === "claude") {
      generatedText = await generateClaudeResponse(
        activeKey,
        aiConfig.system_prompt || "Você é um assistente virtual.",
        history
      );
    } else if (aiConfig.api_provider === "hermes") {
      generatedText = await generateHermesResponse(
        activeKey,
        aiConfig.system_prompt || "Você é um assistente virtual.",
        history
      );
    } else {
      generatedText = await generateGeminiResponse(
        activeKey,
        aiConfig.system_prompt || "Você é um assistente virtual.",
        history
      );
    }
  } catch (err) {
    console.error("[AI Agent] LLM generation error:", err);
    return;
  }

  generatedText = generatedText.trim();
  if (!generatedText) return;

  // 4. Load WhatsApp configuration
  const { data: config, error: configError } = await db
    .from("whatsapp_config")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();

  if (configError || !config) {
    console.error("[AI Agent] WhatsApp config not found");
    return;
  }

  const { data: contact } = await db
    .from("contacts")
    .select("phone")
    .eq("id", contactId)
    .single();

  if (!contact?.phone) return;

  const sanitized = sanitizePhoneForMeta(contact.phone);
  const variants = phoneVariants(sanitized);
  let sentMessageId = "";
  let workingPhone = sanitized;

  const isWaha = config.provider === "waha";
  const wahaConfig = isWaha
    ? {
        waha_url: config.waha_url,
        waha_session: config.waha_session,
        waha_api_key: config.waha_api_key ? decrypt(config.waha_api_key) : null,
      }
    : null;
  const accessToken = isWaha ? "" : decrypt(config.access_token);

  // 5. Send message via WAHA or Meta
  for (const variant of variants) {
    try {
      if (isWaha) {
        const result = await sendWahaTextMessage(wahaConfig!, variant, generatedText);
        sentMessageId = result.messageId;
      } else {
        const result = await sendTextMessage({
          phoneNumberId: config.phone_number_id,
          accessToken,
          to: variant,
          text: generatedText,
        });
        sentMessageId = result.messageId;
      }
      workingPhone = variant;
      break;
    } catch (err) {
      if (isWaha) {
        console.error("[AI Agent] WAHA send error:", err);
        break;
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (!isRecipientNotAllowedError(msg)) {
        console.error("[AI Agent] Meta send error:", err);
        break;
      }
    }
  }

  if (!sentMessageId) return;

  if (workingPhone !== sanitized) {
    await db.from("contacts").update({ phone: workingPhone }).eq("id", contactId);
  }

  // 6. Save sent message to database
  const messageDate = new Date().toISOString();
  const { error: newMsgErr } = await db
    .from("messages")
    .insert({
      account_id: accountId,
      conversation_id: conversationId,
      message_id: sentMessageId,
      content_type: "text",
      content_text: generatedText,
      status: "sent",
      sender_type: "bot",
      created_at: messageDate,
    });

  if (newMsgErr) {
    console.error("[AI Agent] Failed to save outbound message:", newMsgErr);
    return;
  }

  // 7. Update conversation values
  await db
    .from("conversations")
    .update({
      last_message_text: generatedText,
      last_message_at: messageDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);
}

async function generateGeminiResponse(
  apiKey: string,
  systemPrompt: string,
  history: any[]
): Promise<string> {
  const model = "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents = [];

  for (const msg of history) {
    const isCustomer = msg.sender_type === "customer";
    contents.push({
      role: isCustomer ? "user" : "model",
      parts: [{ text: msg.content_text || "" }],
    });
  }

  const systemInstruction = systemPrompt
    ? {
        parts: [{ text: systemPrompt }],
      }
    : undefined;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      systemInstruction,
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function generateOpenAiResponse(
  apiKey: string,
  systemPrompt: string,
  history: any[]
): Promise<string> {
  const url = "https://api.openai.com/v1/chat/completions";
  const messages = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  for (const msg of history) {
    const isCustomer = msg.sender_type === "customer";
    messages.push({
      role: isCustomer ? "user" : "assistant",
      content: msg.content_text || "",
    });
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}

async function generateClaudeResponse(
  apiKey: string,
  systemPrompt: string,
  history: any[]
): Promise<string> {
  const url = "https://api.anthropic.com/v1/messages";
  const messages = [];

  for (const msg of history) {
    const isCustomer = msg.sender_type === "customer";
    messages.push({
      role: isCustomer ? ("user" as const) : ("assistant" as const),
      content: msg.content_text || "",
    });
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1000,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data?.content?.[0]?.text || "";
}

async function generateHermesResponse(
  apiKey: string,
  systemPrompt: string,
  history: any[]
): Promise<string> {
  const url = "https://openrouter.ai/api/v1/chat/completions";
  const messages = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  for (const msg of history) {
    const isCustomer = msg.sender_type === "customer";
    messages.push({
      role: isCustomer ? "user" : "assistant",
      content: msg.content_text || "",
    });
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://wacrm.vercel.app",
      "X-Title": "WA CRM",
    },
    body: JSON.stringify({
      model: "nousresearch/hermes-3-llama-3.1-405b",
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Hermes OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}
