import { describe, expect, it } from "vitest";
import { addDays, daysAgo, formatInstant, formatLocalDate, localDate, toApiDate } from "./dates";

describe("toApiDate", () => {
  it("turns an ISO date into the API's DD/MM/YYYY", () => {
    expect(toApiDate("2026-10-06")).toBe("06/10/2026");
  });

  it("refuses anything else", () => {
    expect(() => toApiDate("06/10/2026")).toThrow();
  });
});

describe("localDate", () => {
  it("is the next day in Sydney when it is still evening in UTC", () => {
    const instant = new Date("2026-10-06T15:30:00Z");
    expect(localDate(instant, "Australia/Sydney")).toBe("2026-10-07");
    expect(localDate(instant, "Asia/Singapore")).toBe("2026-10-06");
  });
});

describe("daysAgo", () => {
  it("counts back across a month boundary", () => {
    expect(daysAgo(30, new Date("2026-10-15T00:00:00Z"))).toBe("2026-09-15");
  });
});

describe("formatInstant", () => {
  it("shows the instant in the site's timezone and names the zone", () => {
    const instant = new Date("2026-10-06T15:30:00Z");
    expect(formatInstant(instant, "Asia/Singapore")).toBe("6 Oct 2026, 23:30 GMT+8");
    expect(formatInstant(instant, "Australia/Sydney")).toBe("7 Oct 2026, 02:30 GMT+11");
    expect(formatInstant(instant, "Asia/Jakarta")).toBe("6 Oct 2026, 22:30 GMT+7");
  });
});

describe("formatLocalDate", () => {
  it("formats a site-local date without shifting it", () => {
    expect(formatLocalDate("2026-10-07")).toBe("7 Oct 2026");
  });
});

describe("addDays", () => {
  it("does calendar arithmetic across month ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
