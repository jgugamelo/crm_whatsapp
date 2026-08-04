/**
 * Telegram Bot API Client Utilities
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

export interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
}

export interface TelegramSendResult {
  messageId: string;
  ok: boolean;
}

/**
 * Fetches basic info for a Telegram Bot given its token.
 */
export async function getTelegramBotInfo(botToken: string): Promise<TelegramBotInfo | null> {
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}${botToken}/getMe`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.ok && data.result) {
      return data.result as TelegramBotInfo;
    }
    return null;
  } catch (err) {
    console.error('[telegram-api] getTelegramBotInfo error:', err);
    return null;
  }
}

/**
 * Configures the Webhook URL for receiving Telegram updates.
 */
export async function setTelegramWebhook(botToken: string, webhookUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query'],
      }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.ok;
  } catch (err) {
    console.error('[telegram-api] setTelegramWebhook error:', err);
    return false;
  }
}

/**
 * Sends a text message to a Telegram chat.
 */
export async function sendTelegramTextMessage(
  botToken: string,
  chatId: string | number,
  text: string
): Promise<TelegramSendResult> {
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Telegram sendMessage failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return {
      messageId: String(data.result?.message_id || ''),
      ok: true,
    };
  } catch (err: any) {
    console.error('[telegram-api] sendTelegramTextMessage error:', err);
    throw err;
  }
}

/**
 * Sends a photo message to a Telegram chat.
 */
export async function sendTelegramPhotoMessage(
  botToken: string,
  chatId: string | number,
  photoUrl: string,
  caption?: string
): Promise<TelegramSendResult> {
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}${botToken}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        caption: caption || '',
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Telegram sendPhoto failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return {
      messageId: String(data.result?.message_id || ''),
      ok: true,
    };
  } catch (err: any) {
    console.error('[telegram-api] sendTelegramPhotoMessage error:', err);
    throw err;
  }
}

/**
 * Sends a document or audio file to a Telegram chat.
 */
export async function sendTelegramDocumentMessage(
  botToken: string,
  chatId: string | number,
  documentUrl: string,
  caption?: string
): Promise<TelegramSendResult> {
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}${botToken}/sendDocument`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        document: documentUrl,
        caption: caption || '',
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Telegram sendDocument failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return {
      messageId: String(data.result?.message_id || ''),
      ok: true,
    };
  } catch (err: any) {
    console.error('[telegram-api] sendTelegramDocumentMessage error:', err);
    throw err;
  }
}
