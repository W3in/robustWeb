import { useState } from "react";
import type { BoardRow, SortKey } from "../lib/board";
import { formatInstant, formatLocalDate } from "../lib/dates";
import { statusLabel } from "../lib/labels";
import { staffName, type StaffDirectory } from "../lib/rules";

const PAGE_SIZE = 100;

interface Props {
  rows: BoardRow[];
  staff: StaffDirectory;
  sort: SortKey;
}

export function RequestsTable({ rows, staff, sort }: Props) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const visible = rows.slice(0, limit);

  return (
    <>
      <div className="table-wrap">
        <table>
          <caption className="visually-hidden">
            Requests, sorted by {sort === "due" ? "due date, soonest first" : "created date, newest first"}
          </caption>
          <thead>
            <tr>
              <th scope="col">Ref</th>
              <th scope="col">Site</th>
              <th scope="col">Title</th>
              <th scope="col">Priority</th>
              <th scope="col">Status</th>
              <th scope="col">Assignee</th>
              <th scope="col" aria-sort={sort === "created" ? "descending" : undefined}>
                Created
              </th>
              <th scope="col" aria-sort={sort === "due" ? "ascending" : undefined}>
                Due
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ request, site, timeZone, overdue }) => (
              <tr key={request.id} className={overdue ? "overdue" : undefined}>
                <td data-label="Ref">{request.ref}</td>
                <td data-label="Site">{site?.name ?? `Site #${request.site_id}`}</td>
                <td data-label="Title">{request.title}</td>
                <td data-label="Priority">{request.priority ?? "—"}</td>
                <td data-label="Status">
                  <span className={`status status-${request.status}`}>{statusLabel(request.status)}</span>
                </td>
                <td data-label="Assignee">{staffName(staff, request.assignee?.id)}</td>
                <td data-label="Created">{formatInstant(new Date(request.created_at), timeZone)}</td>
                <td data-label="Due">
                  {request.due_on ? formatLocalDate(request.due_on) : "—"}
                  {overdue && <span className="badge-overdue">Overdue</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <p className="more">
          <button type="button" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
            Show {Math.min(PAGE_SIZE, rows.length - limit)} more ({rows.length - limit} hidden)
          </button>
        </p>
      )}
    </>
  );
}
