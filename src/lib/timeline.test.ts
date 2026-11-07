import { describe, expect, it } from "vitest";
import { firstResponse, resolveRecordedName, timeline, uniqueEvents, wallClockToInstant, type NameAliases } from "./timeline";
import { buildStaffDirectory } from "./rules";
import type { RequestEvent } from "../types";

function event(overrides: Partial<RequestEvent>): RequestEvent {
  return {
    id: 1,
    status: "pending",
    at: 1_000,
    actor_id: null,
    actor_name: "System",
    assignee_name: null,
    due_at: null,
    note: null,
    reverts_id: null,
    ...overrides,
  };
}

// Shaped like request 41214 in the practice data: a processing status set in error and reverted.
const events = [
  event({ id: 6, status: "complete", at: 600, actor_id: 347 }),
  event({ id: 4, status: "pending", at: 400, actor_id: 347, reverts_id: 3, note: "Status changed in error" }),
  event({ id: 3, status: "processing", at: 300, actor_id: 347 }),
  event({ id: 2, status: "processing", at: 200, actor_id: null }),
  event({ id: 5, status: "processing", at: 500, actor_id: 347 }),
  event({ id: 1, status: "pending", at: 100 }),
];

describe("timeline (rule 5)", () => {
  it("hides both the undo and the undone event, oldest first", () => {
    expect(timeline(events).map((e) => e.id)).toEqual([1, 2, 5, 6]);
  });

  it("can still show everything", () => {
    expect(timeline(events, true).map((e) => e.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("firstResponse (rule 6)", () => {
  it("is the earliest processing event with a person, skipping System and undone events", () => {
    expect(firstResponse(events)?.id).toBe(5);
  });

  it("is null when nobody has responded", () => {
    expect(firstResponse([event({ id: 1, status: "processing", actor_id: null })])).toBeNull();
  });
});

describe("uniqueEvents", () => {
  it("drops repeated ids", () => {
    expect(uniqueEvents([...events, events[0]]).length).toBe(events.length);
  });
});

describe("wallClockToInstant (rule 4)", () => {
  it("reads due_at as site-local wall-clock time", () => {
    expect(wallClockToInstant("07/10/2026 10:00", "Asia/Singapore")?.toISOString()).toBe("2026-10-07T02:00:00.000Z");
    expect(wallClockToInstant("07/10/2026 10:00", "Australia/Sydney")?.toISOString()).toBe("2026-10-06T23:00:00.000Z");
    expect(wallClockToInstant("garbage", "Asia/Jakarta")).toBeNull();
  });
});

describe("resolveRecordedName", () => {
  const directory = buildStaffDirectory([
    { id: 353, name: "Grace Ong-Wee" },
    { id: 368, name: "Marcus Lee" },
    { id: 371, name: "Marcus Lee" },
  ]);
  const aliases: NameAliases = new Map([
    ["Grace Ong", new Set([353])],
    ["Marcus Lee", new Set([368, 371])],
  ]);

  it("maps a stale name to the current one when it identifies one person", () => {
    expect(resolveRecordedName("Grace Ong", aliases, directory)).toBe("Grace Ong-Wee");
  });

  it("admits it can't tell when the name is ambiguous or unknown", () => {
    expect(resolveRecordedName("Marcus Lee", aliases, directory)).toBe("Marcus Lee (as recorded)");
    expect(resolveRecordedName("Nobody", aliases, directory)).toBe("Nobody (as recorded)");
  });
});
