import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getTelegramBotInfo, setTelegramWebhook } from '@/lib/telegram/telegram-api';

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { db: { schema: 'wacrm' } }
);

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No account linked' }, { status: 403 });
    }

    const { data: configs } = await supabaseAdmin
      .from('telegram_config')
      .select('id, bot_name, bot_username, status, created_at')
      .eq('account_id', profile.account_id);

    return NextResponse.json({ configs: configs ?? [] });
  } catch (err: any) {
    console.error('[GET /api/telegram/config] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No account linked' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { bot_token } = body;

    if (!bot_token || typeof bot_token !== 'string' || !bot_token.trim()) {
      return NextResponse.json({ error: 'Bot Token é obrigatório.' }, { status: 400 });
    }

    const cleanToken = bot_token.trim();

    // Validate bot token with Telegram
    const botInfo = await getTelegramBotInfo(cleanToken);
    if (!botInfo) {
      return NextResponse.json({ error: 'Bot Token inválido ou não encontrado no Telegram.' }, { status: 400 });
    }

    // Register Webhook URL with Telegram
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    const webhookUrl = `${protocol}://${host}/api/telegram/webhook/${cleanToken}`;

    const webhookSuccess = await setTelegramWebhook(cleanToken, webhookUrl);
    if (!webhookSuccess) {
      console.warn('[POST /api/telegram/config] Warning: setTelegramWebhook returned false');
    }

    // Insert or update in database
    const { data: existing } = await supabaseAdmin
      .from('telegram_config')
      .select('id')
      .eq('account_id', profile.account_id)
      .eq('bot_token', cleanToken)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from('telegram_config')
        .update({
          bot_name: botInfo.first_name,
          bot_username: botInfo.username,
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabaseAdmin
        .from('telegram_config')
        .insert({
          account_id: profile.account_id,
          bot_token: cleanToken,
          bot_name: botInfo.first_name,
          bot_username: botInfo.username,
          status: 'active',
        });
    }

    return NextResponse.json({
      success: true,
      bot: {
        name: botInfo.first_name,
        username: botInfo.username,
      },
    });
  } catch (err: any) {
    console.error('[POST /api/telegram/config] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
