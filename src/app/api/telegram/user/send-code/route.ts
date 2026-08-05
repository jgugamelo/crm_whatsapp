import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendTelegramPhoneCode } from '@/lib/telegram/telegram-user-api';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { phone_number, api_id, api_hash } = body;

    if (!phone_number || typeof phone_number !== 'string' || !phone_number.trim()) {
      return NextResponse.json({ error: 'Número de telefone é obrigatório com DDD (ex: +5521999999999).' }, { status: 400 });
    }

    const res = await sendTelegramPhoneCode(phone_number.trim(), api_id, api_hash);

    return NextResponse.json({
      success: true,
      phoneCodeHash: res.phoneCodeHash,
    });
  } catch (err: any) {
    console.error('[POST /api/telegram/user/send-code] Error:', err);
    return NextResponse.json({ error: err.message || 'Erro ao enviar código do Telegram' }, { status: 500 });
  }
}
