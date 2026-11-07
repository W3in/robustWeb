// Finance's CSV export (client message, 6 Nov): every matching row, in the board's current order.

import type { BoardRow, Filters } from "./board";
import { staffName, type StaffDirectory } from "./rules";

export const CSV_HEADER = ["ref", "site", "title", "priority", "status", "assignee", "created_at", "due_on", "overdue"] as const;

/** RFC 4180 quoting, plus a guard so Excel doesn't run text that starts like a formula. */
export function csvField(value: string, text = false): string {
  let field = value;
  if (text && /^[=+\-@\t\r]/.test(field)) field = `'${field}`;
  return /[",\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

/** An instant as ISO 8601 in the site's timezone, with its offset: "2026-10-06T10:15:07+08:00". */
export function isoInZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const local = Date.UTC(+get("year"), +get("month") - 1, +get("day"), +get("hour"), +get("minute"), +get("second"));
  const offsetMinutes = Math.round((local - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}${offset}`;
}

/** Builds the CSV from the same rows the board shows (already filtered and sorted). */
export function toCsv(rows: BoardRow[], staff: StaffDirectory): string {
  const lines = [CSV_HEADER.join(",")];
  for (const { request, site, timeZone, overdue } of rows) {
    lines.push(
      [
        csvField(request.ref),
        csvField(site?.name ?? `Site #${request.site_id}`, true),
        csvField(request.title, true),
        csvField(request.priority ?? ""),
        csvField(request.status),
        csvField(request.assignee ? staffName(staff, request.assignee.id) : "", true),
        csvField(isoInZone(new Date(request.created_at), timeZone)),
        csvField(request.due_on ?? ""),
        overdue ? "true" : "false",
      ].join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

export function csvFilename(filters: Pick<Filters, "from" | "to">): string {
  return `requests-${filters.from}-${filters.to}.csv`;
}

/** Hands the CSV to the browser as a download. */
export function downloadCsv(csv: string, filename: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
