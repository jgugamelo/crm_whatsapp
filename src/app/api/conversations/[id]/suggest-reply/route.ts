import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateReplySuggestion } from '@/lib/ai/sentiment'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params
    const supabase = await createClient()

    // 1. Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Fetch profile to get account_id
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (profileError || !profile?.account_id) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    const accountId = profile.account_id

    // 3. Fetch conversation to verify ownership
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('account_id', accountId)
      .maybeSingle()

    if (convError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // 4. Generate AI reply suggestion
    const suggestion = await generateReplySuggestion(accountId, conversationId)

    return NextResponse.json({ success: true, suggestion })
  } catch (err: any) {
    console.error('[API Suggest Reply] Error:', err)
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
