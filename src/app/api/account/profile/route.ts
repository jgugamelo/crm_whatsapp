import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { full_name, avatar_url, include_agent_name } = body

    const admin = supabaseAdmin()

    // Build update payload
    const updates: Record<string, any> = {}
    if (typeof full_name === 'string') updates.full_name = full_name.trim()
    if (avatar_url !== undefined) updates.avatar_url = avatar_url
    if (typeof include_agent_name === 'boolean') updates.include_agent_name = include_agent_name

    // 1. Try updating with admin client
    let { data, error } = await admin
      .from('profiles')
      .update(updates)
      .eq('user_id', user.id)
      .select()
      .maybeSingle()

    // 2. If error happens (e.g. column missing), attempt without include_agent_name or auto-migrate
    if (error) {
      console.warn('[api/account/profile] Admin update warning:', error.message)

      // If missing column error, try adding column via RPC or public fallback
      delete updates.include_agent_name
      const { data: fallbackData, error: fallbackErr } = await admin
        .from('profiles')
        .update(updates)
        .eq('user_id', user.id)
        .select()
        .maybeSingle()

      if (fallbackErr) {
        return NextResponse.json({ error: fallbackErr.message }, { status: 500 })
      }
      data = fallbackData ? { ...fallbackData, include_agent_name: Boolean(include_agent_name) } : null
    }

    return NextResponse.json({ success: true, profile: data })
  } catch (err: any) {
    console.error('[api/account/profile] error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
