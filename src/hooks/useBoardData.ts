import { useCallback, useEffect, useState } from "react";
import { describeError, listRequestsInRange, listSites, listStaff } from "../api";
import { mergeRequests } from "../lib/rules";
import type { HelpdeskRequest, Site, Staff } from "../types";

export type LoadState = "loading" | "ready" | "error";

export interface BoardData {
  sites: Site[];
  staff: Staff[];
  requests: Map<number, HelpdeskRequest>;
  state: LoadState;
  error: string | null;
  progress: { loaded: number; total: number } | null;
  loadedAt: Date | null;
  reload: () => void;
  upsertRequests: (rows: HelpdeskRequest[]) => void;
  upsertStaff: (people: Staff[]) => void;
}

/** Loads sites, staff and every request page for the range; refetches when the range changes. */
export function useBoardData(from: string, to: string): BoardData {
  const [sites, setSites] = useState<Site[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [requests, setRequests] = useState<Map<number, HelpdeskRequest>>(new Map());
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setState("loading");
    setError(null);
    setProgress(null);
    Promise.all([
      listSites(signal),
      listStaff(signal),
      listRequestsInRange(from, to, signal, (loaded, total) => {
        if (!signal.aborted) setProgress({ loaded, total });
      }),
    ])
      .then(([siteList, staffList, rows]) => {
        if (signal.aborted) return;
        setSites(siteList.data);
        setStaff(staffList.data);
        // Merge rather than replace: live updates may already hold newer copies of these rows.
        setRequests((current) => mergeRequests(current, rows));
        setLoadedAt(new Date());
        setState("ready");
      })
      .catch((e: unknown) => {
        if (signal.aborted) return;
        setError(describeError(e));
        setState("error");
      });
    return () => controller.abort();
  }, [from, to, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const upsertRequests = useCallback((rows: HelpdeskRequest[]) => {
    if (rows.length) setRequests((current) => mergeRequests(current, rows));
  }, []);

  const upsertStaff = useCallback((people: Staff[]) => {
    if (!people.length) return;
    setStaff((current) => {
      const byId = new Map(current.map((p) => [p.id, p]));
      for (const person of people) byId.set(person.id, person);
      return [...byId.values()];
    });
  }, []);

  return { sites, staff, requests, state, error, progress, loadedAt, reload, upsertRequests, upsertStaff };
}
