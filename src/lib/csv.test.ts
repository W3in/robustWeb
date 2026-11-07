import { describe, expect, it } from "vitest";
import { selectRows, type Filters } from "./board";
import { csvField, csvFilename, isoInZone, toCsv } from "./csv";
import { buildStaffDirectory } from "./rules";
import { request } from "../test/fixtures";
import type { Site } from "../types";

const sites = new Map<number, Site>([
  [11, { id: 11, name: "Robusttechhouse Tower Singapore", timezone: "Asia/Singapore", business_hours: {} }],
  [12, { id: 12, name: "Robusttechhouse Court Sydney", timezone: "Australia/Sydney", business_hours: {} }],
]);
const staff = buildStaffDirectory([{ id: 304, name: "Benjamin Tan" }]);
const filters: Filters = { from: "2026-10-01", to: "2026-10-31", site: "all", status: "all", sort: "due" };

describe("toCsv", () => {
  const rows = selectRows(
    [
      request({ id: 1, ref: "WO-1", site_id: 11, created_at: "2026-10-06T02:15:07Z", due_on: "2026-10-20", assignee: { id: 304, name: "Stale Name" } }),
      request({ id: 2, ref: "WO-2", site_id: 12, title: 'Leak, "big" one', priority: null, created_at: "2026-10-05T23:00:00Z", due_on: "2026-10-08", assignee: null }),
      request({ id: 3, ref: "WO-3", status: "canceled" }),
    ],
    sites,
    filters,
    new Date("2026-10-10T00:00:00Z"),
  );
  const lines = toCsv(rows, staff).split("\r\n");

  it("starts with the exact header Finance asked for", () => {
    expect(lines[0]).toBe("ref,site,title,priority,status,assignee,created_at,due_on,overdue");
  });

  it("writes every matching row in the board's sort order, with site-local times and current names", () => {
    expect(lines.slice(1)).toEqual([
      'WO-2,Robusttechhouse Court Sydney,"Leak, ""big"" one",,pending,,2026-10-06T10:00:00+11:00,2026-10-08,true',
      "WO-1,Robusttechhouse Tower Singapore,Room too warm,High,pending,Benjamin Tan,2026-10-06T10:15:07+08:00,2026-10-20,false",
      "",
    ]);
  });
});

describe("csvField", () => {
  it("defuses spreadsheet formulas in free text", () => {
    expect(csvField("=HYPERLINK(1)", true)).toBe("'=HYPERLINK(1)");
    expect(csvField("2026-10-06")).toBe("2026-10-06");
  });
});

describe("isoInZone", () => {
  it("writes the instant in the site's zone with its offset", () => {
    expect(isoInZone(new Date("2026-10-06T15:30:00Z"), "Asia/Jakarta")).toBe("2026-10-06T22:30:00+07:00");
  });
});

describe("csvFilename", () => {
  it("is requests-<from>-<to>.csv", () => {
    expect(csvFilename({ from: "2026-10-08", to: "2026-11-07" })).toBe("requests-2026-10-08-2026-11-07.csv");
  });
});
