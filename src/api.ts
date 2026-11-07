// A thin client for the helpdesk API. Components never call fetch directly; they go through here.

import { addDays, toApiDate } from "./lib/dates";
import type { ChangesPage, HelpdeskRequest, Page, RequestEvent, Site, Staff } from "./types";

const BASE = (import.meta.env.HELPDESK_URL ?? "").replace(/\/$/, "");
const TOKEN = import.meta.env.HELPDESK_TOKEN ?? "";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfterSeconds: number | null = null,
  ) {
    super(message);
  }
}

export function configured(): boolean {
  return Boolean(BASE && TOKEN);
}

type Params = Record<string, string | number | undefined>;

export async function get<T>(path: string, params: Params = {}, signal?: AbortSignal): Promise<T> {
  const url = new URL(BASE + path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` }, signal });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    const retryAfter = response.headers.get("Retry-After");
    throw new ApiError(response.status, body.error ?? response.statusText, retryAfter ? Number(retryAfter) : null);
  }
  return (await response.json()) as T;
}

/** Runs `task` for each item with at most `limit` in flight. */
async function mapLimit<I, O>(items: I[], limit: number, task: (item: I) => Promise<O>): Promise<O[]> {
  const results: O[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export const listRequests = (
  params: { page?: number; per_page?: number; created_from?: string; created_to?: string; status?: string },
  signal?: AbortSignal,
) => get<Page<HelpdeskRequest>>("/v1/requests", params, signal);

/**
 * Every request whose created_at could fall in [from, to] in some site's timezone.
 * The API filters on the UTC date, and sites are UTC+7..+11, so we widen the range by a day on
 * each side and let rule 1 (lib/rules.ts) decide on the site-local date.
 * Rows can repeat across pages while data changes; callers merge by id.
 */
export async function listRequestsInRange(
  from: string,
  to: string,
  signal?: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
): Promise<HelpdeskRequest[]> {
  const params = { per_page: 100, created_from: toApiDate(addDays(from, -1)), created_to: toApiDate(addDays(to, 1)) };
  const first = await listRequests({ ...params, page: 1 }, signal);
  const totalPages = first.total_pages ?? 1;
  let loaded = 1;
  onProgress?.(loaded, totalPages);
  const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
  const rest = await mapLimit(pages, 4, async (page) => {
    const result = await listRequests({ ...params, page }, signal);
    onProgress?.(++loaded, totalPages);
    return result.data;
  });
  return [first.data, ...rest].flat();
}

export const getRequest = (id: number, signal?: AbortSignal) => get<HelpdeskRequest>(`/v1/requests/${id}`, {}, signal);

export const listEvents = (id: number, page = 1, signal?: AbortSignal) =>
  get<Page<RequestEvent>>(`/v1/requests/${id}/events`, { page }, signal);

/** Every event of a request: follows has_more until the last page. */
export async function listAllEvents(id: number, signal?: AbortSignal): Promise<RequestEvent[]> {
  const events: RequestEvent[] = [];
  for (let page = 1; ; page++) {
    const result = await listEvents(id, page, signal);
    events.push(...result.data);
    if (!result.has_more || result.data.length === 0 || page >= 100) return events;
  }
}

export const listSites = (signal?: AbortSignal) => get<{ data: Site[] }>("/v1/sites", {}, signal);

export const listStaff = (signal?: AbortSignal) => get<{ data: Staff[] }>("/v1/staff", {}, signal);

/** The change feed. Omit the cursor to start from the beginning; an expired cursor is a 410. */
export const listChanges = (cursor: string | undefined, signal?: AbortSignal) =>
  get<ChangesPage>("/v1/changes", { cursor, limit: 500 }, signal);

export function describeError(error: unknown): string {
  if (error instanceof ApiError) return `${error.status}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return String(error);
}
