import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  { db: { schema: "wacrm" } }
);

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
      status: "rascunho",
    };

    const { data: createdRows, error: insertError } = await supabaseAdmin
      .from("campaigns")
      .insert(campaignData)
      .select("*");

    if (insertError) {
      console.error("[POST /api/disparador/campaigns] Insert error:", insertError);
      return NextResponse.json(
        { error: insertError.message || "Erro ao salvar campanha no banco de dados." },
        { status: 500 }
      );
    }

    const newCampaign = createdRows?.[0];

    // 2. If immediate start was requested, trigger the start route internally
    if (iniciar_imediatamente && newCampaign?.id) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        await fetch(`${appUrl}/api/disparador/campaigns/${newCampaign.id}/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
      } catch (startErr) {
        console.warn("[POST /api/disparador/campaigns] Start trigger failed:", startErr);
      }
    }

    return NextResponse.json({
      ok: true,
      campaign: newCampaign,
      message: iniciar_imediatamente
        ? "Campanha criada e disparos iniciados com sucesso! 🚀"
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
