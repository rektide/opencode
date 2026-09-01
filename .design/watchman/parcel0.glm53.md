---
type: Research
title: "parcel-watcher's Watchman backend vs our root-scoped layer"
description: How @parcel/watcher implements its built-in Watchman backend (C++/BSER, one shared socket, no reconnect), what passing backend:"watchman" through our wrapper would actually buy, and a scenario analysis for drop/keep/hybrid.
resource: /.design/watchman/parcel0.glm53.md
tags: [opencode, watchman, watchwoman, parcel-watcher, filesystem, research]
status: draft
generated: { by: model:glm-5.3, at: 2026-09-01T00:00:00Z }
sources:
  - id: parcel-watcher-archive
    resource: file:///home/rektide/archive/parcel-bundler/watcher
    title: "@parcel/watcher 2.6.0 full checkout (binding.gyp, index.js, wrapper.js, src/, test/)"
    author: github:parcel-bundler
  - id: our-root-scoped-layer
    resource: file:///home/rektide/src/opencode-watchman/packages/core/src/filesystem/watcher
  - id: accepted-design
    resource: /.design/watchman/draft2.gpt56t.md
  - id: daemon-validation
    resource: /.design/watchman/watchwoman0.unknown.md
  - id: timeout-incident
    resource: /.design/watchman/timeout0.gpt56s.md
  - id: maintenance-log
    resource: /.design/watchman/README.md
---

# parcel-watcher's Watchman backend vs our root-scoped layer (`parcel0`)

## Situation

The host daemon is `watchwoman` 0.7.0 (watchman-family, some divergences), and
this workspace carries a custom root-scoped Watchman backend
([`watcher/watchman/`](/packages/core/src/filesystem/watcher/watchman)) behind
`OPENCODE_WATCHER_BACKEND=watchman`. The user's question: @parcel/watcher
already *supports* watchman as a backend — how much of our own layer do we
actually need, and how would we use theirs?

This wave reads the actual @parcel/watcher source from the local archive
checkout (version 2.6.0; our repo pins 2.5.1 — see the version note below) and
compares it against our implemented design on the axes that motivated the
custom layer in the first place: failure domains, timeouts, reconnect, cursor
recovery, observability, and watchwoman compatibility.

TL;DR: parcel's watchman backend is real, compiled into every platform prebuild,
and would "work" through our existing wrapper with a ~5-line change — but it is
architecturally the *process-global, timeout-less, reconnect-less* client that
[`timeout0.gpt56s.md`](/.design/watchman/timeout0.gpt56s.md) documents as the
incident class, plus several silent-degradation behaviors we deliberately
removed. Keep our layer; optionally expose parcel's backend as a third selector
for A/B measurement, and consider lifting its snapshot (`getEventsSince`) idea.

## How @parcel/watcher's watchman backend actually works

### Language, build, availability

- It is **C++ inside the N-API addon**, not JS. `src/watchman/WatchmanBackend.cc`
  (+ `BSER.cc` codec, `IPC.hh` socket) implements the whole protocol;
  `binding.gyp` compiles the `WATCHMAN` define into **every** platform build:
  mac, linux/android, win, freebsd (`~/archive/parcel-bundler/watcher/binding.gyp:12-101`).
  There is **no JS-side watchman client anywhere** — the wasm/browser fallback
  (`src/wasm/`, `wasm/index.mjs`) is brute-force only, and `index.js` just
  loads the platform prebuild.
- Availability probe: `WatchmanBackend::checkAvailable()` tries to connect
  (`src/watchman/WatchmanBackend.cc:107-114`). It is only consulted when
  `backend === "watchman"` or `"default"` (`src/Backend.cc:39-43`) — on macOS
  `fs-events` wins for `"default"`, on linux/windows `"default"` prefers
  watchman **if installed**, else falls to inotify/windows, else brute-force
  (`src/Backend.cc:30-69`). This matches the README's documented priority.

### Socket discovery & transport

- Socket path: `WATCHMAN_SOCK` env var if set, otherwise it **popen()s
  `watchman --output-encoding=bser get-sockname`** and BSER-decodes the
  `sockname` field (`WatchmanBackend.cc:43-70`). The binary name is hardcoded —
  there is no `watchmanBinaryPath` equivalent. On Windows it's a named pipe
  with a 30s busy-wait (`IPC.hh:20-47`); on Unix a blocking `AF_UNIX` socket
  (`IPC.hh:49-58`).
- BSER framing: incremental length-prefixed reads (`readBSER`,
  `WatchmanBackend.cc:20-41`).

### One shared connection per process, one reader thread

This is the crux. `Backend::getShared(backend)` caches **one Backend instance
per backend *name* per process** (`src/Backend.cc:24-28, 71-85`). All
`backend: "watchman"` subscriptions in the process share:

- **one Unix socket** (`WatchmanBackend::mIPC`),
- **one reader thread** (`Backend::run()` spawns `start()`,
  `src/Backend.cc:101-121`),
- **one request/response handshake** with no request IDs: `watchmanRequest`
  writes the command, `notify`s the request signal, then **blocks on
  `mResponseSignal.wait()`** until the reader thread delivers the next
  non-subscription PDU as "the response" (`WatchmanBackend.cc:83-98`).

The reader loop (`WatchmanBackend.cc:164-217`) reads PDUs forever: PDUs with an
`error` field become the pending command's error; PDUs with a `subscription`
field are dispatched to the matching watcher (`handleSubscription`,
`WatchmanBackend.cc:147-162`); **everything else is assumed to be the response
to the current command**. Note there is no handling of the `unilateral` /
`log` PDU type that facebook watchman emits sporadically — an unsolicited log
PDU lands in `mResponse` and `notify()`s the sticky signal
(`src/Signal.hh:23-33`), so the **next** command would consume the log object
as its response (a one-place skew that surfaces as confusing field-missing
errors). Whether watchwoman ever emits unsolicited log PDUs is untested.

### No timeouts, no reconnect, no retry

- `mResponseSignal.wait()` has **no deadline**. A daemon that accepts the
  socket but never answers (socket-activated unit mid-restart, wedged crawl)
  blocks that command's `PromiseRunner` worker thread forever, and every
  subsequent command queues behind it — the reader thread only processes one
  response at a time and JS `subscribe` calls resolve from a libuv threadpool.
- When the socket dies: `IPC::read` throws "Socket ended unexpectedly"
  (`IPC.hh:146-160`), the loop notifies `mEndedSignal` and rethrows,
  `Backend::run`'s catch calls `handleError`, which **delivers the error to
  every subscription's JS callback and destroys the shared backend**
  (`src/Backend.cc:179-186`). There is no reconnect, no resubscribe, no cursor
  resume. The upstream test says it plainly: "should emit an error when
  watchman dies" (`test/watcher.js:957-983`, which just runs
  `watchman shutdown-server` and asserts the error callback fires). Recovery is
  entirely the JS caller's problem: a later `subscribe` re-runs
  `checkAvailable` (re-popen'ing the CLI) and builds a fresh backend.

### Subscription lifecycle

Per subscribed directory (`WatchmanBackend::subscribe`,
`WatchmanBackend.cc:281-327`):

1. `watch <dir>` — plain `watch`, **never `watch-project`** (good: immune to
   watchwoman's marker-climb/$HOME-crawl hazard documented in
   [`watchwoman0.unknown.md`](/.design/watchman/watchwoman0.unknown.md)).
2. subscription name = `"parcel-<watcher pointer>"` (`getId`,
   `WatchmanBackend.cc:273-278`) — unique per C++ `Watcher` object.
3. `clock <dir>` is taken **fresh at every subscribe** and passed as `since`
   (`WatchmanBackend.cc:298`), with `fields: [name, mode, exists, new]`.
4. ignore **paths** (absolute, under the dir) are pushed down as a
   `["not", ["anyof", ["dirname", rel]…]]` expression; ignore **globs/RegExps**
   are NOT pushed down — they are filtered client-side in C++ via
   `Watcher::isIgnored` (`WatchmanBackend.cc:300-320`, `src/Watcher.cc:218-241`).
   The JS `wrapper.js` is what splits `ignore` entries into `ignorePaths`
   (path-resolved) vs `ignoreGlobs` (picomatch/regex sources)
   (`~/archive/parcel-bundler/watcher/wrapper.js:5-51`).
5. The subscribe response's initial `files` payload is **discarded** — only
   subsequent unilateral PDUs are handled. Events between `clock` and
   subscribe-ack in the initial response are dropped (tiny window; our layer
   has the same clock-then-subscribe shape, see below).
6. Unsubscribe removes the entry and issues `unsubscribe` best-effort
   (`WatchmanBackend.cc:330-342`). When the last watcher leaves the backend,
   the shared backend is destroyed and the socket closed (`Backend::unref` →
   `removeShared`, `src/Backend.cc:87-99, 168-172`). No `watch-del` is ever
   sent.

### PDU → event mapping

`handleFiles` (`WatchmanBackend.cc:116-145`) maps each file entry:

- `new && exists` → `create`
- `exists && !S_ISDIR(mode)` → `update`
- `!new && !exists` → `delete`
- existing directories that aren't new → silently dropped (so watchwoman's
  `always_include_directories: true` default is harmless here)
- everything under an ignore path/glob is skipped client-side.

`is_fresh_instance` is **not consulted**. On a fresh-instance dump (real
watchman after cursor invalidation) every file arrives `new+exists` → the
consumer gets a **burst of `create` events for the entire tree**, debounced
into batches, rather than one conservative signal. There is also no
`canceled`-PDU handling (fine — watchwoman never sends one; real watchman can).

Events are accumulated per-path in an `EventList` that collapses create+delete
pairs (`src/Event.hh:30-69`) and delivered to JS through a shared debouncer:
first event in a batch goes out immediately, subsequent fast changes batch for
50 ms up to a 500 ms cap (`src/Debounce.cc:70-99`, `MIN/MAX_WAIT_TIME` in
`src/Debounce.hh`). So parcel-watchman output is debounced and per-path
coalesced — unlike our layer, which publishes per-PDU and leaves coalescing to
owner sliding queues.

### Sharing and dedup model

Two layers of sharing, both process-global statics:

- `Watcher::getShared(dir, ignorePaths, ignoreGlobs)` — identical
  (dir, ignore-set) triples share one `Watcher` and thus one daemon
  subscription (`src/Watcher.cc:24-33`). Different ignore sets on the same dir
  = different subscriptions.
- `Backend::getShared("watchman")` — **all** watchman watchers in the process
  share one backend, one socket, one reader thread. A crawl on project A and a
  subscribe on project B serialize on the same protocol head. There is no
  per-root isolation and no `relative_root` use at all: every watched
  directory is its own `watch` + subscription (nested targets become nested
  daemon roots, which watchman/watchwoman handle, at the cost of extra
  subscriptions).

### `getEventsSince` / `writeSnapshot`

The query APIs are implemented over watchman too: `writeSnapshot` stores the
`clock` string in a file; `getEventsSince` replays it as a `since` **query**
(`WatchmanBackend.cc:244-271`) — served from the daemon's in-memory tree with
no disk walk (on our host's watchwoman: 7 ms incremental, 83 ms expression
queries per [`watchwoman0.unknown.md`](/.design/watchman/watchwoman0.unknown.md)).
We don't use these APIs today; they're the "snapshot capability" draft2
explicitly deferred.

### Version note (2.5.1 vs archive 2.6.0)

Our repo pins `@parcel/watcher` **2.5.1** (`packages/core/package.json:91-128`);
the archive checkout is 2.6.0. `git diff v2.5.1 HEAD -- src/watchman/
src/Backend.cc` shows only mechanical changes (static-init-order fix for the
shared-backends map, `int r`→`size_t r` in `readBSER`, BinSkim hardening) —
the architecture, protocol handling, and all behaviors described above are
identical in 2.5.1.

## The API contract if we passed `backend: "watchman"` today

### What already flows through our wrapper

- [`watcher-binding.ts`](/packages/core/src/filesystem/watcher-binding.ts)
  loads the **platform package** directly (`@parcel/watcher-linux-x64-glibc`
  …) rather than going through `@parcel/watcher`'s `index.js`, but
  [`watcher.ts`](/packages/core/src/filesystem/watcher.ts) then wraps it with
  `createWrapper` from `@parcel/watcher/wrapper`
  ([watcher.ts:4,18-24](/packages/core/src/filesystem/watcher.ts)) — so the
  full JS option normalization (ignore → ignorePaths/ignoreGlobs, regex
  wrapping) applies, and `opts.backend` is passed straight through to the C++
  `getBackend` (`src/binding.cc:56-64`).
- Today `backend: "watchman"` never reaches parcel: the string is intercepted
  in `layer()` ([watcher.ts:105-115](/packages/core/src/filesystem/watcher.ts))
  and routed to our custom backend, and `getBackend()`
  ([watcher.ts:26-30](/packages/core/src/filesystem/watcher.ts)) only ever
  returns `fs-events`/`inotify`/`windows`. Using parcel's watchman backend is
  genuinely a small change: a third selector (e.g. `backend:
  "parcel-watchman"`) that passes `"watchman"` into `subscribeDirectory`
  instead of the platform name. Files already stay on `node:fs.watch` via the
  `type === "file"` branch, unchanged.

### The contract you get, enumerated

1. **First watchman-directory subscribe** popen()s the `watchman` CLI (or reads
   `WATCHMAN_SOCK`) from a worker thread. On this host `watchman` is
   watchwoman's argv-alias; whether it answers
   `--output-encoding=bser get-sockname` with a BSER-parsable `sockname` is
   **untested** (watchwoman advertises `bser-v2`, so plausible).
2. **If the probe fails** (no CLI, no daemon), C++ `getBackend` returns null
   and `Backend::getShared` **silently substitutes the platform default**
   (`src/Backend.cc:77-80` → `getShared("default")` → inotify on linux). No
   error, no log — and our `subscribeDirectory` would still report
   `backend: "watchman"` in the returned `Subscription` and the "watcher
   started" log line, because we echo the option we passed, not what C++
   chose. Silent-degradation observability hole.
3. **Events**: `{path, type: create|update|delete}`, debounced 50–500 ms,
   per-path coalesced, ignore-filtered (paths pushed down as `dirname`
   expressions, globs filtered in C++). Same `ParcelWatcher.Event` shape our
   consumers already take — zero consumer changes.
4. **Daemon death**: one error per JS callback → our `fail()` → the key's
   `failure` Deferred fails → **all subscriber streams for that directory
   fail** (and every watchman-backed directory in the process fails
   simultaneously, since one socket serves all). Our `Watcher` service has no
   retry — recovery means owners re-subscribing. Today our watchman layer
   instead reconnects with jittered backoff and resumes cursors invisibly.
5. **Slow/hung daemon**: no C++ timeout exists. Our wrapper's
   `subscribeTimeoutMs` (10 s, [`watcher.ts:303-319`](/packages/core/src/filesystem/watcher.ts))
   bounds only the initial `subscribe` promise — on timeout we log "failed to
   subscribe" and return an **inactive** entry, whose subscriber streams just
   *end* (shutdown PubSub). Established subscriptions have no deadline at all:
   a wedged protocol head silently stops delivering events forever.
6. **Configuration mapping**: `WATCHMAN_SOCK` is honored by C++; our
   `OPENCODE_WATCHMAN_BINARY` / `fs.watchman.binary` option **cannot** be
   mapped (C++ hardcodes the `watchman` binary name). Command/retry/metrics
   options have no counterpart.
7. **Platform coverage**: identical native binding everywhere we already ship
   prebuilds; if the platform package fails to load at all, our existing
   "watcher backend not supported" path returns an inactive entry — same as
   today's parcel path. No JS fallback exists to worry about (and none for
   watchman specifically).

## Capability comparison

| Capability | parcel watchman backend (C++) | our root-scoped layer |
| --- | --- | --- |
| Transport | BSER over Unix socket/named pipe, hardcoded `watchman` CLI discovery or `WATCHMAN_SOCK` | `@superbfowle/fb-watchman-esm` JS fork; `binary` override; `WATCHMAN_SOCK` via transport |
| Connection topology | **one socket per process** for all watchman subscriptions | one socket **per root intent** (project root / exact target) — independent failure domains |
| Command serialization | implicit single response signal; FIFO by construction; **no timeout** | per-generation semaphore, admitted dispatch, 60 s default deadline, tunable (`client.ts`, `root.ts`) |
| Slow-crawl behavior | blocks the protocol head for every project; nothing times out; events stop silently | submitted-command timeout retires exactly that root's generation; siblings unaffected |
| Daemon death | error to all callbacks; shared backend destroyed; no reconnect | jittered capped backoff, route re-resolve, cursor resume, conservative update on fresh/route change |
| Missed-event window on outage | new subscribe takes a fresh clock → outage gap lost | cursor `since` resume (`root.ts:387`, `establish`) |
| Cursor/since | `clock` per subscribe; `since` per subscription; `getEventsSince` query API (unused by us) | per-subscription cursor, resume, `is_fresh_instance` → one conservative update |
| Fresh instance | ignored → full `create` burst for whole tree | one `{type:"update"}` for the watched target |
| `canceled` PDU | no handling (no-op lookup miss) | conservative update + resubscribe that subscription |
| Typed decoding | none (field lookups; missing `files` throws) | Effect Schema PDU/response decoding (`schema.ts`) |
| Ignore handling | abs-path pushdown (`dirname` anyof-not), glob/regex filtered in C++; RegExp flags rejected | non-glob pushdown (`name`+`dirname`), micromatch locally; globs never pushed |
| `relative_root` / root sharing | no — one `watch`+subscription per directory; nested dirs = nested roots | one connection per project root, `relative_root` per subscription target |
| `watch-project` | never sent (safe vs watchwoman marker-climb) | never sent (design amendment 1) |
| Debounce | 50–500 ms shared debouncer + per-path event coalescing | none — immediate per-PDU publish; owners coalesce |
| Metrics | none | channel metrics: commands, timeouts, generations, reconnects, PDUs, files-in vs updates-out, gauges, wide/lines modes |
| Fallback | silent C++-level fallback to platform default; false `backend` label | explicit initial-acquisition fallback to Parcel with warning + `metrics.fallback()` |
| File watching | directories only | files always on `node:fs.watch` (`backend.ts:18`) |
| Placement/project routing | none — every target is standalone | project/exact placement from `WatchInterests` (`internal.ts`) |
| Unilateral `log` PDUs | misattributed as command responses (sticky-signal skew) | handled (`root.ts:155`) |
| Event-loss races | clock→subscribe-ack gap dropped (initial response files discarded) | same shape — equal |
| Test coverage (ours) | n/a | injected `RawClientFactory` suites + opt-in live watchwoman suite |

## Requirements scorecard against draft2 / README

Which of our documented design requirements would parcel's backend satisfy?

| Requirement (source) | parcel watchman backend |
| --- | --- |
| Daemon-root sharing, recursive crawl reuse (draft2 Decision) | **Satisfied** — `watch` per dir, daemon dedupes roots |
| One connection/failure domain per route intent (draft2 "Root-scoped") | **Not satisfied** — process-global single socket, the exact architecture draft2 deleted |
| Submitted-command deadline + generation retirement (timeout0 §3–4) | **Not satisfied** — no timeouts anywhere |
| Queue/admission separation (timeout0 §3) | **Not satisfied** — implicit FIFO, no admission concept |
| Unbounded recovery with jittered backoff after ack (draft2; README runtime shape) | **Not satisfied** — no reconnect at all |
| Cursor resume + conservative invalidation (draft2 Keep list) | **Not satisfied** — fresh clock per (re)subscribe; outage gap lost |
| Initial Parcel fallback before ack (draft2 Keep list) | **Partially, and silently** — falls back to inotify, not to our fallback path, with no signal and a wrong `backend` label |
| Typed response decoding (draft2 Keep list) | **Not satisfied** |
| Local ignore filtering + expression pushdown (draft2 Keep list) | **Satisfied** (paths pushdown + C++ glob filter) |
| Opt-in backend selection | **Satisfiable** with a third selector string |
| Metrics/observability (README Metrics) | **Not satisfied** — nothing observable except errors |
| No `watch-del`, client-side unsubscribe correctness | **Satisfied** (never sent; best-effort unsubscribe) |
| Plain `watch`, never `watch-project` (draft2 Amendment 1) | **Satisfied** |
| File watching stays on fs.watch | **Satisfied** via our existing file branch |
| watchwoman divergences handled (no `canceled`, no cursor rejection, dirs-in-results, best-effort unsubscribe — watchwoman0 claim 4) | **Mostly accidental**: dirs dropped via `mode`, no-canceled is a no-op, unsubscribe best-effort OK; but `is_fresh_instance:false` full dumps (watchwoman's stale-clock answer) arrive as a create-burst rather than one conservative signal — **semantically wrong for us and unknowable-without-testing how noisy it is in practice** |
| Works against socket-activated watchwoman at all (`get-sockname` probe, BSER sockname, unsolicited log PDUs) | **Unknowable without live testing** |

## Scenarios

### (a) Drop our layer, use parcel's watchman backend

Delete `watcher/watchman/*`, the transport fork deps, watchman config plumbing,
and tests; pass `backend: "watchman"` for directories.

- **Gain**: ~5 files and ~800 lines of core code plus config surface gone; one
  fewer native-adjacent dependency (`fb-watchman-esm` fork, `micromatch`); the
  daemon subscription lifecycle becomes parcel's problem.
- **Cost**: every "Not satisfied" row above. Specifically this reinstates the
  run-`84d0de5c` incident *class* documented in
  [`timeout0.gpt56s.md`](/.design/watchman/timeout0.gpt56s.md) — one serialized
  protocol head shared by all projects, except now with **no** 10-second timers
  to bound it: a wedged daemon silently stops event delivery process-wide, and
  daemon restart fails every stream simultaneously with no recovery. On a host
  running 30–60 projects (draft2's scale correction) that's a materially worse
  blast radius than the process-global JS manager we already replaced once.
- **Verdict**: only defensible if watchman adoption were speculative and we
  wanted a near-zero-maintenance toe-hold. It isn't — the daemon is deployed,
  validated, and the custom layer is implemented and tested.

### (b) Keep our layer (status quo)

- All requirements satisfied by construction; live-verified against
  watchwoman 0.7.0; metrics instrumented for the "make watchman default"
  decision (README Follow-ups).
- Cost is maintenance of ~800 focused lines and the transport fork
  (declarations follow-up already tracked).
- **This is the right default.** The custom layer exists precisely because the
  failure-domain, deadline, and recovery behaviors are product requirements,
  not niceties — they came out of a real incident.

### (c) Hybrid — anything worth lifting from parcel?

Reviewed everything; candidates:

1. **Expose `backend: "parcel-watchman"` as a third selector** (small change in
   [`watcher.ts`](/packages/core/src/filesystem/watcher.ts): a selector value
   that passes `"watchman"` into `subscribeDirectory`). Value: a
   zero-maintenance baseline for A/B measurement against our layer using the
   channel metrics as the instrument, and a fallback path for environments
   where the transport fork is unwanted. Caveats to document if added: silent
   platform fallback, no reconnect, false backend label, `binary` override
   inapplicable. Low cost, optional, measurement-motivated — reasonable but
   not urgent.
2. **Lift the `getEventsSince`/`writeSnapshot` idea, not the code**: parcel's
   watchman `since`-query path is exactly the deferred "snapshot capability"
   from draft2's crawl economics section (daemon-served enumeration, 7–83 ms on
   this host). If we ever want boot-time snapshots, implement `query` at our
   Watcher seam (parcel reports unsupported); don't route through parcel's C++
   just to get it.
3. **Per-path event coalescing (`EventList`) and the 50–500 ms debouncer**:
   deliberately *not* lifted — our owners' sliding queues own coalescing, and
   debouncing watchman PDUs would add latency to skill/config refresh for no
   measured benefit.
4. **Their protocol handling**: nothing to lift — it's C++, less correct than
   our fork for our purposes (no log-PDU handling, no timeouts), and we already
   run a JS transport with the hooks we need.

## Recommendation

**Keep the root-scoped layer (scenario b).** Parcel's watchman backend proves
the daemon-subscription idea is mainstream and confirms several of our
protocol choices (plain `watch`, path-expression pushdown, never `watch-del`)
— but it is a single-connection, deadline-free, reconnect-free client whose
failure profile is the documented incident class our layer was designed and
verified to eliminate, and it degrades silently where we degrade loudly with
metrics. Optionally add scenario (c)(1) as a cheap measurement selector if/when
the "watchman as default" decision wants a control group; nothing else in
their implementation is worth lifting.

## Open questions

1. **Does watchwoman's CLI answer parcel's discovery probe?** `watchman
   --output-encoding=bser get-sockname` returning a BSER `sockname` is
   assumed-plausible (bser-v2 capability advertised) but untested. This gates
   scenario (c)(1) entirely.
2. **Does watchwoman emit unsolicited unilateral `log` PDUs?** If yes, parcel's
   backend misattributes them as command responses (sticky-signal skew,
   `src/Signal.hh` semantics); our fork handles them. A 24h strace/journal
   sample would settle it.
3. **How noisy is the fresh-instance create-burst?** Watchwoman answers stale
   cursors with full state flagged `is_fresh_instance:false`; parcel would
   translate that into create events for the entire tree. Frequency on a
   socket-activated daemon restart is unknown.
4. If (c)(1) is added: should the silent C++ fallback-to-inotify be detected
   (e.g. probe once at selection time and refuse with a clear error instead)?
   Probably yes, given the false-backend-label trap.
5. Would pinning `@parcel/watcher` to 2.6.0 matter for any of this? No
   behavioral difference in the watchman backend (diff verified); the pin can
   move for unrelated reasons.

## Cross-references

- [`draft2.gpt56t.md`](/.design/watchman/draft2.gpt56t.md) — the implemented
  root-scoped architecture; its Keep list is the scorecard baseline, and its
  watchwoman amendments (plain `watch`, best-effort unsubscribe, stale-cursor
  full dumps) map directly onto parcel's behaviors.
- [`timeout0.gpt56s.md`](/.design/watchman/timeout0.gpt56s.md) — the FIFO
  cascade incident; parcel's backend reproduces the shared-protocol-head shape
  without even the timers that made the incident *visible*.
- [`watchwoman0.unknown.md`](/.design/watchman/watchwoman0.unknown.md) — daemon
  divergences (no canceled PDUs, no cursor rejection, dirs-in-results,
  unsubscribe semantics, query timings) used in the compatibility rows.
- [`README.md`](/.design/watchman/README.md) — current implementation state,
  config table, metrics, and the "make watchman default" follow-up that a
  parcel-backend control group would serve.
- [`watcher.ts`](/packages/core/src/filesystem/watcher.ts),
  [`watcher/watchman/backend.ts`](/packages/core/src/filesystem/watcher/watchman/backend.ts),
  [`watcher/watchman/root.ts`](/packages/core/src/filesystem/watcher/watchman/root.ts),
  [`watcher-binding.ts`](/packages/core/src/filesystem/watcher-binding.ts) —
  the repo surfaces this research compared against.
- Archive: `~/archive/parcel-bundler/watcher` —
  `src/watchman/WatchmanBackend.{cc,hh}`, `src/watchman/IPC.hh`,
  `src/watchman/BSER.cc`, `src/Backend.cc`, `src/Watcher.cc`, `src/binding.cc`,
  `src/Event.hh`, `src/Debounce.{cc,hh}`, `src/Signal.hh`, `wrapper.js`,
  `index.js`, `index.d.ts`, `binding.gyp`, `package.json`, `test/watcher.js`.
