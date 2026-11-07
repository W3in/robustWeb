import { useMemo } from "react";
import { configured } from "./api";
import { FiltersBar } from "./components/FiltersBar";
import { RequestsTable } from "./components/RequestsTable";
import { useBoardData } from "./hooks/useBoardData";
import { useUrlFilters } from "./hooks/useUrlFilters";
import { selectRows } from "./lib/board";
import { buildStaffDirectory } from "./lib/rules";

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
  const [filters, setFilters] = useUrlFilters();
  const data = useBoardData(filters.from, filters.to);

  const siteById = useMemo(() => new Map(data.sites.map((site) => [site.id, site])), [data.sites]);
  const staffById = useMemo(() => buildStaffDirectory(data.staff), [data.staff]);
  const rows = useMemo(() => selectRows(data.requests.values(), siteById, filters), [data.requests, siteById, filters]);

  return (
    <main>
      <header className="page-header">
        <h1>Requests board</h1>
      </header>

      <FiltersBar filters={filters} sites={data.sites} onChange={setFilters} />

      <p className="muted" role="status">
        {data.state === "loading"
          ? `Loading requests${data.progress ? ` (page ${data.progress.loaded} of ${data.progress.total})` : ""}…`
          : `${rows.length} request${rows.length === 1 ? "" : "s"}`}
      </p>

      {data.state === "error" && <p role="alert">Could not load requests: {data.error}</p>}
      {data.state === "ready" && <RequestsTable key={JSON.stringify(filters)} rows={rows} staff={staffById} sort={filters.sort} />}
    </main>
  );
}
