import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { decrypt } from '@/lib/whatsapp/encryption'

export async function GET() {
  try {
    const db = supabaseAdmin()

    // Fetch the active WAHA configuration
    const { data: config, error: configError } = await db
      .from('whatsapp_config')
      .select('*')
      .eq('provider', 'waha')
      .limit(1)
      .maybeSingle()

    if (configError || !config) {
      return NextResponse.json({ error: 'WAHA configuration not found', configError }, { status: 404 })
    }

    const apiKey = config.waha_api_key ? decrypt(config.waha_api_key) : null
    const baseUrl = config.waha_url.replace(/\/$/, '')

    const headers: Record<string, string> = { 'accept': 'application/json' }
    if (apiKey) {
      headers['X-Api-Key'] = apiKey
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    // Try a few common OpenAPI spec paths on WAHA
    const specPaths = ['/openapi.json', '/swagger.json', '/api/docs/swagger.json']
    let openapiData: any = null
    let fetchedFrom = ''
    let fetchErrorMsg = ''

    for (const specPath of specPaths) {
      try {
        const res = await fetch(`${baseUrl}${specPath}`, { headers })
        if (res.ok) {
          openapiData = await res.json()
          fetchedFrom = specPath
          break
        } else {
          fetchErrorMsg += `${specPath}: status ${res.status}; `
        }
      } catch (err: any) {
        fetchErrorMsg += `${specPath}: ${err.message}; `
      }
    }

    if (!openapiData) {
      // Return basic connection check
      try {
        const pingRes = await fetch(`${baseUrl}/api/sessions`, { headers })
        const pingData = await pingRes.json().catch(() => null)
        return NextResponse.json({
          error: 'Could not fetch OpenAPI spec from WAHA',
          fetchErrors: fetchErrorMsg,
          pingStatus: pingRes.status,
          pingData
        })
      } catch (pingErr: any) {
        return NextResponse.json({
          error: 'Could not fetch OpenAPI spec and ping failed',
          fetchErrors: fetchErrorMsg,
          pingError: pingErr.message
        })
      }
    }

    const paths = Object.keys(openapiData.paths || {})
    const callRelatedPaths = paths.filter(p => 
      p.toLowerCase().includes('call') || 
      p.toLowerCase().includes('voice') || 
      p.toLowerCase().includes('audio') || 
      p.toLowerCase().includes('phone')
    )

    // Also extract the schemas for these paths if they exist
    const details: Record<string, any> = {}
    for (const p of callRelatedPaths) {
      details[p] = openapiData.paths[p]
    }

    return NextResponse.json({
      success: true,
      waha_url: baseUrl,
      fetched_from: fetchedFrom,
      all_paths_count: paths.length,
      call_related_paths: callRelatedPaths,
      details
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
