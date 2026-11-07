import { useEffect, useRef, useState } from "react";
import { ApiError, describeError, listChanges } from "../api";
import { digestChanges, type Digest } from "../lib/changes";

/** How often to ask for new changes once we're up to date (the brief wants changes within a minute). */
export const POLL_MS = 15_000;
const STORAGE_KEY = "helpdesk.changes.cursor";
const CURSOR_TTL_MS = 14 * 60_000; // the API expires cursors after 15 minutes
const FLUSH_EVERY_PAGES = 10;

export type FeedPhase = "catching-up" | "live" | "retrying";

export interface FeedStatus {
  phase: FeedPhase;
  lastSyncedAt: Date | null;
  error: string | null;
}

interface SavedCursor {
  cursor: string;
  seq: number;
  savedAt: number;
}

function loadCursor(): SavedCursor | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as SavedCursor | null;
    return saved && Date.now() - saved.savedAt < CURSOR_TTL_MS ? saved : null;
  } catch {
    return null;
  }
}

function saveCursor(saved: SavedCursor | null) {
  try {
    if (saved) localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode); we just catch up from the start next time.
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });
}

/**
 * Follows /v1/changes and hands each batch to `onChanges`.
 * The feed starts at the beginning of time (~160 pages), so a fresh tab first catches up; the cursor
 * is kept in localStorage so a reload within 14 minutes resumes instead. While catching up, batches
 * are flushed every few pages to keep React re-renders down. A 410 (expired cursor) starts over.
 */
export function useChangeFeed(onChanges: (digest: Digest, live: boolean) => void): FeedStatus {
  const [status, setStatus] = useState<FeedStatus>({ phase: "catching-up", lastSyncedAt: null, error: null });
  const handler = useRef(onChanges);
  handler.current = onChanges;

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function run() {
      const saved = loadCursor();
      let cursor = saved?.cursor;
      let lastSeq = saved?.seq ?? 0;
      let live = Boolean(saved);
      let failures = 0;
      let pending: Digest[] = [];

      const flush = () => {
        if (!pending.length) return;
        const merged = digestChanges([], lastSeq);
        for (const d of pending) {
          merged.requests.push(...d.requests);
          merged.staff.push(...d.staff);
          d.eventsFor.forEach((id) => merged.eventsFor.add(id));
        }
        pending = [];
        handler.current(merged, live);
      };

      while (!signal.aborted) {
        try {
          const page = await listChanges(cursor, signal);
          if (failures) setStatus((s) => ({ ...s, phase: live ? "live" : "catching-up", error: null }));
          failures = 0;
          const digest = digestChanges(page.data, lastSeq);
          lastSeq = digest.lastSeq;
          cursor = page.next_cursor;
          pending.push(digest);
          saveCursor({ cursor, seq: lastSeq, savedAt: Date.now() });

          if (page.has_more) {
            if (live || pending.length >= FLUSH_EVERY_PAGES) flush();
            continue;
          }
          flush();
          live = true;
          setStatus({ phase: "live", lastSyncedAt: new Date(), error: null });
          await sleep(POLL_MS, signal);
        } catch (e) {
          if (signal.aborted) return;
          if (e instanceof ApiError && e.status === 410) {
            // Expired cursor: start again from the beginning. Upserts are idempotent, so replaying is safe.
            cursor = undefined;
            lastSeq = 0;
            live = false;
            saveCursor(null);
            setStatus((s) => ({ ...s, phase: "catching-up", error: null }));
            continue;
          }
          failures++;
          const wait = e instanceof ApiError && e.retryAfterSeconds ? e.retryAfterSeconds * 1000 : Math.min(60_000, 2_000 * 2 ** failures);
          setStatus((s) => ({ ...s, phase: "retrying", error: describeError(e) }));
          await sleep(wait, signal);
        }
      }
    }

    void run();
    return () => controller.abort();
  }, []);

  return status;
}
