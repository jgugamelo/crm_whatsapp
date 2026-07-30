import { NextResponse } from "next/server";
import { startCampaignLogic } from "@/lib/disparador/start-logic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;
    const result = await startCampaignLogic(campaignId);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[Campaign Start] Failed to schedule queue:", err);
    return NextResponse.json({ error: err.message || "Erro ao iniciar campanha" }, { status: 500 });
  }
}
