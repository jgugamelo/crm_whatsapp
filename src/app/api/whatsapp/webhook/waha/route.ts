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

        if (updateError) {
          console.error('[waha/webhook] Failed to update message status:', updateError)
        }
      }
      return NextResponse.json({ success: true })
    }

    // ============================================================
    // 2. Incoming and outgoing message synchronization
    // ============================================================
    if (event === 'message.any') {
      console.log('[waha/webhook] Message payload:', JSON.stringify(payload))
      const { id: messageId, timestamp, from, to, body: textBody, fromMe, hasMedia, type, chatId } = payload
      
      let participantJid = fromMe ? to : from

      // Extract real phone JID if WAHA is sending a LID (WhatsApp internal ID)
      const senderAlt = payload._data?.Info?.SenderAlt
      const recipientAlt = payload._data?.Info?.RecipientAlt

      if (!fromMe && senderAlt && (senderAlt.endsWith('@s.whatsapp.net') || senderAlt.endsWith('@c.us'))) {
        participantJid = senderAlt
      } else if (fromMe && recipientAlt && (recipientAlt.endsWith('@s.whatsapp.net') || recipientAlt.endsWith('@c.us'))) {
        participantJid = recipientAlt
      }

      if (!participantJid) {
        console.warn('[waha/webhook] Ignored message due to missing participant JID')
        return NextResponse.json({ success: true, message: 'Ignored message without participant JID' })
      }

      // Determine the contact phone number
      // Inbound: from JID (e.g. 5511999999999@c.us)
      // Outbound: to JID
      const rawPhone = participantJid.split('@')[0].split(':')[0].split('.')[0]
      const phone = `+${rawPhone}` // Normalize to E.164 format with + prefix

      const direction = fromMe ? 'outbound' : 'inbound'

      // Ignore status broadcast updates (WhatsApp Stories), group messages, and channels/newsletters
      if (
        from === 'status@broadcast' || 
        to === 'status@broadcast' ||
        (from && (from.endsWith('@g.us') || from.endsWith('@newsletter'))) ||
        (to && (to.endsWith('@g.us') || to.endsWith('@newsletter'))) ||
        (chatId && (chatId.endsWith('@g.us') || chatId.endsWith('@newsletter')))
      ) {
        return NextResponse.json({ success: true, message: 'Ignored group, status broadcast or newsletter' })
      }
      
      // Check if message already exists in DB to prevent duplicates
      const { data: existingMsg } = await db
        .from('messages')
        .select('id')
        .eq('message_id', messageId)
        .maybeSingle()

      if (existingMsg) {
        return NextResponse.json({ success: true, message: 'Message already synchronized' })
      }

      // 1. Find or create contact
      let contactId: string | null = null
      let avatarUrl: string | null = null
      let contactName = 
        payload.sender?.name || 
        payload._data?.Info?.PushName || 
        payload.pushName || 
        payload.pushname ||
        payload._data?.notifyName || 
        payload._data?.pushname || 
        payload.sender?.pushName || 
        rawPhone

      if (contactName && contactName.trim() === '.') {
        contactName = rawPhone
      }

      const { data: contactsList, error: contactFetchError } = await db
        .from('contacts')
        .select('id, avatar_url, name')
        .eq('account_id', accountId)
        .eq('phone', phone)

      if (contactFetchError) {
        console.error('[waha/webhook] Error fetching contacts:', contactFetchError)
      }

      const contact = contactsList && contactsList.length > 0 ? contactsList[0] : null

      if (contact) {
        contactId = contact.id
        avatarUrl = contact.avatar_url

        // If the contact name in the DB is just the raw phone (fallback) but we received a better notifyName, update it!
        const isFallbackName = contact.name === rawPhone || contact.name === phone
        if (contactName !== rawPhone && isFallbackName) {
          try {
            await db
              .from('contacts')
              .update({ name: contactName })
              .eq('id', contactId)
          } catch (e) {
            console.error('[waha/webhook] Failed to update contact name:', e)
          }
        }

        // If the contact exists but has no avatar, try to fetch and save it
        if (!avatarUrl) {
          try {
            const { getWahaProfilePicture } = await import('@/lib/whatsapp/waha-api')
            avatarUrl = await getWahaProfilePicture({
              waha_url: config.waha_url,
              waha_session: config.waha_session,
              waha_api_key: config.waha_api_key,
            }, phone)

            if (avatarUrl) {
              await db
                .from('contacts')
                .update({ avatar_url: avatarUrl })
                .eq('id', contactId)
            }
          } catch (e) {
            console.error('[waha/webhook] Failed to update avatar for existing contact:', e)
          }
        }
      } else {
        // Fetch avatar url from WAHA
        try {
          const { getWahaProfilePicture } = await import('@/lib/whatsapp/waha-api')
          avatarUrl = await getWahaProfilePicture({
            waha_url: config.waha_url,
            waha_session: config.waha_session,
            waha_api_key: config.waha_api_key,
          }, phone)
        } catch (e) {
          console.error('[waha/webhook] Failed to fetch avatar for new contact:', e)
        }

        // Create new contact
        const { data: newContact, error: contactCreateError } = await db
          .from('contacts')
          .insert({
            account_id: accountId,
            phone,
            name: contactName, // Save notifyName
            user_id: config.user_id, // link to session creator
            avatar_url: avatarUrl,
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
      const { data: convsList, error: convFetchError } = await db
        .from('conversations')
        .select('id, unread_count, assigned_agent_id')
        .eq('account_id', accountId)
        .eq('contact_id', contactId!)

      if (convFetchError) {
        console.error('[waha/webhook] Error fetching conversations:', convFetchError)
      }

      const conversation = convsList && convsList.length > 0 ? convsList[0] : null

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

      // Extract media URL if present in WAHA payload.
      // We download the media from WAHA and upload it permanently to Supabase Storage (chat-media bucket)
      // to prevent files disappearing when the WAHA server cache is restarted or cleared.
      let mediaUrl: string | null = null
      if (hasMedia && payload.media) {
        let fileKey = ''
        if (payload.media.url) {
          const parts = payload.media.url.split('/api/files/')
          if (parts.length > 1) {
            fileKey = parts[1]
          }
        }
        if (!fileKey && payload.media.filename) {
          fileKey = `${config.waha_session}/${payload.media.filename}`
        }
        if (fileKey) {
          try {
            const { decrypt } = await import('@/lib/whatsapp/encryption')
            const apiKey = config.waha_api_key ? decrypt(config.waha_api_key) : null
            const headers: Record<string, string> = {}
            if (apiKey) {
              headers['Authorization'] = `Bearer ${apiKey}`
            }

            const fileUrl = `${config.waha_url}/api/files/${fileKey}`
            const fileRes = await fetch(fileUrl, { headers })
            if (fileRes.ok) {
              const buffer = await fileRes.arrayBuffer()
              const contentType = fileRes.headers.get('Content-Type') || payload.media.mimetype || 'application/octet-stream'
              
              // Build file name and upload to account-scoped path in chat-media bucket
              const filename = fileKey.split('/').pop() || 'file'
              const storagePath = `account-${accountId}/${Date.now()}-${filename}`
              
              const { error: uploadError } = await db.storage
                .from('chat-media')
                .upload(storagePath, new Uint8Array(buffer), {
                  contentType,
                  cacheControl: '31536000',
                  upsert: true,
                })

              if (!uploadError) {
                const { data } = db.storage.from('chat-media').getPublicUrl(storagePath)
                mediaUrl = data.publicUrl
              } else {
                console.error('[waha/webhook] Supabase Storage upload failed:', uploadError.message)
                mediaUrl = `/api/whatsapp/media/waha?file=${fileKey}`
              }
            } else {
              console.error('[waha/webhook] Failed to download media from WAHA, status:', fileRes.status)
              mediaUrl = `/api/whatsapp/media/waha?file=${fileKey}`
            }
          } catch (err) {
            console.error('[waha/webhook] Media upload error:', err)
            mediaUrl = `/api/whatsapp/media/waha?file=${fileKey}`
          }
        }
      }

      // Map WAHA message types to CRM content_type.
      // Use mimetype-based classification if media details are available,
      // fallback to type-based mapping.
      let contentType: 'text' | 'image' | 'video' | 'audio' | 'document' = 'text'
      if (hasMedia && payload.media) {
        const mime = payload.media.mimetype || ''
        if (mime.startsWith('image/')) contentType = 'image'
        else if (mime.startsWith('video/')) contentType = 'video'
        else if (mime.startsWith('audio/')) contentType = 'audio'
        else contentType = 'document'
      } else {
        if (type === 'image' || type === 'sticker') contentType = 'image'
        else if (type === 'video') contentType = 'video'
        else if (type === 'audio' || type === 'ptt') contentType = 'audio'
        else if (type === 'document') contentType = 'document'
      }

      const messageDate = new Date(timestamp * 1000).toISOString()

      // 3. Insert the message record
      const { error: msgInsertError } = await db
        .from('messages')
        .insert({
          conversation_id: conversationId,
          message_id: messageId,
          sender_type: fromMe ? 'agent' : 'customer',
          content_type: contentType,
          content_text: textBody || '',
          media_url: mediaUrl,
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
