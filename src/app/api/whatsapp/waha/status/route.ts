import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/whatsapp/encryption'

const MASKED_TOKEN = '••••••••••••••••'

async function resolveAccountId(
  supabase: any,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data?.account_id) return null
  return data.account_id as string
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json({ error: 'No account linked to user.' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const sessionName = searchParams.get('session')
    let wahaUrl = searchParams.get('waha_url')
    let wahaApiKey = searchParams.get('waha_api_key')

    // If wahaUrl is not provided or API key is masked, retrieve from db
    if (!wahaUrl || wahaApiKey === MASKED_TOKEN) {
      const { data: configs } = await supabase
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', accountId)
        .eq('provider', 'waha')
      
      if (configs && configs.length > 0) {
        // Find matching session if sessionName is provided, otherwise take the first WAHA config
        const config = (sessionName ? configs.find((c: any) => c.waha_session === sessionName) : null) || configs[0]
        
        if (!wahaUrl) {
          wahaUrl = config.waha_url
        }
        if (wahaApiKey === MASKED_TOKEN || !wahaApiKey) {
          wahaApiKey = config.waha_api_key ? decrypt(config.waha_api_key) : null
        }
      }
    }

    if (!wahaUrl) {
      return NextResponse.json({
        online: false,
        sessions: [],
        message: 'Nenhum servidor WAHA configurado. Preencha a URL do servidor.'
      })
    }

    const baseUrl = wahaUrl.replace(/\/$/, '')
    const headers: Record<string, string> = {}
    if (wahaApiKey && wahaApiKey !== MASKED_TOKEN) {
      headers['X-Api-Key'] = wahaApiKey
      headers['Authorization'] = `Bearer ${wahaApiKey}`
    }

    try {
      // 1. Get version/status to check server health
      const versionRes = await fetch(`${baseUrl}/api/version`, { headers, signal: AbortSignal.timeout(5000) }).catch(() => null)
      
      // 2. Fetch all sessions from WAHA
      const sessionsRes = await fetch(`${baseUrl}/api/sessions?all=true`, { headers, signal: AbortSignal.timeout(5000) })
      if (!sessionsRes.ok) {
        return NextResponse.json({
          online: true,
          status: sessionsRes.status,
          message: `O servidor WAHA respondeu com erro: ${sessionsRes.status}`
        })
      }

      const sessions = await sessionsRes.json()

      // If a specific session name was requested, return its specific status
      if (sessionName) {
        const found = sessions.find((s: any) => s.name === sessionName)
        return NextResponse.json({
          online: true,
          sessionName,
          status: found ? found.status : 'STOPPED',
          sessionInfo: found || null
        })
      }

      return NextResponse.json({
        online: true,
        sessions,
        version: versionRes && versionRes.ok ? await versionRes.json().catch(() => null) : null
      })

    } catch (err: any) {
      console.error('[waha/status] Failed to fetch from WAHA server:', err)
      return NextResponse.json({
        online: false,
        message: `Não foi possível conectar ao servidor WAHA em ${wahaUrl}. Erro: ${err.message}`
      })
    }
  } catch (err: any) {
    console.error('[waha/status] route error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
