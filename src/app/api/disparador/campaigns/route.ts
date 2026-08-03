import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { startCampaignLogic } from "@/lib/disparador/start-logic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  { db: { schema: "wacrm" } }
);

export async function GET(request: Request) {
  try {
    const supabaseUser = await createServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabaseUser.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ campaigns: [] });
    }

    const { data: campaigns, error } = await supabaseAdmin
      .from("campaigns")
      .select("*")
      .eq("account_id", profile.account_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/disparador/campaigns] Error:", error);
      return NextResponse.json({ campaigns: [] });
    }

    return NextResponse.json({ campaigns: campaigns ?? [] });
  } catch (err: any) {
    console.error("[GET /api/disparador/campaigns] Exception:", err);
    return NextResponse.json({ campaigns: [] });
  }
}

export async function POST(request: Request) {
  try {
    const supabaseUser = await createServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabaseUser.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json(
        { error: "Não autorizado. Usuário não autenticado." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      nome,
      descricao = "",
      objetivo = "",
      session_ids = [],
      tags_filtro = [],
      pipeline_id = null,
      stage_ids = [],
      mensagens = [],
      intervalo_min = 30,
      intervalo_max = 60,
      janela_inicio = "08:00",
      janela_fim = "18:00",
      max_disparos_sem_resposta = null,
      iniciar_imediatamente = true,
      account_id: providedAccountId,
    } = body;

    if (!nome || !nome.trim()) {
      return NextResponse.json(
        { error: "O nome da campanha é obrigatório." },
        { status: 400 }
      );
    }

    if (!session_ids || session_ids.length === 0) {
      return NextResponse.json(
        { error: "Selecione pelo menos uma linha do WhatsApp." },
        { status: 400 }
      );
    }

    // Resolve user's account_id reliably from profiles table using admin client
    let targetAccountId = providedAccountId;
    if (!targetAccountId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("account_id")
        .eq("user_id", user.id)
        .maybeSingle();

      targetAccountId = profile?.account_id;
    }

    if (!targetAccountId) {
      return NextResponse.json(
        { error: "Conta não encontrada para o usuário." },
        { status: 400 }
      );
    }

    // 1. Insert campaign using admin client (bypasses RLS issues)
    const campaignData = {
      account_id: targetAccountId,
      created_by: user.id,
      nome: nome.trim(),
      descricao,
      objetivo,
      session_ids,
      tags_filtro,
      pipeline_id: pipeline_id || null,
      stage_ids,
      mensagens,
      intervalo_min,
      intervalo_max,
      janela_inicio,
      janela_fim,
      max_disparos_sem_resposta: max_disparos_sem_resposta !== undefined ? max_disparos_sem_resposta : null,
      status: "rascunho",
    };

    let createdRows = null;
    let { data: firstTryRows, error: insertError } = await supabaseAdmin
      .from("campaigns")
      .insert(campaignData)
      .select("*");

    if (insertError && insertError.message?.includes("max_disparos_sem_resposta")) {
      console.warn("[POST /api/disparador/campaigns] max_disparos_sem_resposta column not found in schema cache. Retrying without it...");
      delete (campaignData as any).max_disparos_sem_resposta;
      const retry = await supabaseAdmin
        .from("campaigns")
        .insert(campaignData)
        .select("*");
      firstTryRows = retry.data;
      insertError = retry.error;
    }

    if (insertError) {
      console.error("[POST /api/disparador/campaigns] Insert error:", insertError);
      return NextResponse.json(
        { error: insertError.message || "Erro ao salvar campanha no banco de dados." },
        { status: 500 }
      );
    }

    createdRows = firstTryRows;

    const newCampaign = createdRows?.[0];

    // 2. If immediate start was requested, run start logic directly in-process
    let startMessage = "";
    if (iniciar_imediatamente && newCampaign?.id) {
      try {
        const result = await startCampaignLogic(newCampaign.id);
        startMessage = ` e ${result.enqueued} mensagens agendadas na fila! 🚀`;
      } catch (startErr: any) {
        console.warn("[POST /api/disparador/campaigns] Start logic warning:", startErr);
        startMessage = ` (Campanha criada, aviso de agendamento: ${startErr.message || "Fila não populada"})`;
      }
    }

    return NextResponse.json({
      ok: true,
      campaign: newCampaign,
      message: iniciar_imediatamente
        ? `Campanha criada${startMessage}`
        : "Campanha criada como rascunho com sucesso!",
    });
  } catch (err: any) {
    console.error("[POST /api/disparador/campaigns] Unexpected error:", err);
    return NextResponse.json(
      { error: err.message || "Erro interno ao processar campanha." },
      { status: 500 }
    );
  }
}
