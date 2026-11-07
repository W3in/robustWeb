import { describe, expect, it } from "vitest";
import { digestChanges } from "./changes";
import { request } from "../test/fixtures";
import type { Change } from "../types";

const at = "2026-11-01T00:00:00Z";

describe("digestChanges", () => {
  const changes: Change[] = [
    { seq: 3, at, type: "request.updated", request: request({ id: 7, status: "complete" }) },
    { seq: 1, at, type: "request.created", request: request({ id: 7, status: "pending" }) },
    { seq: 2, at, type: "event.created", request_id: 7, event: { id: 1, status: "pending", at: 1, actor_id: null, actor_name: "System", assignee_name: null, due_at: null, note: null, reverts_id: null } },
    { seq: 4, at, type: "staff.updated", staff: { id: 304, name: "Benjamin Tan" } },
    { seq: 4, at, type: "staff.updated", staff: { id: 304, name: "Benjamin Tan" } },
  ];

  it("keeps the latest copy of each request and collects staff and event updates", () => {
    const digest = digestChanges(changes, 0);
    expect(digest.requests).toHaveLength(1);
    expect(digest.requests[0].status).toBe("complete");
    expect(digest.staff).toEqual([{ id: 304, name: "Benjamin Tan" }]);
    expect([...digest.eventsFor]).toEqual([7]);
    expect(digest.lastSeq).toBe(4);
  });

  it("skips items it has already seen", () => {
    const digest = digestChanges(changes, 3);
    expect(digest.requests).toHaveLength(0);
    expect(digest.eventsFor.size).toBe(0);
    expect(digest.staff).toHaveLength(1);
  });
});
