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

    // 1. Always update user_metadata in Supabase Auth (guaranteed persistence across restarts/DB tables)
    if (typeof include_agent_name === 'boolean' || typeof full_name === 'string') {
      const metadataUpdates: Record<string, any> = { ...(user.user_metadata || {}) }
      if (typeof include_agent_name === 'boolean') {
        metadataUpdates.include_agent_name = include_agent_name
      }
      if (typeof full_name === 'string') {
        metadataUpdates.full_name = full_name.trim()
      }
      await admin.auth.admin.updateUserById(user.id, {
        user_metadata: metadataUpdates,
      })
    }

    // 2. Update profiles table in Supabase DB
    const updates: Record<string, any> = {}
    if (typeof full_name === 'string') updates.full_name = full_name.trim()
    if (avatar_url !== undefined) updates.avatar_url = avatar_url
    if (typeof include_agent_name === 'boolean') updates.include_agent_name = include_agent_name

    let { data, error } = await admin
      .from('profiles')
      .update(updates)
      .eq('user_id', user.id)
      .select()
      .maybeSingle()

    if (error) {
      console.warn('[api/account/profile] profiles table update fallback without include_agent_name:', error.message)
      delete updates.include_agent_name
      const { data: fallbackData } = await admin
        .from('profiles')
        .update(updates)
        .eq('user_id', user.id)
        .select()
        .maybeSingle()
      data = fallbackData
    }

    const resolvedInclude = typeof include_agent_name === 'boolean' ? include_agent_name : true

    return NextResponse.json({
      success: true,
      profile: {
        ...data,
        include_agent_name: resolvedInclude,
      },
    })
  } catch (err: any) {
    console.error('[api/account/profile] error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
