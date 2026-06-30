import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { event, session, payload } = body

    console.log('[waha/webhook] Received webhook event:', event, 'for session:', session)

    if (!event || !session || !payload) {
      return NextResponse.json({ error: 'Invalid WAHA webhook payload' }, { status: 400 })
    }

    const db = supabaseAdmin()

    // Resolve the account config based on the WAHA session name
    const { data: config, error: configError } = await db
      .from('whatsapp_config')
      .select('*')
      .eq('waha_session', session)
      .maybeSingle()

    if (configError || !config) {
      console.error(`[waha/webhook] Config not found for session "${session}":`, configError)
      return NextResponse.json({ error: 'Session configuration not found' }, { status: 404 })
    }

    const accountId = config.account_id

    // ============================================================
    // 1. Message status updates
    // ============================================================
    if (event === 'message.status') {
      const { id: messageId, status: wahaStatus } = payload
      let status: 'sent' | 'delivered' | 'read' | null = null

      if (wahaStatus === 'ACK_SERVER') status = 'sent'
      else if (wahaStatus === 'ACK_DEVICE') status = 'delivered'
      else if (wahaStatus === 'ACK_READ') status = 'read'

      if (status) {
        // Update message status in database
        const { error: updateError } = await db
          .from('messages')
          .update({ status })
          .eq('message_id', messageId)
          .eq('account_id', accountId)

        if (updateError) {
          console.error('[waha/webhook] Failed to update message status:', updateError)
        }
      }
      return NextResponse.json({ success: true })
    }

    // ============================================================
    // 2. Incoming and outgoing message synchronization
    // ============================================================
    if (event === 'message' || event === 'message.any') {
      const { id: messageId, timestamp, from, to, body: textBody, fromMe, hasMedia, type } = payload
      
      if (!from || !to) {
        return NextResponse.json({ success: true, message: 'Ignored message without sender/recipient JID' })
      }

      // Determine the contact phone number
      // Inbound: from JID (e.g. 5511999999999@c.us)
      // Outbound: to JID
      const participantJid = fromMe ? to : from
      const rawPhone = participantJid.split('@')[0]
      const phone = `+${rawPhone}` // Normalize to E.164 format with + prefix

      const direction = fromMe ? 'outbound' : 'inbound'

      // Ignore status broadcast updates (WhatsApp Stories) and group messages
      if (
        from === 'status@broadcast' || 
        to === 'status@broadcast' ||
        (from && from.endsWith('@g.us')) ||
        (to && to.endsWith('@g.us'))
      ) {
        return NextResponse.json({ success: true, message: 'Ignored group or status broadcast update' })
      }
      
      // Check if message already exists in DB to prevent duplicates
      const { data: existingMsg } = await db
        .from('messages')
        .select('id')
        .eq('message_id', messageId)
        .eq('account_id', accountId)
        .maybeSingle()

      if (existingMsg) {
        return NextResponse.json({ success: true, message: 'Message already synchronized' })
      }

      // 1. Find or create contact
      let contactId: string | null = null
      const { data: contact } = await db
        .from('contacts')
        .select('id')
        .eq('account_id', accountId)
        .eq('phone', phone)
        .maybeSingle()

      if (contact) {
        contactId = contact.id
      } else {
        // Create new contact
        const { data: newContact, error: contactCreateError } = await db
          .from('contacts')
          .insert({
            account_id: accountId,
            phone,
            name: rawPhone, // fallback name
            user_id: config.user_id, // link to session creator
          })
          .select('id')
          .single()

        if (contactCreateError) {
          console.error('[waha/webhook] Failed to create contact:', contactCreateError)
          return NextResponse.json({ error: 'Failed to synchronize contact' }, { status: 500 })
        }
        contactId = newContact.id
      }

      // 2. Find or create conversation
      let conversationId: string | null = null
      const { data: conversation } = await db
        .from('conversations')
        .select('id, unread_count, assigned_agent_id')
        .eq('account_id', accountId)
        .eq('contact_id', contactId!)
        .maybeSingle()

      if (conversation) {
        conversationId = conversation.id
      } else {
        // Create new conversation
        const { data: newConv, error: convCreateError } = await db
          .from('conversations')
          .insert({
            account_id: accountId,
            contact_id: contactId,
            status: 'open',
            unread_count: 0,
            user_id: config.user_id,
          })
          .select('id')
          .single()

        if (convCreateError) {
          console.error('[waha/webhook] Failed to create conversation:', convCreateError)
          return NextResponse.json({ error: 'Failed to synchronize conversation' }, { status: 500 })
        }
        conversationId = newConv.id
      }

      // Map WAHA message types to CRM content_type
      let contentType: 'text' | 'image' | 'video' | 'audio' | 'document' = 'text'
      if (type === 'image') contentType = 'image'
      else if (type === 'video') contentType = 'video'
      else if (type === 'audio' || type === 'ptt') contentType = 'audio'
      else if (type === 'document') contentType = 'document'

      const messageDate = new Date(timestamp * 1000).toISOString()

      // 3. Insert the message record
      const { error: msgInsertError } = await db
        .from('messages')
        .insert({
          account_id: accountId,
          conversation_id: conversationId,
          message_id: messageId,
          direction,
          content_type: contentType,
          content_text: textBody || '',
          status: direction === 'inbound' ? 'read' : 'sent',
          created_at: messageDate,
        })

      if (msgInsertError) {
        console.error('[waha/webhook] Failed to insert message:', msgInsertError)
        return NextResponse.json({ error: 'Failed to insert message' }, { status: 500 })
      }

      // 4. Update the conversation values
      const updates: Record<string, any> = {
        last_message_text: contentType === 'text' ? (textBody || '') : `[${contentType}]`,
        last_message_at: messageDate,
        updated_at: new Date().toISOString(),
      }

      if (direction === 'inbound') {
        updates.unread_count = (conversation?.unread_count || 0) + 1
      }

      const { error: convUpdateError } = await db
        .from('conversations')
        .update(updates)
        .eq('id', conversationId)

      if (convUpdateError) {
        console.error('[waha/webhook] Failed to update conversation values:', convUpdateError)
      }

      // Trigger AI Auto Response if the message is inbound and conversation is unassigned
      if (direction === 'inbound' && !conversation?.assigned_agent_id && contactId && conversationId) {
        const { handleAiAutoResponse } = await import('@/lib/ai/responder')
        void handleAiAutoResponse(accountId, contactId, conversationId, textBody || '')
      }

      // Trigger Sentiment and Auto-Tagging Analysis
      if (direction === 'inbound' && contactId && conversationId) {
        const { analyzeConversationSentimentAndTags } = await import('@/lib/ai/sentiment')
        void analyzeConversationSentimentAndTags(accountId, contactId, conversationId)
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: true, message: `Ignored event: ${event}` })
  } catch (err: any) {
    console.error('[waha/webhook] handler crashed:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
