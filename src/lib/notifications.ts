/**
 * Browser Sound & System Notification Manager for WA CRM
 * Synthesizes audio chimes using Web Audio API (works on iOS, Android, and Desktop)
 * and dispatches Native Browser System Notifications.
 */

export function playNotificationSound(type: "message" | "lead" = "message") {
  if (typeof window === "undefined") return;

  try {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    if (type === "lead") {
      // Upbeat 3-tone chime for a new lead (C5 -> E5 -> G5)
      [523.25, 659.25, 783.99].forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + index * 0.1);

        gain.gain.setValueAtTime(0.18, now + index * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.1 + 0.22);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + index * 0.1);
        osc.stop(now + index * 0.1 + 0.22);
      });
    } else {
      // Soft 2-tone chime for incoming message (D5 -> A5)
      [587.33, 880.0].forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + index * 0.08);

        gain.gain.setValueAtTime(0.14, now + index * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.08 + 0.2);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + index * 0.08);
        osc.stop(now + index * 0.08 + 0.2);
      });
    }
  } catch (err) {
    console.warn("[playNotificationSound] Web Audio API failed:", err);
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission !== "denied") {
    try {
      const permission = await Notification.requestPermission();
      return permission === "granted";
    } catch {
      return false;
    }
  }

  return false;
}

export function notifyNewMessage(
  senderName: string,
  text: string,
  conversationId?: string
) {
  playNotificationSound("message");

  if (
    typeof window !== "undefined" &&
    "Notification" in window &&
    Notification.permission === "granted"
  ) {
    try {
      const notif = new Notification(`Nova mensagem de ${senderName || "Cliente"}`, {
        body: text ? (text.length > 100 ? text.substring(0, 100) + "..." : text) : "Nova mensagem recebida",
        icon: "/icon",
        tag: `msg-${conversationId || "general"}`,
      });

      if (conversationId) {
        notif.onclick = () => {
          window.focus();
          window.location.href = `/inbox?c=${conversationId}`;
        };
      }
    } catch (e) {
      console.warn("[notifyNewMessage] Notification creation failed:", e);
    }
  }
}

export function notifyNewLead(
  leadName: string,
  phone?: string,
  conversationId?: string
) {
  playNotificationSound("lead");

  if (
    typeof window !== "undefined" &&
    "Notification" in window &&
    Notification.permission === "granted"
  ) {
    try {
      const notif = new Notification(`🎉 Novo Lead Recebido!`, {
        body: `${leadName || "Novo Contato"} ${phone ? `(${phone})` : ""}`,
        icon: "/icon",
        tag: `lead-${conversationId || "general"}`,
      });

      if (conversationId) {
        notif.onclick = () => {
          window.focus();
          window.location.href = `/inbox?c=${conversationId}`;
        };
      }
    } catch (e) {
      console.warn("[notifyNewLead] Notification creation failed:", e);
    }
  }
}
