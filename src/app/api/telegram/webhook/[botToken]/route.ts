import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { db: { schema: 'wacrm' } }
);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ botToken: string }> }
) {
  try {
    const { botToken } = await params;
    if (!botToken) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    // Lookup matching telegram_config
    const { data: config } = await supabaseAdmin
      .from('telegram_config')
      .select('id, account_id, bot_name')
      .eq('bot_token', botToken)
      .maybeSingle();

    if (!config) {
      console.warn(`[telegram/webhook] Unrecognized bot token: ${botToken}`);
      return NextResponse.json({ ok: true }); // Return 200 to acknowledge Telegram
    }

    const payload = await request.json().catch(() => ({}));
    const message = payload.message || payload.edited_message;

    if (!message || !message.chat || !message.from) {
      return NextResponse.json({ ok: true });
    }

    const chatId = String(message.chat.id);
    const fromUser = message.from;
    const senderName = [fromUser.first_name, fromUser.last_name].filter(Boolean).join(' ') || fromUser.username || `Telegram (${chatId})`;
    const username = fromUser.username || '';

    let contentText = message.text || message.caption || '';
    if (!contentText) {
      if (message.photo) contentText = '[Foto]';
      else if (message.voice) contentText = '[Áudio de Voz]';
      else if (message.document) contentText = '[Documento]';
      else if (message.sticker) contentText = '[Sticker]';
      else contentText = '[Mensagem]';
    }

    // 1. Get or create Contact
    let contactId: string | null = null;
    const { data: existingContact } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('account_id', config.account_id)
      .eq('telegram_chat_id', chatId)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
    } else {
      // Create new contact
      const { data: newContact } = await supabaseAdmin
        .from('contacts')
        .insert({
          account_id: config.account_id,
          name: senderName,
          phone: `tg_${chatId}`, // Unique placeholder for telegram contacts
          telegram_chat_id: chatId,
          telegram_username: username,
        })
        .select('id')
        .single();

      if (newContact) contactId = newContact.id;
    }

    if (!contactId) {
      console.error('[telegram/webhook] Failed to resolve or create contact ID');
      return NextResponse.json({ ok: true });
    }

    // 2. Get or create Conversation (channel = 'telegram')
    let conversationId: string | null = null;
    const { data: existingConv } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('account_id', config.account_id)
      .eq('contact_id', contactId)
      .eq('channel', 'telegram')
      .maybeSingle();

    if (existingConv) {
      conversationId = existingConv.id;
      await supabaseAdmin
        .from('conversations')
        .update({
          last_message: contentText,
          last_message_at: new Date().toISOString(),
          unread_count: (existingConv as any).unread_count ? (existingConv as any).unread_count + 1 : 1,
        })
        .eq('id', conversationId);
    } else {
      const { data: newConv } = await supabaseAdmin
        .from('conversations')
        .insert({
          account_id: config.account_id,
          contact_id: contactId,
          channel: 'telegram',
          status: 'open',
          last_message: contentText,
          last_message_at: new Date().toISOString(),
          unread_count: 1,
        })
        .select('id')
        .single();

      if (newConv) conversationId = newConv.id;
    }

    if (!conversationId) {
      console.error('[telegram/webhook] Failed to resolve conversation ID');
      return NextResponse.json({ ok: true });
    }

    // 3. Insert Message into messages table
    await supabaseAdmin.from('messages').insert({
      conversation_id: conversationId,
      account_id: config.account_id,
      channel: 'telegram',
      direction: 'inbound',
      sender_type: 'contact',
      content: contentText,
      telegram_message_id: String(message.message_id),
      created_at: new Date(message.date * 1000).toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[telegram/webhook] Processing error:', err);
    return NextResponse.json({ ok: true });
  }
}
