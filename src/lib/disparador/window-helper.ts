/**
 * Helper utilities to enforce campaign sending window (janela_inicio - janela_fim).
 */

export function parseWindowTime(timeStr: string = "08:00"): { hours: number; minutes: number } {
  if (!timeStr || typeof timeStr !== "string") return { hours: 8, minutes: 0 };
  const parts = timeStr.split(":");
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  return {
    hours: isNaN(hours) ? 8 : Math.min(Math.max(hours, 0), 23),
    minutes: isNaN(minutes) ? 0 : Math.min(Math.max(minutes, 0), 59),
  };
}

/**
 * Returns true if the given Date falls strictly within [janelaInicio, janelaFim].
 */
export function isTimeInCampaignWindow(
  targetDate: Date,
  janelaInicio: string = "08:00",
  janelaFim: string = "20:00"
): boolean {
  const date = new Date(targetDate.getTime());
  const { hours: startH, minutes: startM } = parseWindowTime(janelaInicio);
  const { hours: endH, minutes: endM } = parseWindowTime(janelaFim);

  const windowStart = new Date(date.getTime());
  windowStart.setHours(startH, startM, 0, 0);

  const windowEnd = new Date(date.getTime());
  windowEnd.setHours(endH, endM, 0, 0);

  // If window spans overnight (e.g. 22:00 to 06:00)
  if (windowEnd.getTime() < windowStart.getTime()) {
    return date.getTime() >= windowStart.getTime() || date.getTime() <= windowEnd.getTime();
  }

  return date.getTime() >= windowStart.getTime() && date.getTime() <= windowEnd.getTime();
}

/**
 * Normalizes a target Date so that it is guaranteed to fall inside the campaign window.
 * If targetDate is before windowStart today, it moves to windowStart today.
 * If targetDate is after windowEnd today, it moves to windowStart TOMORROW.
 */
export function getNextValidWindowTime(
  targetDate: Date,
  janelaInicio: string = "08:00",
  janelaFim: string = "20:00"
): Date {
  const date = new Date(targetDate.getTime());
  const { hours: startH, minutes: startM } = parseWindowTime(janelaInicio);
  const { hours: endH, minutes: endM } = parseWindowTime(janelaFim);

  const windowStart = new Date(date.getTime());
  windowStart.setHours(startH, startM, 0, 0);

  const windowEnd = new Date(date.getTime());
  windowEnd.setHours(endH, endM, 0, 0);

  // Standard window (e.g. 08:00 to 20:00)
  if (windowStart.getTime() <= windowEnd.getTime()) {
    // 1. If date is before windowStart today (e.g. 04:25 AM when window is 08:00 - 20:00)
    if (date.getTime() < windowStart.getTime()) {
      return windowStart;
    }
    // 2. If date is after windowEnd today (e.g. 21:30 PM when window is 08:00 - 20:00)
    if (date.getTime() >= windowEnd.getTime()) {
      const tomorrowStart = new Date(windowStart.getTime());
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      return tomorrowStart;
    }
    return date;
  }

  // Overnight window (e.g. 22:00 to 06:00)
  if (!isTimeInCampaignWindow(date, janelaInicio, janelaFim)) {
    return windowStart;
  }

  return date;
}
