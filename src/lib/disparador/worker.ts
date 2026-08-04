import { createClient } from "@supabase/supabase-js";
import {
  sendWahaTextMessage,
  sendWahaMediaMessage,
  sendWahaVoiceMessage,
  sendWahaSeen,
  sendWahaStartTyping,
  sendWahaStopTyping,
  startWacallsCall,
  playWacallsAudio,
  getWacallsCallStatus,
} from "@/lib/whatsapp/waha-api";
import { decrypt } from "@/lib/whatsapp/encryption";
import OpenAI from "openai";
import { isTimeInCampaignWindow } from "@/lib/disparador/window-helper";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  { db: { schema: "wacrm" } }
);

let isWorkerRunning = false;
let intervalId: NodeJS.Timeout | null = null;

export function ensureQueueWorkerRunning() {
  if (isWorkerRunning) {
    // Process a batch immediately even if worker is already running
    processQueueBatch().catch((err) =>
      console.error("[Queue Worker] Batch execution error:", err)
    );
    return;
  }

  isWorkerRunning = true;
  console.log("[Queue Worker] Global background queue worker initialized.");

  // Process immediately on start
  processQueueBatch().catch((err) =>
    console.error("[Queue Worker] Initial batch execution error:", err)
  );

  // Check queue every 5 seconds
  intervalId = setInterval(() => {
    processQueueBatch().catch((err) =>
      console.error("[Queue Worker] Recurring batch execution error:", err)
    );
  }, 5000);
}

export async function processQueueBatch() {
  try {
    // 1. Fetch campaigns that are in execution
    const { data: activeCampaigns, error: activeErr } = await supabaseAdmin
      .from("campaigns")
      .select("id, status, created_by, janela_inicio, janela_fim, account_id")
      .eq("status", "em_execucao");

    if (activeErr) {
      console.error("[Queue Worker] Error fetching active campaigns:", activeErr.message);
      return;
    }

    if (!activeCampaigns || activeCampaigns.length === 0) {
      return;
    }

    for (const campaign of activeCampaigns) {
      let currentItem: any = null;
      try {
        // Validate time window
        if (
          campaign.janela_inicio &&
          campaign.janela_fim &&
          campaign.janela_inicio !== "00:00" &&
          campaign.janela_fim !== "23:59"
        ) {
          const isWithinWindow = checkWithinWindow(campaign.janela_inicio, campaign.janela_fim);
          if (!isWithinWindow) {
            continue; // Skip this campaign for now outside valid window
          }
        }

        // Fetch the next scheduled item from queue for this campaign (NO embedded join to prevent 404/relationship cache errors)
        const now = new Date().toISOString();
        const { data: item, error: queryError } = await supabaseAdmin
          .from("disp_message_queue")
          .select("*")
          .eq("campaign_id", campaign.id)
          .eq("status", "agendado")
          .lte("scheduled_at", now)
          .order("scheduled_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (queryError) {
          console.error("[Queue Worker] Query error:", queryError.message);
          continue;
        }

        // If queue is empty for this campaign, check if we should set status to completed
        if (!item) {
          const { count } = await supabaseAdmin
            .from("disp_message_queue")
            .select("*", { count: "exact", head: true })
            .eq("campaign_id", campaign.id)
            .eq("status", "agendado");

          if (count === 0) {
            console.log(`[Queue Worker] Campaign ${campaign.id} completed. Updating status to encerrada.`);
            await supabaseAdmin
              .from("campaigns")
              .update({ status: "encerrada" })
              .eq("id", campaign.id);
          }
          continue;
        }

        currentItem = item;

        // Lock item to prevent concurrent processing
        await supabaseAdmin
          .from("disp_message_queue")
          .update({ status: "enviando" })
          .eq("id", item.id);

        console.log(`[Queue Worker] Processing scheduled item ${item.id} for campaign ${campaign.id}`);

        // Fetch contact details separately
        let contactData: { name?: string; phone?: string } | null = null;
        if (item.contact_id) {
          const { data: c } = await supabaseAdmin
            .from("contacts")
            .select("name, phone")
            .eq("id", item.contact_id)
            .maybeSingle();
          contactData = c;
        }

        const phone = contactData?.phone || item.mensagem_final || "";

        // Check if contact is blacklisted
        if (phone) {
          const { data: blacklisted } = await supabaseAdmin
            .from("blacklist")
            .select("id")
            .eq("telefone", phone)
            .maybeSingle();

          if (blacklisted) {
            await supabaseAdmin
              .from("disp_message_queue")
              .update({ status: "bloqueado", error_message: "Número na Blacklist" })
              .eq("id", item.id);
            continue;
          }
        }

        // Fetch WAHA config using session_id as ID or waha_session name
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.session_id);
        let config: any = null;

        if (isUuid) {
          const { data } = await supabaseAdmin
            .from("whatsapp_config")
            .select("*")
            .eq("id", item.session_id)
            .maybeSingle();
          config = data;
        }

        if (!config) {
          const { data } = await supabaseAdmin
            .from("whatsapp_config")
            .select("*")
            .eq("waha_session", item.session_id)
            .maybeSingle();
          config = data;
        }

        // Failover if selected config is missing or not in WORKING status
        let activeConfig = config;
        if (!activeConfig || activeConfig.session_status !== "WORKING") {
          const { data: workingSessions } = await supabaseAdmin
            .from("whatsapp_config")
            .select("*")
            .eq("account_id", campaign.account_id || item.account_id)
            .eq("provider", "waha")
            .eq("session_status", "WORKING");

          if (workingSessions && workingSessions.length > 0) {
            activeConfig = workingSessions[Math.floor(Math.random() * workingSessions.length)];
            console.log(`[Queue Worker] Failover session for item ${item.id}: using ${activeConfig.waha_session}`);
          }
        }

        if (!activeConfig || (activeConfig.provider && activeConfig.provider !== "waha")) {
          throw new Error(`Sessão do WhatsApp (${config?.waha_session || item.session_id}) desconectada. Reconecte a linha em Configurações > WhatsApp.`);
        }

        // Build decrypted config
        const decryptedApiKey = activeConfig.waha_api_key ? decrypt(activeConfig.waha_api_key) : null;
        const wahaConfig = {
          waha_url: activeConfig.waha_url,
          waha_session: activeConfig.waha_session,
          waha_api_key: decryptedApiKey,
        };

        // Render message
        const tipo = item.tipo || "texto";
        let messageText = item.mensagem_final || "";

        if (tipo === "ia") {
          const accountId = activeConfig.account_id;
          const { data: aiConfig } = accountId
            ? await supabaseAdmin
                .from("ai_config")
                .select("api_key")
                .eq("account_id", accountId)
                .maybeSingle()
            : { data: null };

          const activeApiKey = aiConfig?.api_key?.trim() || process.env.OPENAI_API_KEY;

          if (activeApiKey) {
            try {
              const openai = new OpenAI({ apiKey: activeApiKey });
              const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                  {
                    role: "system",
                    content: "Você é um assistente de vendas de WhatsApp. REGRA ABSOLUTA: Gere APENAS UMA única mensagem curta, direta e amigável. NUNCA gere múltiplas opções, listas, variações ou separadores como '---'. Responda exclusivamente com o texto final da mensagem a ser enviada.",
                  },
                  {
                    role: "user",
                    content: `Nome do Cliente: ${contactData?.name || "Cliente"}. Instrução: ${messageText}`,
                  },
                ],
                max_tokens: 300,
              });
              let generated = completion.choices[0]?.message?.content?.trim() || messageText;

              // Clean up any unintended multi-variations or '---' dividers if GPT returned them
              if (generated.includes("---")) {
                generated = generated.split("---")[0].trim();
              }
              if (/^(Opção|Variação|Opcao|Variacao)\s*\d+:/i.test(generated)) {
                generated = generated.replace(/^(Opção|Variação|Opcao|Variacao)\s*\d+:\s*/i, "").trim();
              }
              messageText = generated;
            } catch (aiErr) {
              console.warn("AI generation failed, fallback to prompt text:", aiErr);
            }
          }
        }

        // Substitute name variables
        const cleanText = messageText.replace(/{nome}/g, contactData?.name || "Cliente");
        const normalizedPhone = phone.replace("+", "");

        // Human simulation presence (anti-ban)
        if (tipo !== "ligacao") {
          await sendWahaSeen(wahaConfig, normalizedPhone);
          await sendWahaStartTyping(wahaConfig, normalizedPhone);
          const typingDelay = 1500 + Math.floor(Math.random() * 1500);
          await new Promise((resolve) => setTimeout(resolve, typingDelay));
        }

        // Trigger sending via WAHA or WaCalls
        let wahaMessageId = "";
        if (tipo === "imagem") {
          const res = await sendWahaMediaMessage(wahaConfig, normalizedPhone, item.media_url, "image", "imagem.png", cleanText);
          wahaMessageId = res.messageId;
        } else if (tipo === "video") {
          const res = await sendWahaMediaMessage(wahaConfig, normalizedPhone, item.media_url, "video", "video.mp4", cleanText);
          wahaMessageId = res.messageId;
        } else if (tipo === "audio") {
          const res = await sendWahaVoiceMessage(wahaConfig, normalizedPhone, item.media_url);
          wahaMessageId = res.messageId;
        } else if (tipo === "arquivo") {
          const res = await sendWahaMediaMessage(wahaConfig, normalizedPhone, item.media_url, "document", "documento", cleanText);
          wahaMessageId = res.messageId;
        } else if (tipo === "ligacao") {
          const { callId } = await startWacallsCall(wahaConfig, normalizedPhone);
          if (!callId) {
            throw new Error("Não foi possível gerar um CallID para a ligação");
          }

          let isConnected = false;
          let ended = false;

          for (let attempt = 0; attempt < 25; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            const statusRes = await getWacallsCallStatus(wahaConfig, callId);
            if (statusRes.status === "connected") {
              isConnected = true;
              break;
            }
            if (statusRes.status === "ended" || statusRes.status === "failed") {
              ended = true;
              break;
            }
          }

          if (!isConnected || ended) {
            throw new Error("A ligação não foi atendida pelo destinatário");
          }

          if (item.media_url) {
            await playWacallsAudio(wahaConfig, callId, item.media_url);
          }
        } else {
          // Default text message
          const res = await sendWahaTextMessage(wahaConfig, normalizedPhone, cleanText);
          wahaMessageId = res.messageId;
        }

        if (tipo !== "ligacao") {
          await sendWahaStopTyping(wahaConfig, normalizedPhone);
        }

        // Update queue item as sent with the actual clean sent message text
        const nowSent = new Date().toISOString();
        await supabaseAdmin
          .from("disp_message_queue")
          .update({
            status: "enviado",
            mensagem_final: cleanText,
            processed_at: nowSent,
            wamid: wahaMessageId,
            error_message: null,
          })
          .eq("id", item.id);

        // Record in conversation messages history
        let conversationId = null;
        if (item.contact_id) {
          const { data: conv } = await supabaseAdmin
            .from("conversations")
            .select("id")
            .eq("contact_id", item.contact_id)
            .maybeSingle();

          if (conv) {
            conversationId = conv.id;
          } else {
            const { data: newConv } = await supabaseAdmin
              .from("conversations")
              .insert({
                account_id: config.account_id,
                contact_id: item.contact_id,
                status: "aberta",
                whatsapp_config_id: config.id,
              })
              .select("id")
              .single();
            conversationId = newConv?.id;
          }
        }

        if (conversationId) {
          await supabaseAdmin.from("messages").insert({
            account_id: config.account_id,
            conversation_id: conversationId,
            direcao: "saida",
            mensagem: cleanText,
            status: "enviado",
            waha_message_id: wahaMessageId,
          });
        }

        // Increment campaign statistics safely
        try {
          await supabaseAdmin.rpc("increment_campaign_metric", {
            p_campaign_id: item.campaign_id,
            p_field: "total_enviados",
          });
        } catch (metricErr) {
          // Ignore if RPC doesn't exist
        }
      } catch (itemErr: any) {
        console.error(`[Queue Worker] Error processing item for campaign ${campaign.id}:`, itemErr);
        if (currentItem) {
          const currentAttempts = (currentItem.attempts || 0) + 1;

          // Attempt failover line rotation if attempts < 3 and multiple sessions exist
          let failoverHandled = false;
          if (currentAttempts < 3) {
            const { data: alternativeSessions } = await supabaseAdmin
              .from("whatsapp_config")
              .select("*")
              .eq("account_id", campaign.account_id || currentItem.account_id)
              .eq("provider", "waha")
              .eq("session_status", "WORKING")
              .neq("id", currentItem.session_id || "");

            if (alternativeSessions && alternativeSessions.length > 0) {
              const altConfig = alternativeSessions[0];
              console.log(`[Queue Worker] Failover line switch: Retrying item ${currentItem.id} on line ${altConfig.waha_session}`);
              await supabaseAdmin
                .from("disp_message_queue")
                .update({
                  session_id: altConfig.id,
                  attempts: currentAttempts,
                  error_message: `Tentativa ${currentAttempts} falhou na linha anterior (${itemErr.message}). Alternado para linha ${altConfig.waha_session}...`,
                })
                .eq("id", currentItem.id);

              failoverHandled = true;
            }
          }

          if (!failoverHandled) {
            let userFriendlyError = itemErr.message || String(itemErr);
            if (userFriendlyError.includes("463")) {
              userFriendlyError = `Erro 463 (WhatsApp): Destinatário sem conta WhatsApp ativa ou JID incompatível. Suas linhas NÃO correm risco de banimento. Detalhes: ${userFriendlyError}`;
            }

            await supabaseAdmin
              .from("disp_message_queue")
              .update({
                status: "erro",
                error_message: userFriendlyError,
                attempts: currentAttempts,
              })
              .eq("id", currentItem.id);
          }
        }
      }
    }
  } catch (err: any) {
    console.error("[Queue Worker] Error executing send in global background thread:", err);
  }
}

function checkWithinWindow(inicio: string, fim: string): boolean {
  if (!inicio || !fim) return true;
  try {
    const nowStr = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
    const now = new Date(nowStr);
    return isTimeInCampaignWindow(now, inicio, fim);
  } catch (err) {
    return true;
  }
}
