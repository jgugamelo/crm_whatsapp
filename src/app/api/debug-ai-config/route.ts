import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'

export async function GET() {
  try {
    const db = supabaseAdmin()

    // Query 1: Get the schema of ai_config if possible
    const { data: testSelect, error: selectErr } = await db
      .from('ai_config')
      .select('*')
      .limit(1)

    // Query 2: Test an upsert to see what constraint fails
    const testUpsertPayload = {
      account_id: '00000000-0000-0000-0000-000000000000', // temporary dummy UUID
      enabled: false,
      api_provider: 'openai',
      api_key: 'test',
      system_prompt: 'test prompt',
      google_search_enabled: false,
      multimodal_enabled: false,
      elevenlabs_enabled: false,
      elevenlabs_api_key: null,
      elevenlabs_voice_id: null,
      updated_at: new Date().toISOString()
    }

    const { error: upsertErr } = await db
      .from('ai_config')
      .upsert(testUpsertPayload, { onConflict: 'account_id' })

    return NextResponse.json({
      success: true,
      select: { data: testSelect, error: selectErr ? selectErr.message : null },
      upsert_test: { error: upsertErr ? upsertErr.message : null }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
