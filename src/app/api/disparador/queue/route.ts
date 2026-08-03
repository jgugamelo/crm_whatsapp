import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

import { processQueueBatch, ensureQueueWorkerRunning } from "@/lib/disparador/worker";
import { getNextValidWindowTime } from "@/lib/disparador/window-helper";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  { db: { schema: "wacrm" } }
);

/**
 * Auto-corrects any `agendado` items in queue whose scheduled_at falls outside campaign sending window.
 */
async function sanitizeQueueScheduledTimes(accountId: string) {
  try {
    const { data: activeCampaigns } = await supabaseAdmin
      .from("campaigns")
      .select("id, janela_inicio, janela_fim")
      .eq("account_id", accountId)
      .eq("status", "em_execucao");

    if (!activeCampaigns || activeCampaigns.length === 0) return;

    for (const campaign of activeCampaigns) {
      const janelaInicio = campaign.janela_inicio || "08:00";
      const janelaFim = campaign.janela_fim || "20:00";

      const { data: queueItems } = await supabaseAdmin
        .from("disp_message_queue")
        .select("id, scheduled_at")
        .eq("campaign_id", campaign.id)
        .eq("status", "agendado")
        .order("scheduled_at", { ascending: true })
        .limit(1000);

      if (!queueItems || queueItems.length === 0) continue;

      let currentScheduleDate = getNextValidWindowTime(new Date(), janelaInicio, janelaFim);
      const updates: { id: string; scheduled_at: string }[] = [];

      for (const item of queueItems) {
        const itemDate = new Date(item.scheduled_at);
        const validTime = getNextValidWindowTime(itemDate, janelaInicio, janelaFim);

        // If scheduled_at is outside valid window (e.g., 04:25 AM when window is 08:00 - 20:00)
        if (validTime.getTime() > itemDate.getTime()) {
          currentScheduleDate = getNextValidWindowTime(currentScheduleDate, janelaInicio, janelaFim);
          updates.push({
            id: item.id,
            scheduled_at: currentScheduleDate.toISOString(),
          });
          currentScheduleDate = new Date(currentScheduleDate.getTime() + 35000); // 35s average interval
        }
      }

      if (updates.length > 0) {
        console.log(`[sanitizeQueueScheduledTimes] Rescheduling ${updates.length} night/out-of-window items for campaign ${campaign.id}`);
        for (const u of updates) {
          await supabaseAdmin
            .from("disp_message_queue")
            .update({ scheduled_at: u.scheduled_at })
            .eq("id", u.id);
        }
      }
    }
  } catch (err) {
    console.error("[sanitizeQueueScheduledTimes] Warning:", err);
  }
}

function extractContactNameFromMessage(text: string): string | null {
  if (!text) return null;
  // Match patterns like "PARABÉNS, ROSILENE RODRIGUES CASTELLO BRANCO!" or "Olá ROSILENE!"
  const match = text.match(/(?:PARABÉNS,?\s+|Olá,?\s+|Oi,?\s+|Prezado\(a\),?\s+)([A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç\s]{3,50})(?:!|\.|\n|$)/i);
  if (match && match[1]) {
    const candidate = match[1].trim();
    if (candidate.length >= 3 && !candidate.toLowerCase().includes("você") && !candidate.toLowerCase().includes("seja")) {
      return candidate;
    }
  }
  return null;
}

export async function GET(request: Request) {
  try {
    ensureQueueWorkerRunning();
    processQueueBatch().catch((err) => console.error("[GET /api/disparador/queue] Worker batch error:", err));

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const limitParam = parseInt(searchParams.get("limit") || "500", 10);
    const limit = Math.min(Math.max(limitParam, 10), 1000);

    const supabaseUser = await createServerClient();
    const {
      data: { user },
    } = await supabaseUser.auth.getUser();

    if (!user) {
      return NextResponse.json({ queue: [], stats: { scheduled: 0, sending: 0, success: 0, failed: 0 } });
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ queue: [], stats: { scheduled: 0, sending: 0, success: 0, failed: 0 } });
    }

    const accountId = profile.account_id;

    // Self-healing check for invalid night-scheduled items
    await sanitizeQueueScheduledTimes(accountId);

    // Base query for queue items
    let query = supabaseAdmin
      .from("disp_message_queue")
      .select(`
        id,
        campaign_id,
        mensagem_final,
        status,
        scheduled_at,
        processed_at,
        error_message,
        contact_id
      `)
      .eq("account_id", accountId);

    if (statusParam && statusParam !== "todos") {
      if (statusParam === "enviando") {
        query = query.in("status", ["enviando", "pendente"]);
      } else {
        query = query.eq("status", statusParam);
      }
    }

    // Load queue logs with configurable limit up to 1000 items
    const { data: queueData } = await query
      .order("scheduled_at", { ascending: false })
      .limit(limit);

    // Load ALL contacts belonging to this account to guarantee 100% resolution by ID or Name
    const { data: allAccountContacts } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("account_id", accountId);

    const contactsMap: Record<string, any> = {};
    const contactsByNameMap: Record<string, any> = {};

    (allAccountContacts ?? []).forEach((c: any) => {
      const formatted = {
        id: c.id,
        nome: c.name || c.nome || c.full_name || "Contato",
        phone: c.phone || c.telefone || c.number || "Sem Número",
        email: c.email || "",
      };
      if (c.id) contactsMap[c.id] = formatted;
      if (formatted.nome && formatted.nome !== "Contato") {
        contactsByNameMap[formatted.nome.trim().toLowerCase()] = formatted;
      }
    });

    // Also fetch by contactIds if any exist outside account_id filter
    const contactIds = Array.from(new Set((queueData ?? []).map((q) => q.contact_id).filter(Boolean)));
    const missingIds = contactIds.filter((id) => !contactsMap[id]);

    if (missingIds.length > 0) {
      const { data: extraContacts } = await supabaseAdmin
        .from("contacts")
        .select("*")
        .in("id", missingIds);

      (extraContacts ?? []).forEach((c: any) => {
        const formatted = {
          id: c.id,
          nome: c.name || c.nome || c.full_name || "Contato",
          phone: c.phone || c.telefone || c.number || "Sem Número",
          email: c.email || "",
        };
        if (c.id) contactsMap[c.id] = formatted;
        if (formatted.nome && formatted.nome !== "Contato") {
          contactsByNameMap[formatted.nome.trim().toLowerCase()] = formatted;
        }
      });
    }

    const campaignIds = Array.from(new Set((queueData ?? []).map((q) => q.campaign_id).filter(Boolean)));
    const { data: campaignsList } = campaignIds.length > 0
      ? await supabaseAdmin.from("campaigns").select("id, nome").in("id", campaignIds)
      : { data: [] };
    const campaignsMap: Record<string, any> = Object.fromEntries((campaignsList ?? []).map((c) => [c.id, c]));

    const mappedQueue = (queueData ?? []).map((q) => {
      const extractedName = extractContactNameFromMessage(q.mensagem_final);
      let contactObj = contactsMap[q.contact_id];

      // If contactObj is missing by ID, try matching by extracted name
      if (!contactObj && extractedName) {
        contactObj = contactsByNameMap[extractedName.trim().toLowerCase()];
      }

      const resolvedName = (contactObj?.nome && contactObj.nome !== "Contato")
        ? contactObj.nome
        : (extractedName || contactObj?.nome || "Contato");

      const resolvedPhone = (contactObj?.phone && contactObj.phone !== "Sem Número")
        ? contactObj.phone
        : (contactObj?.phone || "Sem Número");

      return {
        id: q.id,
        campaign_id: q.campaign_id,
        contact_id: q.contact_id || contactObj?.id,
        mensagem_final: q.mensagem_final,
        status: q.status,
        scheduled_at: q.scheduled_at,
        sent_at: q.processed_at,
        erro: q.error_message,
        contacts: {
          id: q.contact_id || contactObj?.id || "",
          nome: resolvedName,
          phone: resolvedPhone,
          email: contactObj?.email || "",
        },
        campaigns: campaignsMap[q.campaign_id]
          ? { id: campaignsMap[q.campaign_id].id, nome: campaignsMap[q.campaign_id].nome }
          : undefined,
      };
    });

    // Stats calculation across all queue messages
    const { data: allStats } = await supabaseAdmin
      .from("disp_message_queue")
      .select("status")
      .eq("account_id", accountId);

    const stats = { scheduled: 0, sending: 0, success: 0, failed: 0 };
    (allStats ?? []).forEach((item) => {
      if (item.status === "agendado") stats.scheduled++;
      else if (item.status === "enviando" || item.status === "pendente") stats.sending++;
      else if (item.status === "enviado") stats.success++;
      else if (item.status === "erro") stats.failed++;
    });

    return NextResponse.json({ queue: mappedQueue, stats });
  } catch (err: any) {
    console.error("Error in GET /api/disparador/queue:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabaseUser = await createServerClient();
    const {
      data: { user },
    } = await supabaseUser.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { queueId } = await request.json();
    if (!queueId) {
      return NextResponse.json({ error: "queueId is required" }, { status: 400 });
    }

    // Reset failed or pending item back to agendado
    const { error } = await supabaseAdmin
      .from("disp_message_queue")
      .update({
        status: "agendado",
        error_message: null,
        processed_at: null,
        scheduled_at: new Date().toISOString(),
      })
      .eq("id", queueId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Trigger queue worker immediately
    processQueueBatch().catch((err) => console.error("[POST /api/disparador/queue] Retry worker error:", err));

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error in POST /api/disparador/queue (retry):", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
