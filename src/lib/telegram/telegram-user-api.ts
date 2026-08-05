import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';

const API_ID = Number(process.env.TELEGRAM_API_ID) || 2040;
const API_HASH = process.env.TELEGRAM_API_HASH || 'b18441a1ed609e10d277d64c87320ac7';

// Temporary store for pending auth flows in memory
const pendingAuthMap = new Map<string, { client: TelegramClient; phoneCodeHash: string }>();

/**
 * Initiates phone number login by requesting a 5-digit code from Telegram.
 */
export async function sendTelegramPhoneCode(phoneNumber: string): Promise<{ phoneCodeHash: string }> {
  const cleanPhone = phoneNumber.replace(/[^\d+]/g, '');
  const session = new StringSession('');
  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 3,
  });

  await client.connect();

  const res: any = await client.sendCode(
    {
      apiId: API_ID,
      apiHash: API_HASH,
    },
    cleanPhone
  );

  pendingAuthMap.set(cleanPhone, {
    client,
    phoneCodeHash: res.phoneCodeHash,
  });

  return { phoneCodeHash: res.phoneCodeHash };
}

/**
 * Completes phone number login using the 5-digit verification code.
 */
export async function loginTelegramWithCode(
  phoneNumber: string,
  code: string,
  password?: string
): Promise<{
  sessionString: string;
  telegramUserId: string;
  firstName: string;
  username: string;
}> {
  const cleanPhone = phoneNumber.replace(/[^\d+]/g, '');
  const pending = pendingAuthMap.get(cleanPhone);

  let client: TelegramClient;
  let phoneCodeHash = '';

  if (pending) {
    client = pending.client;
    phoneCodeHash = pending.phoneCodeHash;
  } else {
    const session = new StringSession('');
    client = new TelegramClient(session, API_ID, API_HASH, {
      connectionRetries: 3,
    });
    await client.connect();
    const res: any = await client.sendCode(
      { apiId: API_ID, apiHash: API_HASH },
      cleanPhone
    );
    phoneCodeHash = res.phoneCodeHash;
  }

  let user: any;
  try {
    user = await (client as any).invoke(
      new Api.auth.SignIn({
        phoneNumber: cleanPhone,
        phoneCodeHash,
        phoneCode: code,
      })
    );
  } catch (err: any) {
    if (err.errorMessage === 'SESSION_PASSWORD_NEEDED' || (err.message && err.message.includes('SESSION_PASSWORD_NEEDED'))) {
      if (!password) {
        throw new Error('PASSWORD_NEEDED');
      }
      try {
        const passwordResult: any = await (client as any).invoke(new Api.account.GetPassword());
        const passwordCheck = await (client as any).computePasswordCheck(passwordResult, password);
        user = await (client as any).invoke(
          new Api.auth.CheckPassword({
            password: passwordCheck,
          })
        );
      } catch (passErr: any) {
        throw new Error(`Senha 2FA incorreta: ${passErr.message || passErr}`);
      }
    } else {
      throw err;
    }
  }

  const sessionString = (client.session.save() as unknown) as string;
  pendingAuthMap.delete(cleanPhone);

  const me: any = (user && user.user) ? user.user : await client.getMe();

  return {
    sessionString,
    telegramUserId: String(me.id || ''),
    firstName: me.firstName || me.first_name || '',
    username: me.username || '',
  };
}

/**
 * Sends a direct message to a recipient using a logged in Telegram User session by phone number or Chat ID.
 */
export async function sendTelegramUserMessage(
  sessionString: string,
  targetPhoneOrId: string,
  messageText: string
): Promise<{ messageId: string }> {
  const session = new StringSession(sessionString);
  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 3,
  });

  await client.connect();

  let peer: any = targetPhoneOrId;
  const cleanTarget = targetPhoneOrId.replace('tg_', '').replace(/[^\d+]/g, '');

  // If target looks like a phone number, import/resolve contact
  if (cleanTarget.startsWith('+') || cleanTarget.length >= 10) {
    try {
      const imported: any = await client.invoke(
        new Api.contacts.ImportContacts({
          contacts: [
            new Api.InputPhoneContact({
              clientId: (BigInt(Date.now()) as unknown) as any,
              phone: cleanTarget,
              firstName: 'Contato',
              lastName: '',
            }),
          ],
        })
      );

      if (imported.users && imported.users.length > 0) {
        peer = imported.users[0];
      }
    } catch (err) {
      console.warn('[telegram-user-api] ImportContacts failed, fallback to phone string:', err);
    }
  }

  const result: any = await client.sendMessage(peer, { message: messageText });
  await client.disconnect();

  return {
    messageId: String(result.id || ''),
  };
}
