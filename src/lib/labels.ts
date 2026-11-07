import type { Status } from "../types";

const STATUS_LABELS: Record<Status, string> = {
  pending: "Pending",
  processing: "Processing",
  complete: "Complete",
  canceled: "Cancelled",
};

export function statusLabel(status: Status): string {
  return STATUS_LABELS[status] ?? status;
}
