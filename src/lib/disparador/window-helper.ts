/**
 * Helper utilities to enforce campaign sending window (janela_inicio - janela_fim)
 * strictly in America/Sao_Paulo (Brasilia Time, UTC-3).
 */

const SAO_PAULO_TZ = "America/Sao_Paulo";

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
 * Returns year, month, day in America/Sao_Paulo for a given Date.
 */
function getSaoPauloYMD(d: Date): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: SAO_PAULO_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  const parts = formatter.formatToParts(d);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== "literal") {
      map[p.type] = parseInt(p.value, 10);
    }
  }

  return {
    year: map.year,
    month: map.month,
    day: map.day,
  };
}

/**
 * Builds a Date object corresponding to specific YYYY-MM-DD HH:mm:ss in America/Sao_Paulo (UTC-3).
 */
export function createSaoPauloDate(year: number, month: number, day: number, hours: number, minutes: number = 0, seconds: number = 0): Date {
  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const hh = String(hours).padStart(2, "0");
  const min = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  return new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}-03:00`);
}

/**
 * Returns true if the given Date falls strictly within [janelaInicio, janelaFim] in Brasilia Time.
 */
export function isTimeInCampaignWindow(
  targetDate: Date,
  janelaInicio: string = "08:00",
  janelaFim: string = "20:00"
): boolean {
  const ymd = getSaoPauloYMD(targetDate);
  const { hours: startH, minutes: startM } = parseWindowTime(janelaInicio);
  const { hours: endH, minutes: endM } = parseWindowTime(janelaFim);

  const windowStart = createSaoPauloDate(ymd.year, ymd.month, ymd.day, startH, startM, 0);
  const windowEnd = createSaoPauloDate(ymd.year, ymd.month, ymd.day, endH, endM, 0);

  if (windowEnd.getTime() < windowStart.getTime()) {
    return targetDate.getTime() >= windowStart.getTime() || targetDate.getTime() <= windowEnd.getTime();
  }

  return targetDate.getTime() >= windowStart.getTime() && targetDate.getTime() <= windowEnd.getTime();
}

/**
 * Normalizes a target Date so that it is guaranteed to fall inside the campaign window in Brasilia Time (America/Sao_Paulo).
 */
export function getNextValidWindowTime(
  targetDate: Date,
  janelaInicio: string = "08:00",
  janelaFim: string = "20:00"
): Date {
  const ymd = getSaoPauloYMD(targetDate);
  const { hours: startH, minutes: startM } = parseWindowTime(janelaInicio);
  const { hours: endH, minutes: endM } = parseWindowTime(janelaFim);

  const windowStart = createSaoPauloDate(ymd.year, ymd.month, ymd.day, startH, startM, 0);
  const windowEnd = createSaoPauloDate(ymd.year, ymd.month, ymd.day, endH, endM, 0);

  if (windowStart.getTime() <= windowEnd.getTime()) {
    // 1. If date is before windowStart today (in Brasilia Time)
    if (targetDate.getTime() < windowStart.getTime()) {
      return windowStart;
    }
    // 2. If date is after windowEnd today (in Brasilia Time), move to windowStart TOMORROW
    if (targetDate.getTime() >= windowEnd.getTime()) {
      const tomorrowStart = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000);
      return tomorrowStart;
    }
    return targetDate;
  }

  if (!isTimeInCampaignWindow(targetDate, janelaInicio, janelaFim)) {
    return windowStart;
  }

  return targetDate;
}
