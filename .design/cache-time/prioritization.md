# Prioritizing concurrent location boots — OPTIONAL, NOT A PRIORITY

Status: idea capture only. Nobody should build this before the cache-ttl
patch has lived for a while. Written 2026-08-24 because the question "do we
know what sessions are being asked for, for what projects?" deserved a
durable answer.

## What asks for which projects (verified against code + live logs)

Cold location boots are triggered by any request routed under a location.
The askers, in rough order of impact:

1. **TUI startup tab restore** — `tui/src/context/session-tabs.tsx`
   (~line 205): every persisted tab's session is synced in parallel
   (`Promise.allSettled(sessionIDs.map(data.session.sync))`). Each sync is
   `GET /api/session/{id}` (`client/src/solid/data.ts` ~1081), and
   `SessionLocationMiddleware` resolves each session row's own
   directory/workspaceID and provides its location — so restoring N tabs
   across M projects fires **M full service-stack builds simultaneously**
   on a cold/restarted server.
2. **Any session-scoped touch** — open/steer/message a session whose
   project is cold (fresh boot after restart, or after idle TTL eviction).
3. **Current-location requests** — `LocationMiddleware` derives the
   location from the request ref (cwd or `location[directory]` query /
   headers), e.g. the session picker's `location.sync()`.

Not an asker: `GET /api/session` (the list itself) is served from the
global DB and boots nothing beyond the requester's own location.

Live-log nuance: the biggest multi-directory boot storms in
`opencode-local.log` coincide with **server restarts** (e.g. the
2026-08-19T23:55 burst follows `systemctl --user restart opencode`; watcher
teardown for a dozen projects appears seconds earlier). Restart storms are
client reconnection fan-out, not TTL evictions — single-directory boots are
the TTL signature.

### Observability gap

Boot events log `directory` + `workspaceID` + `durationMs`, but nothing
records *which endpoint or session ID caused* a boot. Answering "what is
being asked for" precisely needs a small attribution addition (log the
route + sessionID from the middleware when it triggers a miss), not new
infrastructure.

## The optimization idea

When several locations are requested together, builds run concurrently and
unboundedly (RcMap forks a lookup fiber per missing key). Two consequences:

- The foreground session's boot competes with every background restore
  boot; the user-visible one can finish last.
- M parallel stacks building at once thrash CPU/disk (config parse, plugin
  host spawns, MCP connects per stack), making *all* of them slower.

The TUI already tries to help ("Delay the heavier per-tab data so the
visible session keeps the first connection slots") but phase 1 still syncs
all sessions unordered, and each can trigger a full boot.

### Option sketches

- **A. Bounded-concurrency priority queue server-side**: wrap LayerMap
  misses in a small semaphore (2–3 concurrent builds) ordered
  foreground-first. Needs a priority signal to be meaningful.
- **B. Client priority hints**: requests declare class (e.g.
  `x-opencode-priority: foreground|background`); the TUI marks the current
  session's syncs foreground and restores background. Server orders by it.
  Crosses the API surface — regeneration cost via `packages/client`.
- **C. Staged client restore (pure TUI change)**: sync the current tab's
  session fully first, then remaining tabs sequentially (or two at a time).
  No protocol work; probably captures most of the win for startup storms.
- **D. Boot attribution logging**: prerequisite instrumentation for any of
  the above; independently useful for diagnosing slow lists.

### Risks / notes

- RcMap already dedupes concurrent gets per key; any queue must wrap only
  misses, and must not deadlock with `invalidate` or scope-close paths.
- Starvation: background restores must eventually run; use FIFO within a
  class, never strict priority across classes without aging.
- With `OPENCODE_LOCATION_CACHE_TTL=infinity` deployed, restart storms stay
  but TTL churn disappears — measure again before choosing between A–C.

Recommendation if ever picked up: D first, then C (client-only), then B+A
only if measurement says the server-side ordering still matters.
