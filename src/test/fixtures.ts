import type { HelpdeskRequest } from "../types";

export function request(overrides: Partial<HelpdeskRequest> = {}): HelpdeskRequest {
  return {
    id: 1,
    ref: "WO-1",
    title: "Room too warm",
    location: "North Wing",
    site_id: 11,
    status: "pending",
    priority: "High",
    created_at: "2026-10-06T02:15:07Z",
    updated_at: "2026-10-06T02:15:07Z",
    due_on: "2026-10-07",
    assignee: { id: 304, name: "Old Name" },
    deleted_at: null,
    merged_into_id: null,
    ...overrides,
  };
}
