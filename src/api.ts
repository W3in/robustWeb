// A thin client for the helpdesk API. Components never call fetch directly; they go through here.

import { addDays, toApiDate } from "./lib/dates";
import { withRetry } from "./lib/retry";
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

const TIMEOUT_MS = 20_000;

/** One attempt, with a timeout so a hung connection becomes an error we can retry. */
async function getOnce<T>(url: URL, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new ApiError(0, "The helpdesk API did not answer in time")), TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` }, signal: controller.signal });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      const retryAfter = Number(response.headers.get("Retry-After"));
      throw new ApiError(response.status, body.error ?? response.statusText, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError || signal?.aborted) throw error;
    if (controller.signal.reason instanceof ApiError) throw controller.signal.reason;
    // fetch rejects with a TypeError when the network is down or the server is unreachable.
    throw new ApiError(0, "Could not reach the helpdesk API");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

/** GET with retries: 429 waits for Retry-After, 5xx/network errors back off (see lib/retry.ts). */
export async function get<T>(path: string, params: Params = {}, signal?: AbortSignal): Promise<T> {
  const url = new URL(BASE + path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return withRetry(() => getOnce<T>(url, signal), (e) => (e instanceof ApiError ? e : null), signal);
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

/** A sentence for the UI. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return error.message;
    if (error.status === 429) {
      return `The helpdesk API is busy${error.retryAfterSeconds ? ` (asked us to wait ${error.retryAfterSeconds}s)` : ""}`;
    }
    if (error.status === 401) return "The API token was rejected (401). Check HELPDESK_TOKEN in .env";
    if (error.status >= 500) return `The helpdesk API is having trouble (${error.status})`;
    return `${error.message} (${error.status})`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
