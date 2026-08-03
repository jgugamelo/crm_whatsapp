import { createClient } from "@supabase/supabase-js";
import { ensureQueueWorkerRunning } from "@/lib/disparador/worker";
import { getNextValidWindowTime } from "@/lib/disparador/window-helper";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  { db: { schema: "wacrm" } }
);

export async function startCampaignLogic(campaignId: string) {
  ensureQueueWorkerRunning();
  const now = new Date().toISOString();

  // 1. Fetch Campaign configuration
  const { data: campaign, error: campaignError } = await supabaseAdmin
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    throw new Error("Campanha não encontrada no banco de dados.");
  }

  const mensagens = Array.isArray(campaign.mensagens) ? campaign.mensagens : [];
  if (mensagens.length === 0) {
    throw new Error("Campanha sem mensagens configuradas.");
  }

  const sessionIds = Array.isArray(campaign.session_ids) ? campaign.session_ids : [];
  if (sessionIds.length === 0) {
    throw new Error("Campanha sem sessões de WhatsApp selecionadas.");
  }

  // 2. Remove previously non-completed queue items (including paused/canceled) to prevent duplicate rows
  await supabaseAdmin
    .from("disp_message_queue")
    .delete()
    .eq("campaign_id", campaignId)
    .in("status", ["pendente", "agendado", "erro", "pausado", "cancelado"]);

  // 3. Load active contacts belonging to this account
  const { data: rawContacts, error: contactsError } = await supabaseAdmin
    .from("contacts")
    .select("*")
    .eq("account_id", campaign.account_id);

  if (contactsError) {
    throw new Error(`Erro ao carregar contatos do CRM: ${contactsError.message}`);
  }

  if (!rawContacts || rawContacts.length === 0) {
    throw new Error("Nenhum contato ativo encontrado no CRM para este disparo.");
  }

  const allContacts = rawContacts.map((c: any) => ({
    id: c.id,
    name: c.name || c.nome || "Cliente",
    phone: c.phone || c.telefone || "",
  }));

  // Load contact tags relation
  const { data: tagsList } = await supabaseAdmin
    .from("contact_tags")
    .select("contact_id, tags:tag_id(name)");

  const tagsMap: Record<string, string[]> = {};
  if (tagsList) {
    for (const item of tagsList) {
      if (!item.contact_id) continue;
      const tagName = (item.tags as any)?.name;
      if (tagName) {
        if (!tagsMap[item.contact_id]) {
          tagsMap[item.contact_id] = [];
        }
        tagsMap[item.contact_id].push(tagName);
      }
    }
  }

  // Map tags to contacts in memory
  const contactsWithTags = allContacts.map((c) => ({
    ...c,
    tags: tagsMap[c.id] || [],
  }));

  // Pipeline Stage filtering
  const stageIds = Array.isArray(campaign.stage_ids) ? campaign.stage_ids : [];
  const pipelineId = campaign.pipeline_id;

  let dealContactIdsSet: Set<string> | null = null;
  if (stageIds.length > 0 || pipelineId) {
    let dealsQuery = supabaseAdmin
      .from("deals")
      .select("contact_id")
      .eq("account_id", campaign.account_id);

    if (stageIds.length > 0) {
      dealsQuery = dealsQuery.in("stage_id", stageIds);
    } else if (pipelineId) {
      dealsQuery = dealsQuery.eq("pipeline_id", pipelineId);
    }

    const { data: dealsList, error: dealsError } = await dealsQuery;
    if (dealsError) {
      throw new Error(`Erro ao carregar oportunidades do funil: ${dealsError.message}`);
    }

    dealContactIdsSet = new Set((dealsList ?? []).map((d) => d.contact_id).filter(Boolean));
  }

  // Filter contacts by tag
  const tagsFiltro = Array.isArray(campaign.tags_filtro) ? campaign.tags_filtro : [];
  let contacts = contactsWithTags;

  if (tagsFiltro.length > 0) {
    contacts = contacts.filter((c) => {
      const contactTags = Array.isArray(c.tags) ? c.tags : [];
      return tagsFiltro.some((t: string) => contactTags.includes(t));
    });
  }

  if (dealContactIdsSet !== null) {
    contacts = contacts.filter((c) => dealContactIdsSet!.has(c.id));
  }

  if (contacts.length === 0) {
    throw new Error("Nenhum contato encontrado com os filtros de tags e funil selecionados.");
  }

  // Exclude contacts that ALREADY received messages for this campaign (prevent duplicates upon restart/edit)
  const { data: sentQueueItems } = await supabaseAdmin
    .from("disp_message_queue")
    .select("contact_id")
    .eq("campaign_id", campaignId)
    .eq("status", "enviado");

  const sentContactIdsSet = new Set((sentQueueItems ?? []).map((s) => s.contact_id).filter(Boolean));

  const { data: sentLogItems } = await supabaseAdmin
    .from("message_logs")
    .select("contact_id")
    .eq("campaign_id", campaignId)
    .eq("status", "enviado");

  if (sentLogItems) {
    sentLogItems.forEach((l) => {
      if (l.contact_id) sentContactIdsSet.add(l.contact_id);
    });
  }

  if (sentContactIdsSet.size > 0) {
    const totalBefore = contacts.length;
    contacts = contacts.filter((c) => !sentContactIdsSet.has(c.id));
    console.log(`[startCampaignLogic] Skipped ${sentContactIdsSet.size} already-sent contacts. Remaining: ${contacts.length} of ${totalBefore}`);
  }

  // Apply Anti-Ban Risk Filter: Exclude contacts who have received X or more broadcasts without ever replying
  const maxDisparos = campaign.max_disparos_sem_resposta !== undefined && campaign.max_disparos_sem_resposta !== null
    ? Number(campaign.max_disparos_sem_resposta)
    : null;

  if (maxDisparos !== null && maxDisparos > 0 && contacts.length > 0) {
    const contactIdsList = contacts.map((c) => c.id);

    // Fetch previous broadcasts sent per contact
    const { data: previousBroadcasts } = await supabaseAdmin
      .from("disp_message_queue")
      .select("contact_id")
      .in("contact_id", contactIdsList)
      .eq("status", "enviado");

    const broadcastCountMap: Record<string, number> = {};
    (previousBroadcasts ?? []).forEach((row) => {
      if (row.contact_id) {
        broadcastCountMap[row.contact_id] = (broadcastCountMap[row.contact_id] || 0) + 1;
      }
    });

    // Fetch contacts that have ever sent a customer reply message in conversations
    const { data: repliedMessages } = await supabaseAdmin
      .from("messages")
      .select("conversations!inner(contact_id)")
      .eq("direcao", "entrada");

    const repliedContactIdsSet = new Set<string>();
    (repliedMessages ?? []).forEach((row: any) => {
      const cId = row.conversations?.contact_id;
      if (cId) repliedContactIdsSet.add(cId);
    });

    const beforeRiskFilter = contacts.length;
    contacts = contacts.filter((c) => {
      // If contact has ever replied to us, they are engaged and safe!
      if (repliedContactIdsSet.has(c.id)) return true;

      // Otherwise check if total unanswered broadcasts received is less than maxDisparos limit
      const countSent = broadcastCountMap[c.id] || 0;
      return countSent < maxDisparos;
    });

    console.log(`[startCampaignLogic] Anti-ban risk filter applied (max ${maxDisparos} unanswered broadcasts). Excluded ${beforeRiskFilter - contacts.length} high-risk contacts. Remaining: ${contacts.length}`);
  }

  if (contacts.length === 0) {
    await supabaseAdmin
      .from("campaigns")
      .update({ status: "encerrada", updated_at: now })
      .eq("id", campaignId);
    throw new Error("Todos os contatos filtrados desta campanha já receberam as mensagens ou excederam o limite de risco anti-ban.");
  }

  // Fetch Blacklist to skip (filtered by account)
  const { data: blacklist } = await supabaseAdmin
    .from("blacklist")
    .select("telefone")
    .eq("account_id", campaign.account_id);
  const blacklistSet = new Set((blacklist ?? []).map((b) => b.telefone));

  // Fetch active connected whatsapp_config sessions to prefer connected lines
  const { data: activeConfigs } = await supabaseAdmin
    .from("whatsapp_config")
    .select("id, waha_session, session_status")
    .eq("account_id", campaign.account_id)
    .eq("provider", "waha");

  const workingSessionIds: string[] = [];
  if (activeConfigs) {
    for (const conf of activeConfigs) {
      if (conf.session_status === "WORKING") {
        if (sessionIds.includes(conf.id)) workingSessionIds.push(conf.id);
        if (conf.waha_session && sessionIds.includes(conf.waha_session)) workingSessionIds.push(conf.waha_session);
      }
    }
  }

  const usableSessions = workingSessionIds.length > 0 ? workingSessionIds : sessionIds;

  // 4. Scheduling queue generation loop
  const minDelay = (campaign.intervalo_min || 30) * 1000;
  const maxDelay = (campaign.intervalo_max || 60) * 1000;
  const intraDelay = 3000; // 3 seconds between sequential messages for the same contact

  const janelaInicio = campaign.janela_inicio || "08:00";
  const janelaFim = campaign.janela_fim || "20:00";

  let currentScheduleDate = getNextValidWindowTime(new Date(), janelaInicio, janelaFim);
  let enqueued = 0;
  const queueRows = [];

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];

    // Skip if phone is blacklisted
    if (contact.phone && blacklistSet.has(contact.phone)) continue;

    // Select random session ID from campaign configurations
    const sessionId = usableSessions[Math.floor(Math.random() * usableSessions.length)];

    // Anti-spam pauses
    if (i > 0 && i % 100 === 0) {
      currentScheduleDate = new Date(currentScheduleDate.getTime() + 60 * 60 * 1000);
      currentScheduleDate = getNextValidWindowTime(currentScheduleDate, janelaInicio, janelaFim);
    } else if (i > 0 && i % 20 === 0) {
      currentScheduleDate = new Date(currentScheduleDate.getTime() + 10 * 60 * 1000);
      currentScheduleDate = getNextValidWindowTime(currentScheduleDate, janelaInicio, janelaFim);
    }

    for (let j = 0; j < mensagens.length; j++) {
      const msg = mensagens[j];
      currentScheduleDate = getNextValidWindowTime(currentScheduleDate, janelaInicio, janelaFim);
      const scheduledAt = currentScheduleDate.toISOString();

      // Interpolate message variables
      const rawText = msg.conteudo || msg.prompt || "";
      const firstName = (contact.name || "Cliente").split(" ")[0];
      const interpolatedText = rawText
        .replace(/{nome}/g, contact.name || "Cliente")
        .replace(/{name}/g, contact.name || "Cliente")
        .replace(/{primeiro_nome}/g, firstName)
        .replace(/{telefone}/g, contact.phone || "")
        .replace(/{phone}/g, contact.phone || "");

      queueRows.push({
        account_id: campaign.account_id,
        campaign_id: campaignId,
        contact_id: contact.id,
        session_id: sessionId,
        mensagem_final: interpolatedText,
        status: "agendado",
        tipo: msg.tipo || "texto",
        media_url: msg.url || null,
        scheduled_at: scheduledAt,
      });
      enqueued++;

      if (j < mensagens.length - 1) {
        currentScheduleDate = new Date(currentScheduleDate.getTime() + intraDelay);
      }
    }

    // Increment delay for the next contact and clamp to valid window
    const nextRandomDelay = minDelay + Math.random() * (maxDelay - minDelay);
    currentScheduleDate = new Date(currentScheduleDate.getTime() + nextRandomDelay);
    currentScheduleDate = getNextValidWindowTime(currentScheduleDate, janelaInicio, janelaFim);
  }

  if (queueRows.length > 0) {
    // Chunk insertions to prevent payload size limits
    const chunkSize = 500;
    for (let k = 0; k < queueRows.length; k += chunkSize) {
      const chunk = queueRows.slice(k, k + chunkSize);
      const { error: insertError } = await supabaseAdmin
        .from("disp_message_queue")
        .insert(chunk);
      if (insertError) throw insertError;
    }
  }

  // 5. Update campaign status to 'em_execucao' (In execution)
  const { error: statusErr } = await supabaseAdmin
    .from("campaigns")
    .update({ status: "em_execucao", updated_at: now })
    .eq("id", campaignId);

  if (statusErr) {
    console.error("[startCampaignLogic] Error updating campaign status:", statusErr);
  }

  // Update Metrics
  await supabaseAdmin
    .from("campaign_metrics")
    .upsert(
      {
        campaign_id: campaignId,
        total_contatos: contacts.length,
      },
      { onConflict: "campaign_id" }
    );

  // Trigger worker check immediately
  ensureQueueWorkerRunning();

  return { success: true, enqueued };
}
