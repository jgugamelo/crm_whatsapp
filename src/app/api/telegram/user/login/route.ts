import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { loginTelegramWithCode } from '@/lib/telegram/telegram-user-api';

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { db: { schema: 'wacrm' } }
);

async function getAccountId(supabase: any, userId: string): Promise<string> {
  try {
    const { data: pAdmin } = await supabaseAdmin
      .from('profiles')
      .select('account_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (pAdmin?.account_id) return pAdmin.account_id;

    const { data: pUser } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (pUser?.account_id) return pUser.account_id;
  } catch (err) {
    console.error('[telegram/login] Error resolving accountId:', err);
  }
  return userId;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accountId = await getAccountId(supabase, user.id);

    const body = await request.json().catch(() => ({}));
    const { phone_number, code, password, api_id, api_hash } = body;

    if (!phone_number || !code) {
      return NextResponse.json({ error: 'Número de telefone e Código são obrigatórios.' }, { status: 400 });
    }

    const res = await loginTelegramWithCode(phone_number.trim(), code.trim(), password ? String(password).trim() : undefined, api_id, api_hash);

    // Save into wacrm.telegram_user_sessions
    const { data: existing } = await supabaseAdmin
      .from('telegram_user_sessions')
      .select('id')
      .eq('account_id', accountId)
      .eq('phone_number', phone_number.trim())
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from('telegram_user_sessions')
        .update({
          session_string: res.sessionString,
          telegram_user_id: res.telegramUserId,
          first_name: res.firstName,
          username: res.username,
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabaseAdmin
        .from('telegram_user_sessions')
        .insert({
          account_id: accountId,
          phone_number: phone_number.trim(),
          session_string: res.sessionString,
          telegram_user_id: res.telegramUserId,
          first_name: res.firstName,
          username: res.username,
          status: 'active',
        });
    }

    return NextResponse.json({
      success: true,
      user: {
        firstName: res.firstName,
        username: res.username,
        phoneNumber: phone_number,
      },
    });
  } catch (err: any) {
    console.error('[POST /api/telegram/user/login] Error:', err);
    if (err.message === 'PASSWORD_NEEDED') {
      return NextResponse.json({ error: 'Sua conta possui verificação em duas etapas (2FA). Insira a sua senha do Telegram.', passwordNeeded: true }, { status: 400 });
    }
    return NextResponse.json({ error: err.message || 'Código inválido ou expirado.' }, { status: 400 });
  }
}
