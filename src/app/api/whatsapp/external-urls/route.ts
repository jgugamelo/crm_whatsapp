import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    disparadorUrl: process.env.DISPARADOR_URL || "https://zucchini-optimism-production-68a0.up.railway.app",
    leadExtractorUrl: process.env.LEAD_EXTRACTOR_URL || "https://grupoddmlead.lovable.app",
  });
}
