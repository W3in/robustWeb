import { describe, expect, it } from "vitest";
import { buildStaffDirectory, countsInRange, isOverdue, mergeRequests, staffName } from "./rules";
import { request } from "../test/fixtures";

describe("countsInRange (rule 1)", () => {
  it("uses the site's local date, not the UTC date", () => {
    // 31 Oct 14:00 UTC is already 1 Nov in Sydney but still 31 Oct in Singapore.
    const r = request({ created_at: "2026-10-31T14:00:00Z" });
    expect(countsInRange(r, "Australia/Sydney", "2026-11-01", "2026-11-30")).toBe(true);
    expect(countsInRange(r, "Asia/Singapore", "2026-11-01", "2026-11-30")).toBe(false);
  });

  it("is inclusive at both ends", () => {
    const r = request({ created_at: "2026-10-06T02:15:07Z" });
    expect(countsInRange(r, "Asia/Singapore", "2026-10-06", "2026-10-06")).toBe(true);
  });

  it("skips canceled, deleted and merged requests", () => {
    const tz = "Asia/Singapore";
    expect(countsInRange(request({ status: "canceled" }), tz, "2026-10-01", "2026-10-31")).toBe(false);
    expect(countsInRange(request({ deleted_at: "2026-10-07T00:00:00Z" }), tz, "2026-10-01", "2026-10-31")).toBe(false);
    expect(countsInRange(request({ merged_into_id: 7 }), tz, "2026-10-01", "2026-10-31")).toBe(false);
  });
});

describe("isOverdue (rule 2)", () => {
  // 6 Oct 16:30 UTC: 7 Oct 03:30 in Sydney (UTC+11), 7 Oct 00:30 in Singapore (UTC+8), 6 Oct 23:30 in Jakarta (UTC+7).
  const now = new Date("2026-10-06T16:30:00Z");

  it("compares due_on with today's date in the site's timezone", () => {
    expect(isOverdue("pending", "2026-10-06", "Australia/Sydney", now)).toBe(true);
    expect(isOverdue("pending", "2026-10-06", "Asia/Singapore", now)).toBe(true);
    expect(isOverdue("pending", "2026-10-06", "Asia/Jakarta", now)).toBe(false);
  });

  it("is never overdue when due today, closed, or without a due date", () => {
    expect(isOverdue("processing", "2026-10-07", "Australia/Sydney", now)).toBe(false);
    expect(isOverdue("complete", "2026-09-01", "Australia/Sydney", now)).toBe(false);
    expect(isOverdue("canceled", "2026-09-01", "Australia/Sydney", now)).toBe(false);
    expect(isOverdue("pending", null, "Australia/Sydney", now)).toBe(false);
  });
});

describe("staff directory (rule 3)", () => {
  it("looks names up by id and disambiguates people who share a name", () => {
    const directory = buildStaffDirectory([
      { id: 304, name: "Benjamin Tan" },
      { id: 368, name: "Marcus Lee" },
      { id: 371, name: "Marcus Lee" },
    ]);
    expect(staffName(directory, 304)).toBe("Benjamin Tan");
    expect(staffName(directory, 371)).toBe("Marcus Lee (#371)");
    expect(staffName(directory, 999)).toBe("Unknown (#999)");
    expect(staffName(directory, null)).toBe("—");
  });
});

describe("mergeRequests", () => {
  it("deduplicates by id and keeps the most recently updated copy", () => {
    const older = request({ id: 5, status: "pending", updated_at: "2026-10-06T02:00:00Z" });
    const newer = request({ id: 5, status: "complete", updated_at: "2026-10-06T05:00:00Z" });
    const merged = mergeRequests(new Map(), [newer, older, request({ id: 6 })]);
    expect(merged.size).toBe(2);
    expect(merged.get(5)?.status).toBe("complete");
  });
});
