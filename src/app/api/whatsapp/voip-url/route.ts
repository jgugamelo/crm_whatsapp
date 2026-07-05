import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    url: process.env.VOIP_URL || "http://localhost:8080",
  });
}
