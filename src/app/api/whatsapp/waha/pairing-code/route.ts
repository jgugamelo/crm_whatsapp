import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requestWahaPairingCode } from '@/lib/whatsapp/waha-api'
import { decrypt } from '@/lib/whatsapp/encryption'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!profile?.account_id) {
      return NextResponse.json({ error: 'No account linked to user.' }, { status: 403 })
    }

    const body = await request.json()
    const { phoneNumber } = body

    if (!phoneNumber) {
      return NextResponse.json({ error: 'Phone number is required.' }, { status: 400 })
    }

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', profile.account_id)
      .maybeSingle()

    if (configError || !config || config.provider !== 'waha') {
      return NextResponse.json({ error: 'WAHA is not configured.' }, { status: 400 })
    }

    const wahaConfig = {
      waha_url: config.waha_url,
      waha_session: config.waha_session,
      waha_api_key: config.waha_api_key ? decrypt(config.waha_api_key) : null,
    }

    const cleanPhone = phoneNumber.replace(/\D/g, '')

    const result = await requestWahaPairingCode(wahaConfig, cleanPhone)
    return NextResponse.json({ success: true, code: result.code })
  } catch (err: any) {
    console.error('[waha/pairing-code] error:', err)
    return NextResponse.json({ error: err.message || 'Failed to request pairing code' }, { status: 500 })
  }
}
