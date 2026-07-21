import type { MediaKind } from './meta-api';

interface WahaConfig {
  waha_url: string;
  waha_session: string;
  waha_api_key?: string | null;
  proxy_enabled?: boolean;
  proxy_server?: string | null;
  proxy_username?: string | null;
  proxy_password?: string | null;
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

export async function getWahaSessionInfo(
  config: WahaConfig
): Promise<any> {
  try {
    const res = await wahaFetch(config, `/api/sessions/${config.waha_session}`);
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`WAHA API error: ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    console.error('[waha-api] getWahaSessionInfo error:', err);
    return null;
  }
}

export async function startWahaSession(config: WahaConfig, webhookUrl?: string): Promise<void> {
  // Check if the session is already working/running
  const currentStatus = await getWahaSessionStatus(config);
  if (currentStatus === 'WORKING') {
    console.log(`[waha-api] Session "${config.waha_session}" is already WORKING. Skipping creation/restart to avoid disconnection.`);
    
    // Dynamically update the webhooks and proxy config of the running session
    if (webhookUrl || config.proxy_enabled) {
      console.log(`[waha-api] Dynamically updating configuration for running session "${config.waha_session}"`);
      const sessionConfig: Record<string, any> = {};
      if (webhookUrl) {
        sessionConfig.webhooks = [
          {
            url: webhookUrl,
            events: ['message'],
          }
        ];
      }
      if (config.proxy_enabled && config.proxy_server) {
        sessionConfig.proxy = {
          server: config.proxy_server.trim(),
          username: config.proxy_username?.trim() || undefined,
          password: config.proxy_password?.trim() || undefined,
        };
      }
      
      try {
        await wahaFetch(config, `/api/sessions/${config.waha_session}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: sessionConfig }),
        });
      } catch (err) {
        console.warn(`[waha-api] Failed to PATCH session config, trying PUT:`, err);
        try {
          await wahaFetch(config, `/api/sessions/${config.waha_session}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: config.waha_session, config: sessionConfig }),
          });
        } catch (putErr) {
          console.error(`[waha-api] Failed to update session config dynamically:`, putErr);
        }
      }
    }
    return;
  }

  // If webhookUrl is provided, we stop and delete the session first to recreate it with the webhook config
  if (webhookUrl) {
    try {
      await wahaFetch(config, `/api/sessions/${config.waha_session}/stop`, { method: 'POST' });
    } catch (e) {}
    try {
      await wahaFetch(config, `/api/sessions/${config.waha_session}`, { method: 'DELETE' });
    } catch (e) {}
  }

  const sessionPayload: Record<string, any> = { name: config.waha_session };
  const sessionConfig: Record<string, any> = {};

  if (webhookUrl) {
    sessionConfig.webhooks = [
      {
        url: webhookUrl,
        events: ['message'], // ONLY message event
      }
    ];
  }

  if (config.proxy_enabled && config.proxy_server) {
    sessionConfig.proxy = {
      server: config.proxy_server.trim(),
      username: config.proxy_username?.trim() || undefined,
      password: config.proxy_password?.trim() || undefined,
    };
  }

  if (Object.keys(sessionConfig).length > 0) {
    sessionPayload.config = sessionConfig;
  }

  let createRes = await wahaFetch(config, '/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sessionPayload),
  });

  if (!createRes.ok) {
    console.warn(`[waha-api] Failed to create session with config (status ${createRes.status}), retrying with name-only body`);
    createRes = await wahaFetch(config, '/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: config.waha_session }),
    });
  }

  if (!createRes.ok) {
    // If creation fails (e.g. session already exists and shouldn't be deleted), try to start it directly
    const startRes = await wahaFetch(config, `/api/sessions/${config.waha_session}/start`, {
      method: 'POST',
    });
    if (!startRes.ok) {
      throw new Error(`Failed to start/create WAHA session: ${createRes.status}`);
    }
    return;
  }

  const startRes = await wahaFetch(config, `/api/sessions/${config.waha_session}/start`, {
    method: 'POST',
  });
  if (!startRes.ok) {
    throw new Error(`Failed to start WAHA session: ${startRes.status}`);
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

function getMimeType(filename: string, mediaType: MediaKind): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  
  if (mediaType === 'image') {
    if (ext === 'png') return 'image/png';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'webp') return 'image/webp';
    return 'image/jpeg';
  }
  
  if (mediaType === 'audio') {
    if (ext === 'mp3') return 'audio/mpeg';
    if (ext === 'aac') return 'audio/aac';
    if (ext === 'wav') return 'audio/wav';
    if (ext === 'webm') return 'audio/webm';
    return 'audio/ogg; codecs=opus'; // WAHA voice notes require opus ogg codec
  }
  
  if (mediaType === 'video') {
    if (ext === 'mov') return 'video/quicktime';
    return 'video/mp4';
  }
  
  // Document / fallback
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'doc' || ext === 'docx') return 'application/msword';
  if (ext === 'xls' || ext === 'xlsx') return 'application/vnd.ms-excel';
  if (ext === 'ppt' || ext === 'pptx') return 'application/vnd.ms-powerpoint';
  if (ext === 'txt') return 'text/plain';
  if (ext === 'csv') return 'text/csv';
  if (ext === 'zip') return 'application/zip';
  
  return 'application/octet-stream';
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

  // Fetch the file from the media URL and convert to Base64
  // This bypasses any network restrictions/proxies between the WAHA container and Supabase
  let base64Data = '';
  try {
    const fileRes = await fetch(mediaUrl);
    if (!fileRes.ok) {
      throw new Error(`Failed to fetch media from URL (${fileRes.status}): ${fileRes.statusText}`);
    }
    const arrayBuffer = await fileRes.arrayBuffer();
    base64Data = Buffer.from(arrayBuffer).toString('base64');
  } catch (err: any) {
    console.error('[waha-api] Failed to convert media to Base64, falling back to URL:', err);
  }

  // Ensure safe filename and extension
  let safeFilename = filename || `file_${Date.now()}`;
  const ext = safeFilename.split('.').pop()?.toLowerCase();
  if (mediaType === 'audio' && !['ogg', 'mp3', 'aac', 'wav', 'webm'].includes(ext || '')) {
    safeFilename = `${safeFilename}.ogg`;
  } else if (mediaType === 'image' && !['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) {
    safeFilename = `${safeFilename}.jpg`;
  } else if (mediaType === 'video' && !['mp4', '3gp', 'mov'].includes(ext || '')) {
    safeFilename = `${safeFilename}.mp4`;
  }

  const filePayload: Record<string, any> = {
    name: safeFilename,
    filename: safeFilename, // Swagger schema uses filename, some engines use name - pass both for compatibility
    mimetype: getMimeType(safeFilename, mediaType),
  };

  if (base64Data) {
    filePayload.data = base64Data;
  } else {
    filePayload.url = mediaUrl;
  }

  const payload = {
    chatId,
    file: filePayload,
    caption: caption || '',
    session: config.waha_session,
  };

  // Route media types to correct WAHA native media endpoints
  let endpoint = '/api/sendFile';
  if (mediaType === 'image') {
    endpoint = '/api/sendImage';
  } else if (mediaType === 'video') {
    endpoint = '/api/sendVideo';
  } else if (mediaType === 'audio') {
    endpoint = '/api/sendVoice';
  }

  const res = await wahaFetch(config, endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`WAHA media send failed (${res.status}): ${errText}`);
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

export async function sendWahaReaction(
  config: WahaConfig,
  messageId: string,
  emoji: string
): Promise<void> {
  const res = await wahaFetch(config, '/api/reaction', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session: config.waha_session,
      messageId: messageId,
      reaction: emoji,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to send reaction to WAHA: ${res.status} - ${errorText}`);
  }
}

export async function startWacallsCall(
  config: WahaConfig,
  phone: string
): Promise<{ callId: string }> {
  const res = await wahaFetch(config, `/api/sessions/${config.waha_session}/calls`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phone }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to start WaCalls call: ${res.status} - ${errorText}`);
  }

  const data = await res.json();
  return {
    callId: data.call?.callId || '',
  };
}

export async function playWacallsAudio(
  config: WahaConfig,
  callId: string,
  url: string
): Promise<void> {
  const res = await wahaFetch(config, `/api/sessions/${config.waha_session}/calls/${callId}/play`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to play WaCalls audio: ${res.status} - ${errorText}`);
  }
}

export async function getWacallsCallStatus(
  config: WahaConfig,
  callId: string
): Promise<{ status: string; ended: boolean }> {
  const res = await wahaFetch(config, `/api/sessions/${config.waha_session}/calls/${callId}`, {
    method: 'GET',
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to get WaCalls call status: ${res.status} - ${errorText}`);
  }

  return res.json();
}

export async function sendWahaVoiceMessage(
  config: WahaConfig,
  to: string,
  mediaUrl: string
): Promise<WahaSendResult> {
  const chatId = to.includes('@') ? to : `${to.replace(/\D/g, '')}@c.us`;

  const payload = {
    chatId,
    file: {
      url: mediaUrl,
    },
    session: config.waha_session,
  };

  const res = await wahaFetch(config, '/api/sendVoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`WAHA sendVoice failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return {
    messageId: data.id || '',
  };
}



