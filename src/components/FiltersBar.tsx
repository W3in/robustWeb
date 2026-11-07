import { STATUS_OPTIONS, type Filters, type SortKey, type StatusFilter } from "../lib/board";
import { statusLabel } from "../lib/labels";
import type { Site } from "../types";

interface Props {
  filters: Filters;
  sites: Site[];
  onChange: (patch: Partial<Filters>) => void;
}

export function FiltersBar({ filters, sites, onChange }: Props) {
  return (
    <form className="filters" aria-label="Board filters" onSubmit={(e) => e.preventDefault()}>
      <label>
        From
        <input
          type="date"
          value={filters.from}
          max={filters.to}
          required
          onChange={(e) => e.target.value && onChange({ from: e.target.value })}
        />
      </label>
      <label>
        To
        <input
          type="date"
          value={filters.to}
          min={filters.from}
          required
          onChange={(e) => e.target.value && onChange({ to: e.target.value })}
        />
      </label>
      <label>
        Site
        <select
          value={String(filters.site)}
          onChange={(e) => onChange({ site: e.target.value === "all" ? "all" : Number(e.target.value) })}
        >
          <option value="all">All sites</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Status
        <select value={filters.status} onChange={(e) => onChange({ status: e.target.value as StatusFilter })}>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status === "all" ? "All statuses" : statusLabel(status)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Sort by
        <select value={filters.sort} onChange={(e) => onChange({ sort: e.target.value as SortKey })}>
          <option value="created">Created (newest first)</option>
          <option value="due">Due date (soonest first)</option>
        </select>
      </label>
    </form>
  );
}
