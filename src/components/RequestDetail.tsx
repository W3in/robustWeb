import { useEffect, useMemo, useRef, useState } from "react";
import { useRequestDetail } from "../hooks/useRequestDetail";
import { formatInstant, formatLocalDate } from "../lib/dates";
import { statusLabel } from "../lib/labels";
import { isOverdue, siteTimezone, staffName, type StaffDirectory } from "../lib/rules";
import { addAlias, firstResponse, resolveRecordedName, timeline, undoneEventIds, wallClockToInstant, type NameAliases } from "../lib/timeline";
import type { HelpdeskRequest, RequestEvent, Site } from "../types";

interface Props {
  id: number;
  boardCopy: HelpdeskRequest | undefined;
  sites: Map<number, Site>;
  staff: StaffDirectory;
  aliases: NameAliases;
  refreshKey?: number;
  onClose: () => void;
}

/** Request detail in a modal <dialog>: focus is trapped, Escape closes, focus returns to the row. */
export function RequestDetail({ id, boardCopy, sites, staff, aliases, refreshKey = 0, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const detail = useRequestDetail(id, refreshKey);
  const [showUndone, setShowUndone] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    return () => {
      dialog.close();
      opener?.focus();
    };
  }, []);

  // The board copy may be newer (live updates) than what we fetched, or vice versa.
  const request = newest(detail.request, boardCopy);
  const site = request ? sites.get(request.site_id) : undefined;
  const timeZone = siteTimezone(site);

  const knownNames = useMemo(() => {
    const merged: NameAliases = new Map([...aliases].map(([name, ids]) => [name, new Set(ids)]));
    for (const event of detail.events) addAlias(merged, event.actor_name, event.actor_id);
    return merged;
  }, [aliases, detail.events]);

  const visible = useMemo(() => timeline(detail.events, showUndone), [detail.events, showUndone]);
  const undone = useMemo(() => undoneEventIds(detail.events), [detail.events]);
  const first = useMemo(() => firstResponse(detail.events), [detail.events]);

  return (
    <dialog ref={dialogRef} className="detail" aria-labelledby="detail-title" onCancel={(e) => (e.preventDefault(), onClose())}>
      <div className="detail-head">
        <h2 id="detail-title">{request ? `${request.ref}: ${request.title}` : "Request"}</h2>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>

      {detail.error && !request && (
        <div role="alert" className="error">
          <p>Could not load this request: {detail.error}</p>
          <button type="button" onClick={detail.retry}>
            Retry
          </button>
        </div>
      )}
      {!request && detail.loading && <p role="status">Loading request…</p>}

      {request && (
        <>
          <dl className="facts">
            <dt>Site</dt>
            <dd>
              {site?.name ?? `Site #${request.site_id}`} <span className="muted">({timeZone})</span>
            </dd>
            <dt>Location</dt>
            <dd>{request.location}</dd>
            <dt>Status</dt>
            <dd>{statusLabel(request.status)}</dd>
            <dt>Priority</dt>
            <dd>{request.priority ?? "—"}</dd>
            <dt>Assignee</dt>
            <dd>{staffName(staff, request.assignee?.id)}</dd>
            <dt>Created</dt>
            <dd>{formatInstant(new Date(request.created_at), timeZone)}</dd>
            <dt>Updated</dt>
            <dd>{formatInstant(new Date(request.updated_at), timeZone)}</dd>
            <dt>Due</dt>
            <dd>
              {request.due_on ? formatLocalDate(request.due_on) : "—"}
              {isOverdue(request.status, request.due_on, timeZone) && <span className="badge-overdue">Overdue</span>}
            </dd>
            <dt>First response</dt>
            <dd>
              {detail.loading && !detail.events.length ? (
                "Loading…"
              ) : first ? (
                <>
                  {staffName(staff, first.actor_id)}, {formatInstant(new Date(first.at * 1000), timeZone)}{" "}
                  <span className="muted">({elapsed(new Date(request.created_at), new Date(first.at * 1000))} after creation)</span>
                </>
              ) : (
                "No response yet"
              )}
            </dd>
          </dl>

          <section aria-labelledby="history-title">
            <div className="history-head">
              <h3 id="history-title">History</h3>
              {undone.size > 0 && (
                <label className="inline">
                  <input type="checkbox" checked={showUndone} onChange={(e) => setShowUndone(e.target.checked)} />
                  Show {undone.size} undone event{undone.size === 1 ? "" : "s"}
                </label>
              )}
            </div>
            {detail.error && <p role="alert">Could not refresh the history: {detail.error}</p>}
            {detail.loading && !detail.events.length ? (
              <p role="status">Loading history…</p>
            ) : visible.length === 0 ? (
              <p>No events.</p>
            ) : (
              <ol className="timeline">
                {visible.map((event) => (
                  <EventItem key={event.id} event={event} undone={undone.has(event.id)} timeZone={timeZone} staff={staff} aliases={knownNames} />
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </dialog>
  );
}

function EventItem({
  event,
  undone,
  timeZone,
  staff,
  aliases,
}: {
  event: RequestEvent;
  undone: boolean;
  timeZone: string;
  staff: StaffDirectory;
  aliases: NameAliases;
}) {
  const due = event.due_at ? wallClockToInstant(event.due_at, timeZone) : null;
  return (
    <li className={undone ? "undone" : undefined}>
      <time dateTime={new Date(event.at * 1000).toISOString()}>{formatInstant(new Date(event.at * 1000), timeZone)}</time>
      <div>
        <strong>{event.actor_id === null ? "System" : staffName(staff, event.actor_id)}</strong> · {statusLabel(event.status)}
        {undone && <span className="muted"> (undone)</span>}
        {event.assignee_name && <div>Assigned to {resolveRecordedName(event.assignee_name, aliases, staff)}</div>}
        {event.due_at && <div>Due by {due ? formatInstant(due, timeZone) : `${event.due_at} (site local)`}</div>}
        {event.note && <div className="note">{event.note}</div>}
      </div>
    </li>
  );
}

function newest(a: HelpdeskRequest | null, b: HelpdeskRequest | undefined): HelpdeskRequest | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return b.updated_at > a.updated_at ? b : a;
}

function elapsed(from: Date, to: Date): string {
  const minutes = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  return [days && `${days}d`, hours && `${hours}h`, `${mins}m`].filter(Boolean).join(" ");
}
