import { createClient } from "@supabase/supabase-js";
import { sendWahaTextMessage, sendWahaMediaMessage } from "@/lib/whatsapp/waha-api";
import OpenAI from "openai";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  { db: { schema: "wacrm" } }
);

let isWorkerRunning = false;
let intervalId: NodeJS.Timeout | null = null;

export function ensureQueueWorkerRunning() {
  if (isWorkerRunning) {
    return;
  }
  isWorkerRunning = true;
  console.log("[Queue Worker] Global background queue worker initialized.");

  // Check queue every 5 seconds
  intervalId = setInterval(async () => {
    try {
      // 1. Fetch campaigns that are in execution
      const { data: activeCampaigns } = await supabaseAdmin
        .from("campaigns")
        .select("id, status, created_by, janela_inicio, janela_fim")
        .eq("status", "em_execucao");

      if (!activeCampaigns || activeCampaigns.length === 0) {
        return;
      }

      for (const campaign of activeCampaigns) {
        // Validate time window
        if (
          campaign.janela_inicio &&
          campaign.janela_fim &&
          campaign.janela_inicio !== "00:00" &&
          campaign.janela_fim !== "23:59"
        ) {
          const isWithinWindow = checkWithinWindow(campaign.janela_inicio, campaign.janela_fim);
          if (!isWithinWindow) {
            continue; // Skip this campaign for now
          }
        }

        // Fetch the next scheduled item from queue for this campaign
        const now = new Date().toISOString();
        const { data: item, error: queryError } = await supabaseAdmin
          .from("disp_message_queue")
          .select("*, contacts(name, phone)")
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

        // Lock item to prevent concurrent process
        await supabaseAdmin
          .from("disp_message_queue")
          .update({ status: "enviando" })
          .eq("id", item.id);

        console.log(`[Queue Worker] Processing scheduled item ${item.id} for campaign ${campaign.id}`);

        // Check if contact is blacklisted
        const phone = item.contacts?.phone || item.mensagem_final;
        const { data: blacklisted } = await supabaseAdmin
          .from("blacklist")
          .select("id")
          .eq("telefone", phone)
          .maybeSingle();

        if (blacklisted) {
          await supabaseAdmin
            .from("disp_message_queue")
            .update({ status: "bloqueado", erro: "Número na Blacklist" })
            .eq("id", item.id);
          continue;
        }

        // Fetch profiles to resolve Account ID
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("account_id")
          .eq("user_id", campaign.created_by)
          .maybeSingle();

        const accountId = profile?.account_id;
        if (!accountId) {
          throw new Error("Campaign creator is not associated with an account");
        }

        // Fetch WAHA config
        const { data: config } = await supabaseAdmin
          .from("whatsapp_config")
          .select("*")
          .eq("account_id", accountId)
          .maybeSingle();

        if (!config || config.provider !== "waha") {
          throw new Error("WhatsApp WAHA connection is not active or configured");
        }

        // Render message
        const tipo = item.tipo || "texto";
        let messageText = item.mensagem_final;

        if (tipo === "ia" && process.env.OPENAI_API_KEY) {
          try {
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            const completion = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: "Você é um assistente de vendas para WhatsApp. Gere uma mensagem natural, sem parecer spam. Responda APENAS com a mensagem, sem explicações.",
                },
                {
                  role: "user",
                  content: `Contato: nome=${item.contacts?.name || ""}. Prompt: ${messageText}`,
                },
              ],
              max_tokens: 500,
            });
            messageText = completion.choices[0]?.message?.content || messageText;
          } catch (aiErr) {
            console.warn("AI generation failed, fallback to prompt text:", aiErr);
          }
        }

        // Substitute name variable
        const cleanText = messageText.replace(/{nome}/g, item.contacts?.name || "Cliente");
        const normalizedPhone = phone.replace("+", "");

        // Trigger sending via WAHA
        let wahaMessageId = "";
        if (tipo === "imagem") {
          const res = await sendWahaMediaMessage(config, normalizedPhone, item.media_url, "image", "imagem.png", cleanText);
          wahaMessageId = res.messageId;
        } else if (tipo === "video") {
          const res = await sendWahaMediaMessage(config, normalizedPhone, item.media_url, "video", "video.mp4", cleanText);
          wahaMessageId = res.messageId;
        } else if (tipo === "audio") {
          const res = await sendWahaMediaMessage(config, normalizedPhone, item.media_url, "audio", "audio.ogg");
          wahaMessageId = res.messageId;
        } else if (tipo === "arquivo") {
          const res = await sendWahaMediaMessage(config, normalizedPhone, item.media_url, "document", "documento", cleanText);
          wahaMessageId = res.messageId;
        } else {
          const res = await sendWahaTextMessage(config, normalizedPhone, cleanText);
          wahaMessageId = res.messageId;
        }

        // Update queue item status to success
        await supabaseAdmin
          .from("disp_message_queue")
          .update({
            status: "enviado",
            sent_at: new Date().toISOString(),
            waha_message_id: wahaMessageId,
            tentativas: (item.tentativas || 0) + 1,
          })
          .eq("id", item.id);

        // Log in message logs
        await supabaseAdmin.from("message_logs").insert({
          queue_id: item.id,
          campaign_id: item.campaign_id,
          contact_id: item.contact_id,
          session_id: item.session_id,
          direcao: "saida",
          mensagem: cleanText,
          status: "enviado",
          waha_message_id: wahaMessageId,
        });

        // Increment campaign statistics
        await supabaseAdmin.rpc("increment_campaign_metric", {
          p_campaign_id: item.campaign_id,
          p_field: "total_enviados",
        });
      }
    } catch (err: any) {
      console.error("[Queue Worker] Error executing send in global background thread:", err);
    }
  }, 5000); // Check every 5 seconds
}

function checkWithinWindow(inicio: string, fim: string): boolean {
  const now = new Date();
  const [hInicio, mInicio] = inicio.split(":").map(Number);
  const [hFim, mFim] = fim.split(":").map(Number);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return nowMinutes >= hInicio * 60 + mInicio && nowMinutes <= hFim * 60 + mFim;
}
