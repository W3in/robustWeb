import { describe, expect, it } from "vitest";
import { defaultFilters, parseFilters, selectRows, serializeFilters, type Filters } from "./board";
import { request } from "../test/fixtures";
import type { Site } from "../types";

const sites = new Map<number, Site>([
  [11, { id: 11, name: "Singapore", timezone: "Asia/Singapore", business_hours: {} }],
  [12, { id: 12, name: "Sydney", timezone: "Australia/Sydney", business_hours: {} }],
]);

const base: Filters = { from: "2026-10-01", to: "2026-10-31", site: "all", status: "all", sort: "created" };

describe("URL state", () => {
  it("round-trips filters through the query string", () => {
    const filters: Filters = { from: "2026-10-07", to: "2026-11-06", site: 12, status: "pending", sort: "due" };
    expect(parseFilters(serializeFilters(filters))).toEqual(filters);
  });

  it("falls back to defaults for missing or invalid values", () => {
    const defaults = defaultFilters("2026-11-07");
    expect(defaults.from).toBe("2026-10-08");
    expect(parseFilters("?from=2026-02-30&site=abc&status=canceled&sort=x", defaults)).toEqual(defaults);
  });

  it("swaps a reversed range", () => {
    const f = parseFilters("?from=2026-10-31&to=2026-10-01");
    expect([f.from, f.to]).toEqual(["2026-10-01", "2026-10-31"]);
  });
});

describe("selectRows", () => {
  const rows = [
    request({ id: 1, site_id: 11, created_at: "2026-10-05T00:00:00Z", due_on: "2026-10-20" }),
    request({ id: 2, site_id: 12, created_at: "2026-10-06T00:00:00Z", due_on: null, status: "processing" }),
    request({ id: 3, site_id: 11, created_at: "2026-10-07T00:00:00Z", due_on: "2026-10-10", status: "complete" }),
    request({ id: 4, site_id: 11, created_at: "2026-10-08T00:00:00Z", status: "canceled" }),
  ];

  it("filters by site id and status", () => {
    expect(selectRows(rows, sites, { ...base, site: 12 }).map((r) => r.request.id)).toEqual([2]);
    expect(selectRows(rows, sites, { ...base, status: "complete" }).map((r) => r.request.id)).toEqual([3]);
  });

  it("sorts newest first, or by due date with no due date last", () => {
    expect(selectRows(rows, sites, base).map((r) => r.request.id)).toEqual([3, 2, 1]);
    expect(selectRows(rows, sites, { ...base, sort: "due" }).map((r) => r.request.id)).toEqual([3, 1, 2]);
  });

  it("marks overdue rows using the site timezone", () => {
    const result = selectRows(rows, sites, base, new Date("2026-10-15T00:00:00Z"));
    expect(result.find((r) => r.request.id === 1)?.overdue).toBe(false);
    expect(result.find((r) => r.request.id === 3)?.overdue).toBe(false); // complete
    const later = selectRows(rows, sites, base, new Date("2026-10-21T00:00:00Z"));
    expect(later.find((r) => r.request.id === 1)?.overdue).toBe(true);
  });
});
