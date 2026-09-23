import { useEffect, useState } from "react";

export const dateFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

export function relative(iso: string, now: number): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  if (abs < 60_000) return diff >= 0 ? "dans moins d'une minute" : "à l'instant";
  if (abs < 3600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 48 * 3600_000) return rtf.format(Math.round(diff / 3600_000), "hour");
  return rtf.format(Math.round(diff / 86_400_000), "day");
}

/** Dates are shown in the viewer's own time zone, so they are only rendered once in the browser. */
export function useNow(intervalMs = 30_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** "YYYY-MM-DDTHH:mm" in the browser's own time zone, as datetime-local expects. */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function nextQuarterIn(ms: number): Date {
  const d = new Date(Date.now() + ms);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15);
  return d;
}

export function at(hour: number, dayOffset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/**
 * Delivery times for a series. Whole-day intervals keep the same clock time
 * every day, across daylight-saving changes (18:00 stays 18:00), which adding
 * 24 hours at a time would not.
 */
export function seriesTimes(start: Date, count: number, intervalHours: number): Date[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    if (intervalHours % 24 === 0) d.setDate(d.getDate() + (i * intervalHours) / 24);
    else d.setTime(start.getTime() + i * intervalHours * 3600_000);
    return d;
  });
}
