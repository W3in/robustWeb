import { useCallback, useEffect, useState } from "react";
import { parseFilters, serializeFilters, type Filters } from "../lib/board";

/** Filters live in the query string so a link reproduces the same board. */
export function useUrlFilters(): [Filters, (patch: Partial<Filters>) => void, () => void] {
  const [filters, setFilters] = useState<Filters>(() => parseFilters(window.location.search));

  useEffect(() => {
    const query = serializeFilters(filters);
    const url = new URL(window.location.href);
    const keep = new URLSearchParams(url.search);
    const next = new URLSearchParams(query);
    // Keep params that aren't filters (e.g. the open request) untouched.
    for (const [key, value] of keep) if (!["from", "to", "site", "status", "sort"].includes(key)) next.set(key, value);
    if (url.search !== `?${next}`) window.history.replaceState(window.history.state, "", `${url.pathname}?${next}${url.hash}`);
  }, [filters]);

  useEffect(() => {
    const onPop = () => setFilters(parseFilters(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const update = useCallback((patch: Partial<Filters>) => {
    setFilters((current) => {
      const next = { ...current, ...patch };
      if (next.from > next.to) {
        if (patch.from !== undefined) next.to = next.from;
        else next.from = next.to;
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => setFilters(parseFilters("")), []);

  return [filters, update, reset];
}
