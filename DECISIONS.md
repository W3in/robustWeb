# DECISIONS

Write in English. Short bullet points are fine. Reviewers read this file alongside your code.

## What I assumed

- **Default range** is 30 days ago through today, using the viewer's local date. After that, every
  "which day" question (rule 1, rule 2) uses the request's site timezone.
- **Status filter** offers Pending / Processing / Complete. Canceled requests never count (rule 1),
  so offering them would always show an empty board.
- **Sort**: "created" is newest first (like the API); "due" is soonest first with no due date last.
  Ties fall back to created, then id, so the order (and the CSV) is stable.
- **First response skips undone events.** Rule 6 says "earliest processing event with an actor";
  rule 5 says undone events are hidden. The data has 195 `processing` events by staff that were
  reverted with the note "Status changed in error". A status set by mistake isn't a response, so
  `firstResponse` only looks at the visible timeline. This changes the answer for 195 requests.
- **Overdue** uses the real current date in each site's timezone and is re-evaluated every minute.
- **"Last updated"** is the last time the board was in sync (initial load or a caught-up poll of the
  change feed). It is shown in the viewer's own clock with the zone named.
- **CSV** (client message, 6 Nov): exactly the board's rows (same range, filters, sort), not the
  100-row "Show more" window. `created_at` is written as site-local ISO 8601 with the offset
  (`2026-10-06T10:15:07+08:00`): site-local like the board, but still unambiguous for Finance.
  `assignee` is the current name from `/v1/staff`; `overdue` is `true`/`false`; empty cells for
  null priority, assignee and due date; CRLF line endings, no BOM (keeps the header byte-exact).

## What I found in the API or data

- **`created_from`/`created_to` filter on the UTC date**, not the site date (`01/11/2026` returns
  00:06Z..23:59Z). Sites are UTC+7..+11, so I ask the API for one extra day on each side and let
  rule 1 decide using the site-local date.
- **Pages overlap while data changes**: reading 6 pages gave 600 rows but only 595 ids. Rows are
  merged by id, keeping the copy with the latest `updated_at`.
- **Two staff are called "Marcus Lee"** (ids 368 and 371). Following rule 3 by id isn't enough to
  tell them apart on screen, so a name shared by several people is shown as `Marcus Lee (#371)`.
- **Names are stale**: ~320 of the board's rows carry an `assignee.name` that differs from
  `/v1/staff` (e.g. "Grace Ong" is now "Grace Ong-Wee"). The feed has `staff.updated` changes.
- **Event `assignee_name` has no id**, and rule 3 says recorded names can be stale. I map recorded
  names to ids using pairs seen elsewhere (`assignee.id`/`assignee.name`, `actor_id`/`actor_name`).
  If that identifies one person I show their current name; otherwise `Name (as recorded)`.
- **The change feed starts at the beginning of time**: ~80,000 items, 160 pages of 500, about a
  minute to drain. Consecutive pages overlap by two items (handled by tracking `seq`).
- **Rate limiting is real**: I hit a `429 Too many requests` on `/v1/changes` while the app was
  catching up. `Retry-After` is exposed through CORS, so the browser can honour it.
- One request (61684) has 67 events, so events really do need `has_more` paging.
- The newest request in the data was created on 2 Nov 2026; during my session no new changes
  appeared in the feed, so live updates are covered by unit tests and code review rather than seen.

## How I used AI

- I used Claude (Claude Code) as a pair programmer. I first asked it to probe the live API with
  `curl` and small Node scripts to look for surprises (the UTC date filter, page overlap, duplicate
  names, revert patterns, feed size) before writing any code.
- It drafted the rule helpers and their tests, the React hooks and components. I asked for one git
  branch per feature, merged into `main`, so the history shows the order of work.
- Things that came back wrong and were fixed: a test that assumed Jakarta was still on 6 Oct at
  17:00 UTC (it is midnight there); `localDate` built a new `Intl.DateTimeFormat` per call, too slow
  once the feed adds thousands of rows (now cached); a first mobile layout that overflowed on
  narrow screens (checked by rendering the app in headless Chrome at 390px).
- An earlier attempt (Copilot) produced a design doc that I used as a checklist; I re-checked each
  item against `docs/rules.md` and the real API instead of trusting it, which is how the
  "undone processing event" and "UTC date filter" issues were found.

## Trade-offs and what I would do next

- **Feed catch-up**: a new tab has to read the whole feed (~1 minute) before it can apply new
  changes; the board itself loads from `/v1/requests` in about a second, so nothing is blocked.
  The cursor is saved in `localStorage` for 14 minutes so reloads resume. With more time I'd ask
  the API for a "start from now" cursor, or fall back to re-fetching the board every 30s until the
  feed has caught up.
- **Polling every 15s** after catch-up keeps updates well within a minute at 4 calls/minute.
- The board keeps all requests near the selected range in memory and filters on the client; fine
  for a few thousand rows. For much more I'd move to server-side paging plus the feed.
- The detail view is a native modal `<dialog>` (focus trap, Escape, focus return for free).
- The table renders 100 rows at a time ("Show more") to keep the DOM light on phones.
- Not done: component tests with Testing Library, holidays/business hours (no rule uses them),
  an explicit indicator on rows that just changed, and a sort-direction toggle.
