import { useCallback, useEffect, useMemo, useState } from "react";
import { configured } from "./api";
import { FiltersBar } from "./components/FiltersBar";
import { RequestDetail } from "./components/RequestDetail";
import { RequestsTable } from "./components/RequestsTable";
import { useBoardData } from "./hooks/useBoardData";
import { useChangeFeed } from "./hooks/useChangeFeed";
import { useSelectedRequest } from "./hooks/useSelectedRequest";
import { useUrlFilters } from "./hooks/useUrlFilters";
import { selectRows } from "./lib/board";
import type { Digest } from "./lib/changes";
import { addDays } from "./lib/dates";
import { buildStaffDirectory } from "./lib/rules";
import { addAlias, type NameAliases } from "./lib/timeline";

export default function App() {
  if (!configured()) {
    return (
      <main>
        <p role="alert">
          Save <code>HELPDESK_URL</code> and <code>HELPDESK_TOKEN</code> in <code>.env</code>, then restart <code>npm run dev</code>.
        </p>
      </main>
    );
  }
  return <Board />;
}

function Board() {
  const [filters, setFilters, resetFilters] = useUrlFilters();
  const data = useBoardData(filters.from, filters.to);
  useRetryWhenOnline(data.state === "error", data.reload);
  const [selectedId, setSelectedId] = useSelectedRequest();
  const [detailRefresh, setDetailRefresh] = useState(0);
  const now = useMinuteClock();
  const { upsertRequests, upsertStaff } = data;

  const onChanges = useCallback(
    (digest: Digest, live: boolean) => {
      // Only keep requests that could be in the current range (the feed covers all of history).
      const min = addDays(filters.from, -1);
      const max = addDays(filters.to, 1);
      upsertRequests(digest.requests.filter((r) => r.created_at.slice(0, 10) >= min && r.created_at.slice(0, 10) <= max));
      upsertStaff(digest.staff);
      if (live && selectedId !== null && (digest.eventsFor.has(selectedId) || digest.requests.some((r) => r.id === selectedId))) {
        setDetailRefresh((n) => n + 1);
      }
    },
    [filters.from, filters.to, selectedId, upsertRequests, upsertStaff],
  );
  const feed = useChangeFeed(onChanges);
  const lastUpdated = latest(feed.lastSyncedAt, data.loadedAt);

  const siteById = useMemo(() => new Map(data.sites.map((site) => [site.id, site])), [data.sites]);
  const staffById = useMemo(() => buildStaffDirectory(data.staff), [data.staff]);
  // Recorded names (request.assignee) -> staff ids, to resolve id-less names in event history.
  const aliases = useMemo(() => {
    const map: NameAliases = new Map();
    for (const person of data.staff) addAlias(map, person.name, person.id);
    for (const request of data.requests.values()) addAlias(map, request.assignee?.name, request.assignee?.id);
    return map;
  }, [data.staff, data.requests]);
  const rows = useMemo(() => selectRows(data.requests.values(), siteById, filters, now), [data.requests, siteById, filters, now]);

  return (
    <main>
      <header className="page-header">
        <h1>Requests board</h1>
        <p className="live" aria-live="polite">
          <span className={`dot dot-${feed.phase}`} aria-hidden="true" />
          {feed.phase === "live" && "Live"}
          {feed.phase === "catching-up" && "Catching up with recent changes…"}
          {feed.phase === "retrying" && `Live updates paused (${feed.error}); retrying`}
          {lastUpdated && (
            <>
              {" · "}Last updated <time dateTime={lastUpdated.toISOString()}>{formatClock(lastUpdated)}</time>
            </>
          )}
        </p>
      </header>

      <FiltersBar filters={filters} sites={data.sites} onChange={setFilters} />

      <div className="toolbar">
        <p className="muted" role="status">
          {data.state === "loading" && "Loading requests…"}
          {data.state === "ready" && `${rows.length} request${rows.length === 1 ? "" : "s"}`}
        </p>
      </div>

      {data.state === "loading" && (
        <progress
          className="loading"
          aria-label="Loading requests"
          max={data.progress?.total ?? 1}
          value={data.progress ? data.progress.loaded : undefined}
        />
      )}

      {data.state === "error" && (
        <div role="alert" className="error">
          <p>Could not load requests. {data.error}.</p>
          <button type="button" onClick={data.reload}>
            Retry
          </button>
        </div>
      )}

      {data.state === "ready" && rows.length === 0 && (
        <div className="empty">
          <p>No requests match these filters.</p>
          <button type="button" onClick={resetFilters}>
            Reset filters
          </button>
        </div>
      )}

      {data.state === "ready" && rows.length > 0 && (
        <RequestsTable key={JSON.stringify(filters)} rows={rows} staff={staffById} sort={filters.sort} onOpen={setSelectedId} />
      )}

      {selectedId !== null && (
        <RequestDetail
          key={selectedId}
          id={selectedId}
          boardCopy={data.requests.get(selectedId)}
          sites={siteById}
          staff={staffById}
          aliases={aliases}
          refreshKey={detailRefresh}
          onClose={() => setSelectedId(null)}
        />
      )}
    </main>
  );
}

/** Re-renders every minute so overdue markers flip at midnight without a reload. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** When the connection comes back after a failed load, try again without waiting for a click. */
function useRetryWhenOnline(failed: boolean, retry: () => void) {
  useEffect(() => {
    if (!failed) return;
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [failed, retry]);
}

function latest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/** Last updated is about this browser, so it uses the viewer's own clock and names the zone. */
function formatClock(date: Date): string {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" });
}
