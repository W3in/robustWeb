# Requests board

React 18 + TypeScript + Vite. Reads the helpdesk practice API straight from the browser.

```bash
cp .env.example .env   # paste HELPDESK_URL and HELPDESK_TOKEN
npm install
npm run dev            # http://localhost:5173
npm test
npm run typecheck
npm run build
```

## What it does

- **Board**: requests for a date range (default last 30 days), filter by site and status, sort by
  created or due date, overdue marker. Range, filters, sort and the open request are in the URL.
- **Detail**: click a row (or Enter on its ref) for the request, its full event history in
  site-local time, undone events hidden (toggle to show), and the first response.
- **Live**: follows `/v1/changes`; shows the last-updated time.
- **CSV**: "Download CSV" exports every matching row in the current order
  (`requests-<from>-<to>.csv`).
- **Robust**: retries on 429/5xx/network errors, loading/empty/error states with Retry,
  card layout on phones, keyboard and screen-reader friendly.

## Code map

| Path | What |
| --- | --- |
| `src/api.ts` | The only place that calls `fetch`: auth, paging, retries, errors |
| `src/lib/rules.ts` | Rules 1-3: which requests count, overdue, staff names |
| `src/lib/timeline.ts` | Rules 4-6 for events: undone events, first response, wall-clock times |
| `src/lib/board.ts` | URL filters and row selection/sorting (shared by the board and CSV) |
| `src/lib/changes.ts` | Digesting change-feed pages |
| `src/lib/csv.ts` | CSV export |
| `src/hooks/` | Data loading, URL state, change feed |
| `src/components/` | Filters, table, detail dialog |

Assumptions, API findings and trade-offs are in [DECISIONS.md](DECISIONS.md).
