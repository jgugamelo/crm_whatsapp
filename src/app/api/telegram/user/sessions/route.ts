import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

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
    console.error('[telegram/user/sessions] Error resolving accountId:', err);
  }
  return userId;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accountId = await getAccountId(supabase, user.id);

    let { data: sessions } = await supabaseAdmin
      .from('telegram_user_sessions')
      .select('id, phone_number, first_name, username, status, created_at')
      .eq('account_id', accountId);

    if (!sessions || sessions.length === 0) {
      const { data: fallback } = await supabaseAdmin
        .from('telegram_user_sessions')
        .select('id, phone_number, first_name, username, status, created_at');
      sessions = fallback;
    }

    return NextResponse.json({ sessions: sessions ?? [] });
  } catch (err: any) {
    console.error('[GET /api/telegram/user/sessions] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 });
    }

    await supabaseAdmin
      .from('telegram_user_sessions')
      .delete()
      .eq('id', id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[DELETE /api/telegram/user/sessions] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
