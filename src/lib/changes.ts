// Turning a page of the change feed into updates for our own copy of the data.

import type { Change, HelpdeskRequest, Staff } from "../types";

export interface Digest {
  requests: HelpdeskRequest[];
  staff: Staff[];
  /** Requests that got new events (so an open detail view knows to refresh). */
  eventsFor: Set<number>;
  lastSeq: number;
}

/**
 * Items can arrive more than once (pages overlap), so anything at or below `lastSeq` is skipped.
 * `request` is the request as it is now, so the latest copy per id is all we need.
 */
export function digestChanges(changes: Change[], lastSeq: number): Digest {
  const requests = new Map<number, HelpdeskRequest>();
  const staff = new Map<number, Staff>();
  const eventsFor = new Set<number>();
  let seq = lastSeq;
  for (const change of [...changes].sort((a, b) => a.seq - b.seq)) {
    if (change.seq <= seq) continue;
    seq = change.seq;
    switch (change.type) {
      case "request.created":
      case "request.updated":
        requests.set(change.request.id, change.request);
        break;
      case "event.created":
        eventsFor.add(change.request_id);
        break;
      case "staff.updated":
        staff.set(change.staff.id, change.staff);
        break;
    }
  }
  return { requests: [...requests.values()], staff: [...staff.values()], eventsFor, lastSeq: seq };
}
