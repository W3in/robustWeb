// The business rules from docs/rules.md, kept free of React so they can be unit tested.

import { localDate } from "./dates";
import type { HelpdeskRequest, Site, Staff, Status } from "../types";

export const FALLBACK_TIMEZONE = "UTC";

export function siteTimezone(site: Site | undefined): string {
  return site?.timezone ?? FALLBACK_TIMEZONE;
}

/** Rule 1: created_at's site-local date is within [from, to], and the request is live. */
export function countsInRange(request: HelpdeskRequest, timeZone: string, from: string, to: string): boolean {
  if (request.status === "canceled" || request.deleted_at !== null || request.merged_into_id !== null) return false;
  const created = localDate(new Date(request.created_at), timeZone);
  return created >= from && created <= to;
}

/** Rule 2: open, has a due date, and that date is before today in the site's timezone. */
export function isOverdue(status: Status, dueOn: string | null, timeZone: string, now = new Date()): boolean {
  if (status !== "pending" && status !== "processing") return false;
  if (dueOn === null) return false;
  return dueOn < localDate(now, timeZone);
}

export type StaffDirectory = Map<number, string>;

/**
 * Rule 3: names come from /v1/staff by id, never from the request or event.
 * Two staff members can share a name (there are two "Marcus Lee"s), so duplicates get their id.
 */
export function buildStaffDirectory(staff: Staff[]): StaffDirectory {
  const counts = new Map<string, number>();
  for (const person of staff) counts.set(person.name, (counts.get(person.name) ?? 0) + 1);
  return new Map(staff.map((person) => [person.id, (counts.get(person.name) ?? 0) > 1 ? `${person.name} (#${person.id})` : person.name]));
}

export function staffName(directory: StaffDirectory, id: number | null | undefined): string {
  if (id === null || id === undefined) return "—";
  return directory.get(id) ?? `Unknown (#${id})`;
}

/** Keep the most recent copy of each request (pages shift while we read them, so ids repeat). */
export function mergeRequests(current: Map<number, HelpdeskRequest>, incoming: HelpdeskRequest[]): Map<number, HelpdeskRequest> {
  const next = new Map(current);
  for (const request of incoming) {
    const existing = next.get(request.id);
    if (!existing || existing.updated_at <= request.updated_at) next.set(request.id, request);
  }
  return next;
}
