// Date helpers. The API wants DD/MM/YYYY; the rules talk about each site's local date.
// Every function that cares about "which day" takes the site's IANA timezone explicitly.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** "2026-10-06" -> "06/10/2026" (the format the API's created_from/created_to expect). */
export function toApiDate(isoDate: string): string {
  const match = ISO_DATE.exec(isoDate);
  if (!match) throw new Error(`Not a YYYY-MM-DD date: ${isoDate}`);
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

/** The YYYY-MM-DD date of an instant in a given IANA timezone. */
export function localDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Calendar arithmetic on a YYYY-MM-DD date (no timezone involved). */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Today's date, as YYYY-MM-DD, minus `days` days (UTC arithmetic on the calendar date). */
export function daysAgo(days: number, today = new Date()): string {
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - days));
  return date.toISOString().slice(0, 10);
}

/** Today's date in the browser's own timezone; used only for the default range. */
export function browserToday(now = new Date()): string {
  return localDate(now, Intl.DateTimeFormat().resolvedOptions().timeZone);
}

const instantFormats = new Map<string, Intl.DateTimeFormat>();

/**
 * "6 Oct 2026, 10:15 GMT+8": an instant shown in a site's timezone, with the zone named.
 * Fields are listed individually because dateStyle/timeStyle can't be combined with timeZoneName.
 */
export function formatInstant(instant: Date, timeZone: string): string {
  let format = instantFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZoneName: "short",
    });
    instantFormats.set(timeZone, format);
  }
  return format.format(instant);
}

/** "2026-10-07" -> "7 Oct 2026" without any timezone shifting (it's already a site-local date). */
export function formatLocalDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}
