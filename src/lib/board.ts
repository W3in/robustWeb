// Board filters: parsing/serialising the URL, and turning the request map into the visible rows.

import { addDays, browserToday, isIsoDate } from "./dates";
import { countsInRange, isOverdue, siteTimezone } from "./rules";
import type { HelpdeskRequest, Site, Status } from "../types";

export type SortKey = "created" | "due";
export type StatusFilter = "all" | Exclude<Status, "canceled">;

export interface Filters {
  from: string;
  to: string;
  site: number | "all";
  status: StatusFilter;
  sort: SortKey;
}

export const STATUS_OPTIONS: StatusFilter[] = ["all", "pending", "processing", "complete"];

export function defaultFilters(today = browserToday()): Filters {
  return { from: addDays(today, -30), to: today, site: "all", status: "all", sort: "created" };
}

/** Reads filters from a query string; anything invalid falls back to the default. */
export function parseFilters(search: string, defaults = defaultFilters()): Filters {
  const params = new URLSearchParams(search);
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const site = Number(params.get("site"));
  const status = params.get("status") as StatusFilter | null;
  const sort = params.get("sort");
  const filters: Filters = {
    from: isIsoDate(from) ? from : defaults.from,
    to: isIsoDate(to) ? to : defaults.to,
    site: Number.isInteger(site) && site > 0 ? site : "all",
    status: status && STATUS_OPTIONS.includes(status) ? status : "all",
    sort: sort === "due" ? "due" : "created",
  };
  if (filters.from > filters.to) [filters.from, filters.to] = [filters.to, filters.from];
  return filters;
}

export function serializeFilters(filters: Filters): string {
  const params = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.site !== "all") params.set("site", String(filters.site));
  if (filters.status !== "all") params.set("status", filters.status);
  params.set("sort", filters.sort);
  return params.toString();
}

export interface BoardRow {
  request: HelpdeskRequest;
  site: Site | undefined;
  timeZone: string;
  overdue: boolean;
}

/** Rule 1 + site/status filters + sort. The board and the CSV export both use this. */
export function selectRows(
  requests: Iterable<HelpdeskRequest>,
  sites: Map<number, Site>,
  filters: Filters,
  now = new Date(),
): BoardRow[] {
  const rows: BoardRow[] = [];
  for (const request of requests) {
    if (filters.site !== "all" && request.site_id !== filters.site) continue;
    if (filters.status !== "all" && request.status !== filters.status) continue;
    const site = sites.get(request.site_id);
    const timeZone = siteTimezone(site);
    if (!countsInRange(request, timeZone, filters.from, filters.to)) continue;
    rows.push({ request, site, timeZone, overdue: isOverdue(request.status, request.due_on, timeZone, now) });
  }
  return rows.sort(filters.sort === "due" ? byDue : byCreated);
}

// Newest first, like the API.
function byCreated(a: BoardRow, b: BoardRow): number {
  return b.request.created_at.localeCompare(a.request.created_at) || b.request.id - a.request.id;
}

// Soonest due first; requests without a due date go last.
function byDue(a: BoardRow, b: BoardRow): number {
  const ad = a.request.due_on;
  const bd = b.request.due_on;
  if (ad !== bd) {
    if (ad === null) return 1;
    if (bd === null) return -1;
    return ad.localeCompare(bd);
  }
  return byCreated(a, b);
}
