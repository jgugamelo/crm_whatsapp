// Client ID generation and persistence
const CLIENT_ID_KEY = "wacrm.voip.clientId";

const generateClientId = (): string => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "c-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
};

export const getClientId = (): string => {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = generateClientId();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
};

// Audio & PCM conversions
export const float32ToInt16LE = (pcm: Float32Array): ArrayBuffer => {
  const view = new DataView(new ArrayBuffer(pcm.length * 2));
  for (let i = 0; i < pcm.length; i += 1) {
    let s = pcm[i];
    if (Number.isNaN(s)) s = 0;
    else if (s > 1) s = 1;
    else if (s < -1) s = -1;
    view.setInt16(i * 2, s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), true);
  }
  return view.buffer;
};

export const int16LEToFloat32 = (buf: ArrayBuffer): Float32Array => {
  const view = new DataView(buf);
  const n = Math.floor(buf.byteLength / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
};

// Audio Constants
export const SAMPLE_RATE = 16000;
export const PCM_CHANNEL_LABEL = "pcm";
export const CAPTURE_WORKLET_URL = "/worklets/capture-processor.js";
export const PLAYBACK_WORKLET_URL = "/worklets/playback-processor.js";
export const CAPTURE_PROCESSOR_NAME = "capture-processor";
export const PLAYBACK_PROCESSOR_NAME = "playback-processor";

export type OpenCall = {
  pc: RTCPeerConnection;
  micStream: MediaStream;
  remoteStream: MediaStream | null;
  close: () => void;
};

const apiPost = async <T>(path: string, body: unknown): Promise<T> => {
  const r = await fetch(path, {
    method: "POST",
    headers: {
      "X-Client-Id": getClientId(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`${path} ${r.status} ${text}`);
  }
  return r.json() as Promise<T>;
};

export const openCall = async (
  sid: string,
  callId: string,
  micDeviceId: string | null,
): Promise<OpenCall> => {
  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true,
  });

  const pc = new RTCPeerConnection({ iceServers: [] });

  const dc = pc.createDataChannel(PCM_CHANNEL_LABEL, { ordered: true });
  dc.binaryType = "arraybuffer";

  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  await ctx.audioWorklet.addModule(CAPTURE_WORKLET_URL);
  await ctx.audioWorklet.addModule(PLAYBACK_WORKLET_URL);
  await ctx.resume();

  const micSource = ctx.createMediaStreamSource(micStream);
  const captureNode = new AudioWorkletNode(ctx, CAPTURE_PROCESSOR_NAME);
  captureNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
    if (dc.readyState === "open") dc.send(float32ToInt16LE(e.data));
  };
  micSource.connect(captureNode);
  captureNode.connect(ctx.destination);

  const playbackNode = new AudioWorkletNode(ctx, PLAYBACK_PROCESSOR_NAME);
  const streamDest = ctx.createMediaStreamDestination();
  playbackNode.connect(streamDest);
  dc.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    playbackNode.port.postMessage(int16LEToFloat32(e.data));
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") resolve();
    else
      pc.addEventListener("icegatheringstatechange", () => {
        if (pc.iceGatheringState === "complete") resolve();
      });
  });

  const { sdp_answer } = await apiPost<{ sdp_answer: string }>(
    `/api/calls/sessions/${sid}/calls/${callId}/webrtc`,
    { sdp_offer: pc.localDescription!.sdp },
  );
  await pc.setRemoteDescription({ type: "answer", sdp: sdp_answer });

  return {
    pc,
    micStream,
    remoteStream: streamDest.stream,
    close: () => {
      try {
        micStream.getTracks().forEach((t) => t.stop());
      } catch {}
      try {
        ctx.close();
      } catch {}
      try {
        pc.close();
      } catch {}
    },
  };
};
