import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { startCampaignLogic } from "@/lib/disparador/start-logic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  { db: { schema: "wacrm" } }
);

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await supabaseAdmin.from("campaigns").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Erro ao deletar" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const {
      nome,
      descricao,
      objetivo,
      session_ids,
      tags_filtro,
      pipeline_id,
      stage_ids,
      mensagens,
      intervalo_min,
      intervalo_max,
      janela_inicio,
      janela_fim,
      max_disparos_sem_resposta,
      iniciar_imediatamente,
    } = body;

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (nome !== undefined) updates.nome = nome;
    if (descricao !== undefined) updates.descricao = descricao;
    if (objetivo !== undefined) updates.objetivo = objetivo;
    if (session_ids !== undefined) updates.session_ids = session_ids;
    if (tags_filtro !== undefined) updates.tags_filtro = tags_filtro;
    if (pipeline_id !== undefined) updates.pipeline_id = pipeline_id;
    if (stage_ids !== undefined) updates.stage_ids = stage_ids;
    if (mensagens !== undefined) updates.mensagens = mensagens;
    if (intervalo_min !== undefined) updates.intervalo_min = intervalo_min;
    if (intervalo_max !== undefined) updates.intervalo_max = intervalo_max;
    if (janela_inicio !== undefined) updates.janela_inicio = janela_inicio;
    if (janela_fim !== undefined) updates.janela_fim = janela_fim;
    if (max_disparos_sem_resposta !== undefined) updates.max_disparos_sem_resposta = max_disparos_sem_resposta;

    const { data: updatedCampaign, error } = await supabaseAdmin
      .from("campaigns")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    let startResult = null;
    if (iniciar_imediatamente) {
      startResult = await startCampaignLogic(id);
    }

    return NextResponse.json({
      ok: true,
      message: iniciar_imediatamente
        ? "Campanha atualizada e reativada com sucesso!"
        : "Campanha atualizada com sucesso!",
      campaign: updatedCampaign,
      startResult,
    });
  } catch (err: any) {
    console.error("[PUT /api/disparador/campaigns/[id]] Error:", err);
    return NextResponse.json({ error: err.message || "Erro ao atualizar campanha" }, { status: 500 });
  }
}
