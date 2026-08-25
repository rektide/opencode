# Loading timeline — what gets loaded when (tabs & sessions)

Written 2026-08-25 to answer "why does loading the session list feel slow
even when a project has only 1–2 tabs?". Companion to
[`prioritization.md`](/home/rektide/src/opencode-cache-time/.design/cache-time/prioritization.md).

## Measured costs (live server DB, 2026-08-25)

`opencode-local.db` is **20.5 GB** (340k messages, 6,864 sessions, 3,897
top-level). The picker's query:

```sql
SELECT * FROM session_v2 WHERE parent_id IS NULL
ORDER BY time_updated DESC, id DESC LIMIT 50
```

- Query plan: index scan on `session_v2_parent_idx`, then **TEMP B-TREE
  sort** — there is no index leading on `time_updated`.
- Server-side cost: **~0.87s** with a cold OS page cache, **17–95ms** warm.
- For reference, cold **location stack boots** log median **7.4s**, p90
  **33s** (see [README](/home/rektide/src/opencode-cache-time/.design/cache-time/README.md)).

So the ranking is: location boot ≫ cold DB query ≫ warm DB query.

## Waterfall: TUI connect

All fire-and-forget unless noted (`client/src/solid/data.ts` connect path):

1. SSE event stream connects. Reconnect invalidates every cached read.
2. `session.active` fetch.
3. `location.get(defaultLocation)` — boots the current directory's stack if
   cold (deduped by key with any concurrent request for the same location).
4. `vcs.sync`, `project.sync`.
5. **Tab restore phase 1** (`session-tabs.tsx`): ALL persisted tab sessions
   synced in parallel. Each is `GET /api/session/{id}` whose middleware
   boots that session row's own project stack → up to one parallel cold
   boot **per distinct project with a restored tab**, regardless of how many
   tabs live in the current project.
6. Phase 2: per distinct location, `info` + `vcs` syncs in parallel.
7. Phase 3 (after `TAB_PREFETCH_DELAY`): messages/pending/permissions/forms
   for every non-current tab.

The server is one process: those parallel boots (config parse, plugin host
spawns, MCP connects, git scans per stack) share the event loop, so a
request whose own location is already warm still queues behind CPU-heavy
boot work. This is why *your* project's tab count does not predict the
wait.

## Waterfall: opening the session picker

`tui/src/component/dialog-session-list.tsx`:

1. On mount, the resource fires immediately with `{query: "", allProjects,
   location: pickerLocation()}`. No keystroke needed.
2. Fetcher awaits `data.location.sync(pickerLocation)` **first** if that
   location has no info yet — i.e. a possible full stack boot (median
   7.4s) before anything else happens. Note `pickerLocation()` is the
   *active session's* location when on a session route, so switching to a
   tab from another project and opening the picker targets that project.
3. Then it awaits `session.list` — global DB, ~20ms warm / ~0.9s cold,
   serialized after step 2.
4. While loading, the render memo returns `[]` ("Loading sessions…") —
   the dialog intentionally shows nothing rather than falling back to
   locally-known sessions during the first fetch.
5. Typing debounces 150ms and re-runs step 2–3 with `search LIKE %q%`
   (full-scan over titles).

## Why "slow even with 1–2 tabs"

- The wait is `max(location boot, …)` + global query, not a function of the
  current project's tab count.
- Restored tabs in *other* projects still storm the server at connect and
  delay every request through event-loop contention.
- Restart makes all locations cold simultaneously (client store wiped by
  reconnect too), so the first picker open pays boot + cold query stacked.

## Candidate refinements (not built)

Ordered by effort/impact; see also prioritization.md options A–D:

1. **Render `localSessions` immediately** while the first fetch is in
   flight instead of `[]` — the store often already holds recent sessions;
   pure UI change.
2. **Index for the list order**: `(parent_id, time_updated, id)` or
   equivalent so the sort disappears; removes the cold-query tail and helps
   search scans too.
3. **Staged restore** (prioritization.md option C): current tab fully first,
   remaining tabs sequentially — cuts the connect-time contention window.
4. **Skip the empty-query round trip** when the store can answer it;
   riskier (staleness semantics), needs product judgment.
