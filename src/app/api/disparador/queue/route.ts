import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

import { processQueueBatch, ensureQueueWorkerRunning } from "@/lib/disparador/worker";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  { db: { schema: "wacrm" } }
);

export async function GET(request: Request) {
  try {
    ensureQueueWorkerRunning();
    processQueueBatch().catch((err) => console.error("[GET /api/disparador/queue] Worker batch error:", err));
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

    // Load recent 15 queue logs
    const { data: queueData } = await supabaseAdmin
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
      .eq("account_id", accountId)
      .order("scheduled_at", { ascending: false })
      .limit(15);

    const contactIds = Array.from(new Set((queueData ?? []).map((q) => q.contact_id).filter(Boolean)));
    const campaignIds = Array.from(new Set((queueData ?? []).map((q) => q.campaign_id).filter(Boolean)));

    const { data: contactsList } = contactIds.length > 0
      ? await supabaseAdmin.from("contacts").select("id, name, phone").in("id", contactIds)
      : { data: [] };

    const { data: campaignsList } = campaignIds.length > 0
      ? await supabaseAdmin.from("campaigns").select("id, nome").in("id", campaignIds)
      : { data: [] };

    const contactsMap: Record<string, any> = Object.fromEntries((contactsList ?? []).map((c) => [c.id, c]));
    const campaignsMap: Record<string, any> = Object.fromEntries((campaignsList ?? []).map((c) => [c.id, c]));

    const mappedQueue = (queueData ?? []).map((q) => ({
      id: q.id,
      campaign_id: q.campaign_id,
      mensagem_final: q.mensagem_final,
      status: q.status,
      scheduled_at: q.scheduled_at,
      sent_at: q.processed_at,
      erro: q.error_message,
      contacts: contactsMap[q.contact_id]
        ? { nome: contactsMap[q.contact_id].name, phone: contactsMap[q.contact_id].phone }
        : undefined,
      campaigns: campaignsMap[q.campaign_id]
        ? { nome: campaignsMap[q.campaign_id].nome }
        : undefined,
    }));

    // Stats calculation
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
    console.error("[GET /api/disparador/queue] Error:", err);
    return NextResponse.json({ queue: [], stats: { scheduled: 0, sending: 0, success: 0, failed: 0 } });
  }
}
