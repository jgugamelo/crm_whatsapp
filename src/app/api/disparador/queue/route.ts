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

    const contactIds = Array.from(new Set((queueData ?? []).map((q) => q.contact_id).filter(Boolean)));
    const campaignIds = Array.from(new Set((queueData ?? []).map((q) => q.campaign_id).filter(Boolean)));

    const { data: contactsList } = contactIds.length > 0
      ? await supabaseAdmin.from("contacts").select("id, name, phone, email").in("id", contactIds)
      : { data: [] };

    const { data: campaignsList } = campaignIds.length > 0
      ? await supabaseAdmin.from("campaigns").select("id, nome").in("id", campaignIds)
      : { data: [] };

    const contactsMap: Record<string, any> = Object.fromEntries((contactsList ?? []).map((c) => [c.id, c]));
    const campaignsMap: Record<string, any> = Object.fromEntries((campaignsList ?? []).map((c) => [c.id, c]));

    const mappedQueue = (queueData ?? []).map((q) => ({
      id: q.id,
      campaign_id: q.campaign_id,
      contact_id: q.contact_id,
      mensagem_final: q.mensagem_final,
      status: q.status,
      scheduled_at: q.scheduled_at,
      sent_at: q.processed_at,
      erro: q.error_message,
      contacts: contactsMap[q.contact_id]
        ? { id: contactsMap[q.contact_id].id, nome: contactsMap[q.contact_id].name, phone: contactsMap[q.contact_id].phone, email: contactsMap[q.contact_id].email }
        : undefined,
      campaigns: campaignsMap[q.campaign_id]
        ? { id: campaignsMap[q.campaign_id].id, nome: campaignsMap[q.campaign_id].nome }
        : undefined,
    }));

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
