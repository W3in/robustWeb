import { useEffect, useState } from "react";
import { ApiError, describeError, getRequest, listAllEvents } from "../api";
import { uniqueEvents } from "../lib/timeline";
import type { HelpdeskRequest, RequestEvent } from "../types";

export interface RequestDetailData {
  request: HelpdeskRequest | null;
  events: RequestEvent[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/** Loads one request and its full event history. Bump `refreshKey` to refetch in the background. */
export function useRequestDetail(id: number, refreshKey = 0): RequestDetailData {
  const [request, setRequest] = useState<HelpdeskRequest | null>(null);
  const [events, setEvents] = useState<RequestEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // A different request starts from a blank slate; a refresh keeps what's on screen.
  useEffect(() => {
    setRequest(null);
    setEvents([]);
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([getRequest(id, controller.signal), listAllEvents(id, controller.signal)])
      .then(([req, evs]) => {
        if (controller.signal.aborted) return;
        setRequest(req);
        setEvents(uniqueEvents(evs));
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof ApiError && e.status === 404 ? "This request no longer exists." : describeError(e));
        setLoading(false);
      });
    return () => controller.abort();
  }, [id, refreshKey, attempt]);

  return { request, events, loading, error, retry: () => setAttempt((n) => n + 1) };
}
