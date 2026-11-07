// Rules 4-6 for a request's event history.

import type { RequestEvent } from "../types";
import type { StaffDirectory } from "./rules";

/** Rule 5: an event with reverts_id undoes its target; both are hidden from the default timeline. */
export function undoneEventIds(events: RequestEvent[]): Set<number> {
  const hidden = new Set<number>();
  for (const event of events) {
    if (event.reverts_id !== null) {
      hidden.add(event.id);
      hidden.add(event.reverts_id);
    }
  }
  return hidden;
}

export function byTime(a: RequestEvent, b: RequestEvent): number {
  return a.at - b.at || a.id - b.id;
}

/** Oldest first, without undone events (unless asked for). */
export function timeline(events: RequestEvent[], includeUndone = false): RequestEvent[] {
  const hidden = includeUndone ? new Set<number>() : undoneEventIds(events);
  return events.filter((event) => !hidden.has(event.id)).sort(byTime);
}

/**
 * Rule 6: the earliest processing event by a person (System events have actor_id null).
 * Undone events don't count: the data has ~200 "Status changed in error" reverts of exactly
 * these processing events, and a status set by mistake isn't a response.
 */
export function firstResponse(events: RequestEvent[]): RequestEvent | null {
  return timeline(events).find((event) => event.status === "processing" && event.actor_id !== null) ?? null;
}

/** Keep one copy of each event id (pages shift while new events arrive). */
export function uniqueEvents(events: RequestEvent[]): RequestEvent[] {
  return [...new Map(events.map((event) => [event.id, event])).values()];
}

/**
 * Parses an event's site-local "DD/MM/YYYY HH:MM" into the instant it denotes in `timeZone`,
 * so it can be displayed like every other time, with the zone named.
 */
export function wallClockToInstant(value: string, timeZone: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match.map(Number);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  // The zone's offset at (roughly) that moment; good enough except inside a DST jump.
  const offset = zoneOffsetMs(new Date(asUtc), timeZone);
  return new Date(asUtc - offset);
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return local - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Names recorded on old data (e.g. an event's assignee_name) mapped to the staff ids that used them. */
export type NameAliases = Map<string, Set<number>>;

export function addAlias(aliases: NameAliases, name: string | null | undefined, id: number | null | undefined) {
  if (!name || id === null || id === undefined) return;
  let ids = aliases.get(name);
  if (!ids) aliases.set(name, (ids = new Set()));
  ids.add(id);
}

/**
 * Event assignee_name has no id. Resolve it to the person's current name when the recorded name
 * belongs to exactly one staff id; otherwise say it's the recorded (possibly stale) name.
 */
export function resolveRecordedName(name: string, aliases: NameAliases, directory: StaffDirectory): string {
  const ids = aliases.get(name);
  if (ids && ids.size === 1) {
    const [id] = ids;
    const current = directory.get(id);
    if (current) return current;
  }
  return `${name} (as recorded)`;
}
