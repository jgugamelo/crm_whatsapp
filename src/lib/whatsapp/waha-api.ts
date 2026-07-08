import type { MediaKind } from './meta-api';

interface WahaConfig {
  waha_url: string;
  waha_session: string;
  waha_api_key?: string | null;
}

async function wahaFetch(
  config: WahaConfig,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const baseUrl = config.waha_url.replace(/\/$/, '');
  const url = `${baseUrl}${path}`;
  const headers = new Headers(options.headers || {});

  if (config.waha_api_key) {
    // WAHA supports both X-Api-Key header and Bearer token
    headers.set('X-Api-Key', config.waha_api_key);
    headers.set('Authorization', `Bearer ${config.waha_api_key}`);
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

export interface WahaSessionInfo {
  name: string;
  status: 'STOPPED' | 'STARTING' | 'SCAN_QR' | 'WORKING' | 'FAILED' | 'UNKNOWN';
}

export async function getWahaSessionStatus(
  config: WahaConfig
): Promise<WahaSessionInfo['status']> {
  try {
    const res = await wahaFetch(config, `/api/sessions/${config.waha_session}`);
    if (res.status === 404) {
      return 'STOPPED';
    }
    if (!res.ok) {
      throw new Error(`WAHA API error: ${res.status}`);
    }
    const data = await res.json();
    return data.status || 'UNKNOWN';
  } catch (err) {
    console.error('[waha-api] getWahaSessionStatus error:', err);
    return 'UNKNOWN';
  }
}

export async function startWahaSession(config: WahaConfig): Promise<void> {
  // 1. Try path-based start endpoint
  const res = await wahaFetch(config, `/api/sessions/${config.waha_session}/start`, {
    method: 'POST',
  });
  if (!res.ok) {
    // 2. If it's a 404 (session doesn't exist) or 422, try to create/start it via POST /api/sessions
    const createRes = await wahaFetch(config, '/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: config.waha_session }),
    });
    if (createRes.ok) {
      // Automatically trigger start in case it's not started automatically
      await wahaFetch(config, `/api/sessions/${config.waha_session}/start`, {
        method: 'POST',
      });
      return;
    }
    throw new Error(`Failed to start WAHA session: ${res.status}`);
  }
}

export async function stopWahaSession(config: WahaConfig): Promise<void> {
  // Try path-based stop endpoint
  const res = await wahaFetch(config, `/api/sessions/${config.waha_session}/stop`, {
    method: 'POST',
  });
  if (!res.ok) {
    // Fall back to legacy stop endpoint
    const fallbackRes = await wahaFetch(config, '/api/sessions/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: config.waha_session }),
    });
    if (!fallbackRes.ok) {
      throw new Error(`Failed to stop WAHA session: ${res.status}`);
    }
  }
}

export async function getWahaQrCode(config: WahaConfig): Promise<Response> {
  // Try the new auth/qr endpoint first
  const res = await wahaFetch(config, `/api/${config.waha_session}/auth/qr?format=image`, {
    headers: {
      'Accept': 'image/png',
    }
  });
  if (res.ok) return res;

  // Fall back to /api/sessions/{session}/qr if the session version requires it
  const fallback = await wahaFetch(config, `/api/sessions/${config.waha_session}/qr`);
  if (!fallback.ok) {
    throw new Error(`Failed to fetch QR code: ${fallback.status}`);
  }
  return fallback;
}

export interface WahaSendResult {
  messageId: string;
}

export async function sendWahaTextMessage(
  config: WahaConfig,
  to: string,
  text: string,
  replyToId?: string
): Promise<WahaSendResult> {
  // Format phone number to WAHA expected format: 5511999999999@c.us
  const chatId = to.includes('@') ? to : `${to.replace(/\D/g, '')}@c.us`;

  const payload: Record<string, any> = {
    chatId,
    text,
    session: config.waha_session,
  };

  if (replyToId) {
    payload.reply_to = replyToId;
  }

  const res = await wahaFetch(config, '/api/sendText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`WAHA sendText failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return {
    messageId: data.id || '',
  };
}

export async function sendWahaMediaMessage(
  config: WahaConfig,
  to: string,
  mediaUrl: string,
  mediaType: MediaKind,
  filename: string,
  caption?: string
): Promise<WahaSendResult> {
  const chatId = to.includes('@') ? to : `${to.replace(/\D/g, '')}@c.us`;

  const payload = {
    chatId,
    file: {
      url: mediaUrl,
      name: filename || `file_${Date.now()}`,
    },
    caption: caption || '',
    session: config.waha_session,
  };

  const res = await wahaFetch(config, '/api/sendFile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`WAHA sendFile failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return {
    messageId: data.id || '',
  };
}

export async function getWahaProfilePicture(
  config: WahaConfig,
  phone: string
): Promise<string | null> {
  try {
    const contactId = phone.includes('@') ? phone : `${phone.replace(/\D/g, '')}@c.us`;
    const res = await wahaFetch(
      config,
      `/api/contacts/profile-picture?contactId=${encodeURIComponent(contactId)}&session=${encodeURIComponent(config.waha_session)}`
    );

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    return data.profilePictureURL || null;
  } catch (err) {
    console.error('[waha-api] getWahaProfilePicture error:', err);
    return null;
  }
}

export async function requestWahaPairingCode(
  config: WahaConfig,
  phoneNumber: string
): Promise<{ code: string }> {
  const res = await wahaFetch(
    config,
    `/api/${config.waha_session}/auth/request-code`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phoneNumber }),
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to request pairing code: ${res.status} - ${errorText}`);
  }

  const data = await res.json();
  return {
    code: data.code || '',
  };
}

