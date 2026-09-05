---
type: Evidence
title: E12 follow-up raw transport lifecycle experiments under Bun
description: Controlled Bun experiments measuring which child processes, sockets, callbacks, timers, and handles survive or settle after Client.end(), remote end/error, caller interruption, delayed locator completion, failed locator, and a command submitted after end.
resource: /.design/watchman/v2-readd/v2-readd4-e12-transport-lifecycle0.glm53max.md
tags: [opencode, watchman, v2, lifecycle, transport, bun, experiment]
status: stable
generated: { by: model:zai/glm-5.3-max, at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-10-05
sources:
  - { id: transport, resource: "file:///home/rektide/src/watchman-esm/watchman/node/index.js", title: "@superbfowle/fb-watchman-esm@3.0.0 at jj 8ed9bbf44fec (content parent 3a463955acf6)" }
  - { id: opencode, resource: "https://github.com/anomalyco/opencode/commit/4306c07b340b9a0504e65785f366d2793cd1b169", title: OpenCode carrier base (runtime authority for the Bun pin) }
  - { id: effect, resource: "https://www.npmjs.com/package/effect/v/4.0.0-rc.112", title: effect 4.0.0-rc.112 (interruption scenarios) }
  - { id: e12, resource: /.design/watchman/v2-readd/v2-readd4-e12-lifecycle0.gpt56solmax.md, title: E12 lifecycle proof attempt }
  - { id: e04, resource: /.design/watchman/v2-readd/v2-readd4-e04-interleavings0.gpt56solmax.md, title: E04 interleaving audit }
  - { id: validation, resource: /.design/watchman/v2-readd/v2-readd4-validation0.gpt56solxh.md, title: v4 wave-one validation and N3 assignment }
  - { id: apparatus, resource: "file:///home/rektide/tmp-opencode/v4-n3-transport-lifecycle/", title: experiment apparatus and logs }
---

# E12 follow-up: raw transport lifecycle under controlled Bun experiments

## Result

**Controlled Bun 1.4.1 experiments confirm every E12/E04 raw-transport claim tested — `Client.end()` settles callbacks synchronously but returns before socket close, cancels no locator child, and is not a terminal state (a later command reconnects, and a delayed locator connects a fresh socket after end) — and add three measured facts the source audit did not state: a failed locator permanently wedges the client in `connecting: true` so even `end()` plus a working binary leaves a new command queued forever with no spawn, a socket `error` leaves the dead socket object in `this.socket` so no later command recovers without an intervening `end()`, and Bun's in-process handle-reporting APIs list nothing for live sockets or children, so all survivor evidence had to come from `/proc` fd counts, process-tree sampling, and natural-exit liveness.**

This is a research report only. It does not select or recommend any wrapper,
controller, timeout, or transport change.

## Exact runtime and source pins

| Source | Pin actually used | Notes |
| --- | --- | --- |
| Bun runtime | `bun 1.4.1` (mise `latest`) | The carrier base `4306c07b` declares `packageManager: bun@1.4.2`; 1.4.2 is not installed on this host. **All results below are Bun 1.4.1**, one patch below the carrier pin. No 1.4.2-specific behavior was assumed. |
| Transport | `/home/rektide/src/watchman-esm`, jj working copy `8ed9bbf44fec` (clean, empty), parent `3a463955acf6`; package `@superbfowle/fb-watchman-esm@3.0.0` | Imported directly by absolute path; its own `@superbfowle/bser-esm@3.0.0` dependency resolved from the checkout's `node_modules`. |
| Effect | npm `effect@4.0.0-rc.112`, installed into the scratch tree | Interruption scenarios S10/S10b only. Same version the carrier catalog and donor lockfile pin (per E12/E04). |
| OpenCode | `4306c07b340b9a0504e65785f366d2793cd1b169` | Used only as the authority for the Bun pin; no carrier code was loaded. |
| Host | Linux `7.1.0-debplus.1`, x86_64 | Unix-domain sockets only. |

Safety posture (verified, not asserted): the shell environment exports
`WATCHMAN_SOCK=/home/rektide/.local/state/watchman/rektide-state/sock` pointing
at the active Watchwoman. Every scenario launch used `env -u WATCHMAN_SOCK` and
the harness deleted `process.env.WATCHMAN_SOCK` before any client existed; the
only socket paths ever contacted are under the scratch tree. The active
Watchwoman process (PID 806505) was confirmed identical and untouched before
and after the whole suite. All fake-locator children were killed by recorded
pid and the scratch tree was verified free of residue.

## Apparatus

All artifacts live in `/home/rektide/tmp-opencode/v4-n3-transport-lifecycle/`
(`README.md` there describes the layout; `logs/*.jsonl` are the authoritative
traces, one JSON line per event with millisecond-since-start timestamps).

- **`lib/harness.ts`** — JSONL event logger (`fs.writeSync` to fd 1, order
  preserved); transport-event instrumentation (`connect`, `error`, `end`,
  `subscription`, `log`, plus socket `end`/`error`/`close` captured at connect
  time, so socket events remain observable after the transport nulls its
  field); callback wrappers that log every invocation; a private Unix-socket
  server built on the transport's own `bser-esm` (`dumpToBuffer` responses,
  `loadFromBuffer` request decode) with `hold` / `respondAfter` / `finAfter` /
  `destroyAfter` behaviors; an **unref'd watchdog** that logs and exits 99 —
  because it is unref'd, it never holds the loop, so "watchdog fired" itself
  proves a surviving handle.
- **`bin/w-*` fake locators** — `w-normal` (immediate sockname), `w-slow`
  (delay in milliseconds), `w-never` (never completes), `w-fail-exit` (exit 3
  with stderr), `w-badjson` (exit 0, garbage stdout), `w-errorfield` (exit 0,
  `{"error":...}`), plus an ENOENT path variant. Each records its pid to a
  per-run pidfile for deterministic cleanup.
- **`run-one.sh`** — one scenario per Bun process: `env -u WATCHMAN_SOCK`,
  `timeout -k 2 25` outer belt, and an external observer sampling
  `ps` of the process tree and the `/proc/<pid>/fd` socket count every 250 ms
  into `logs/*.obs`.
- **16 runs** across 15 scenarios (S5/S6/S6b were re-run after a harness bug —
  the first `w-slow` passed milliseconds to `sleep`, which takes seconds; the
  superseded runs' logs remain but are marked invalid for their intended
  purpose. One superseded S6 run incidentally corroborates S7: its child
  outlived the client process and was killed by cleanup.)

### Runtime observation-method finding

Bun 1.4.1's `process.getActiveResourcesInfo()` and `process._getActiveHandles()`
returned `[]` **while a server and a connected client socket were provably live**
(probe logged in the trace set). Handle evidence therefore comes from three
process/source-supported substitutes: `/proc/self/fd` socket-fd counts inside
the trace, external `/proc/<pid>/fd` + `ps` sampling, and natural-exit liveness
(`process_exit` events and exit codes). This is a property of the runtime, not
of the transport, and it bounds what any in-process supervisor on this runtime
can see.

## Traces and findings by case

Times are milliseconds since scenario start, from `logs/<name>.jsonl`. Socket
counts are `socket:`-prefixed fds in `/proc/self/fd` (Bun uses socketpairs for
child stdio, so a running locator contributes 2).

### S1 — `Client.end()` while connected, idle

| t | Event |
| --- | --- |
| 41.1 | first command callback success (server responded) |
| 260.3 | handles: 3 socket fds; `end_call` |
| 260.7 | `end_returned` (returns in ~0.4 ms; `void`) |
| 261.0–261.7 | server sees FIN; socket `end` then `close` (hadError=false) |
| 261.5 | **client `end` event fires** (see finding below) |
| 663.0 | `process_exit`, code 0 |

Findings: `end()` settles nothing asynchronously and returns before the socket
closes (Δ ≈ 1.4 ms here, unbounded in principle). The transport emitted a
client `end` event **after** local `end()`: `socket.end()` half-closes, the peer
(default `allowHalfOpen=false`) answers with FIN, the client socket raises
`end`, and the transport's remote-end handler runs again — re-nulling
socket/bunser, re-running `cancelCommands` (a no-op), and emitting `end`. E12's
"emits no `end` event" is correct **synchronously** and incomplete
**asynchronously**: there is a post-`end()` window (sub-millisecond locally,
unbounded on a real transport) in which the transport's remote-end path can
still run.

### S2 — `Client.end()` with a pending, server-withheld command

| t | Event |
| --- | --- |
| 159.7 | handles: 3 fds; `end_call` |
| 159.8 | **callback error `The client was ended` — inside `end()`, before it returned** |
| 160.1 | `end_returned` |
| 160.5–161.1 | server FIN; socket `end`/`close`; client `end` |
| 562.4 | `process_exit`, code 0 |

Findings: synchronous callback settlement strictly precedes `end()`'s return
and the socket close. Ordering proven: **callback → server FIN → socket close →
client `end`**.

### S3 — remote FIN with a pending command (no `end()` ever called)

| t | Event |
| --- | --- |
| 260.2 | server sends FIN |
| 261.0 | callback error `The watchman connection was closed` |
| 261.0 | client `end` event — **same tick, after the callback** |
| 261.0–261.4 | socket `end`/`close` |
| 612.0 | `process_exit`, code 0 |

Findings: E04's decisive ordering — the transport cancels command callbacks
synchronously **before** emitting `end` — is confirmed empirically, with the
socket-level events in the same tick. Everything settles; the process drains
naturally with no local `end()`.

### S4 — remote `destroy()` after reading the command

Server `conn.destroy()` at 260.0. Observed client-side: **identical to S3**
(callback at 260.9 → client `end` → socket `end`/`close`, `hadError=false`),
i.e. an abrupt destroy with no unread receive data surfaces as a clean `end`,
not an `error`, on this kernel. No `ECONNRESET` path was produced this way; the
error path is exercised by S5.

### S5 — connect refused (`WATCHMAN_SOCK` route, dead path), then writes onto the dead socket, then recovery

| t | Event |
| --- | --- |
| 6.3 | client `error` `connect ENOENT …/dead.sock` (unix-socket refusal) |
| 306.6 | fields: `socket != null` (**dead socket object retained**), `connecting=false`, 1 queued command; fds 0 |
| ~306 | second command submitted → written onto the destroyed socket object |
| 607.5 | **no second error event, no callback settlement** (fds 0) |
| 609.1 | listener now bound on the same path; third command submitted |
| 909.6 | **no recovery**: nothing sent, nothing settled (fds: listener only) |
| 909.6–910.0 | `end()` → **all three callbacks settle synchronously** with `The client was ended` |
| 910.7–942.6 | fourth command, after `end()`: new connection, response, **success** |
| 1413.0 | client `end` via peer-FIN round trip; clean close |
| 1714.1 | `process_exit`, code 0 |

Findings: a socket `error` **never settles any command** (first command stayed
queued from t≈5 to t≈910). It resets `connecting=false` but leaves the dead
socket object in `this.socket`, so subsequent commands are written into a
destroyed socket and **no later command recovers** without an intervening
`end()`. Under Bun 1.4.1 the write-onto-destroyed-socket produced **no
observable error event** (a Node-documented `ERR_STREAM_DESTROYED` emission was
not observed in this runtime). `end()` clears the field, after which the client
is fully reusable. (First run of S5, before the closing fix, additionally
showed the recovered connection's idle socket keeping the process alive 8 s
until the watchdog — the transport never closes an idle connected socket.)

### S6 — delayed locator completion + `end()` during the child (listener present)

| t | Event |
| --- | --- |
| 206.4 | handles: 3 fds (listener + 2 child-stdio socketpairs); `end_call` |
| 206.6 | callback `The client was ended` (inside `end()`); `end_returned`; **child not killed** |
| ~906 | `w-slow` (900 ms) exits 0 with sockname |
| 910.6 | **`server_connection` — the transport connected 704 ms after `end()`** |
| 910.9 | client `connect` event; queue empty (command was cancelled at 206), so nothing is written |
| 2707.7 | fields: `socket != null`, `connecting=false`, 0 commands — an **idle connected socket with no work**, 2.5 s after end |
| 6000.6 | watchdog: process still alive (unref'd timer proves loop is held by fds); exit 99 |

Findings: **discovery can and does connect after `end()`**. The locator child
survives `end()`, completes, and `makeSock` runs regardless of `end()`; the
resulting socket sits connected and idle **indefinitely** — nothing in the raw
transport will ever close it (5.3 s here; the run was killed by the watchdog).
The harness's own server close then hung on that open connection because Bun
1.4.1 has no `closeAllConnections`; that hang is an apparatus footnote, and the
socket survivor is the finding.

### S6b — delayed locator + `end()`, no listener on the target path

Child completes at ~906; late `createConnection` fails: client `error`
`connect ENOENT /nonexistent/w-sock` at **909.4 — 705 ms after `end()`**; dead
socket object retained; no callbacks left to settle; fds 0; `process_exit` 0.
Error events can surface from locator completion long after `end()`.

### S7 — never-completing locator + `end()`

Child (`sh w-never` + `sleep 600`) alive through `end()` at 304.7 and through
the 5 s watchdog (external observer shows both pids and 2 stdio socket fds the
whole time); watchdog exit 99; the child **outlived the client process** and was
killed by pidfile cleanup. Confirms E12's unbounded-survivor case: no transport
timeout, no cancellation path, and the child's stdio keeps the event loop
alive.

### S8a–d — failed locator variants

| Variant | First event (t ≈ 5 ms) | `connecting` after | Callback | Exit |
| --- | --- | --- | --- | --- |
| `w-fail-exit` (exit 3) | `error` "… returned with exit code=3 …" | **true** | never settles | 0, natural |
| ENOENT binary | `error` "Watchman was not found in PATH…" | **true** | never settles | 0, natural |
| `w-badjson` | `error` "JSON Parse error…" | **true** | never settles | 0, natural |
| `w-errorfield` | `error` "locator-error-field" | **true** | never settles | 0, natural |

Findings: every locator failure path emits `error` and leaves the queued
command callback **permanently unsettled** — yet holds no handle, so the
process exits cleanly with a silently abandoned callback. All four leave
`connecting: true`, because only the socket `connect`/`error` handlers (never
reached on these paths) reset it.

### S8e — the post-failure wedge (new fact)

After `w-fail-exit` fails: `connecting: true`; `end()` at 404.6 settles the
queued callback but **`connecting` stays true** (404.8). A new command on the
same client with a **working** binary is then queued and never even spawns a
child (0 fds, `commandsLen: 1`, `currentCommand: false` at 2405.8); its
callback never settles; `process_exit` 0. A client whose discovery failed once
is permanently unusable — no retry, no event, only silent callback silence.
Neither `end()` nor new commands reset the wedge.

### S9 — a command submitted after `end()` (post-end reconnect)

First cycle: connect → response → `end()` at 209.5 → clean close (211). Second
command at ~461: **full reconnect** — a second locator child, a second server
connection (462.3), the command written (462.6), response, callback success
(492.9). Second `end()` at 713 → clean close; `process_exit` 0. `end()` is not
a terminal state; the Client object is fully reusable, at the cost of one fresh
child process and socket per cycle.

### S10 — Effect rc.112 caller interruption, response arrives later

| t | Event |
| --- | --- |
| 130.0 | submitted; 3 fds |
| 130.7 | **`Fiber.interrupt` completes in 0.7 ms** — fiber settled, socket untouched (3 fds) |
| 510.2 | server responds |
| 510.7 | **raw callback executes post-interruption** (`fiberInterrupted: true`, success result logged) — the Effect `resume` is a no-op |
| 731.2 | `end()`; clean close; `process_exit` 0 |

### S10b — interruption, server never responds

Interrupt at 131.4 settles only the fiber: the raw command stays pending on the
open socket (3 fds at 632, half a second later). `end()` at 632.1 then settles
the raw callback (`The client was ended`) synchronously inside `end()`, still
post-interruption. Interruption cancels **nothing** at the transport level;
`end()` remains the only local settlement path.

## Cross-case summaries

### Callback ordering (all cases, measured)

| Case | Order observed |
| --- | --- |
| Local `end()`, commands pending | callback error **inside `end()`, before it returns** → peer FIN → socket `close` → client `end` (≈1 ms later) |
| Local `end()`, idle | (no callbacks) → socket `close` → client `end` via peer-FIN round trip |
| Remote FIN / destroy | callback error → client `end` — same tick, callback first (E04 confirmed) |
| Socket `error` (refused) | `error` event only; **no callback ever**; dead socket object retained |
| Locator failure | `error` event only; **no callback ever**; `connecting` wedged true |
| Delayed locator after `end()` | `connect` (listener) or `error` (no listener) **after** `end()`; nothing to settle |
| Effect interruption | fiber settles immediately; raw callback still runs later (S10) or waits for `end()` (S10b); at-most-once `resume` holds |

### Timers

The transport source contains no timer APIs (`setTimeout`/`setInterval` absent
from `watchman/node/index.js`; verified by grep), and no experiment ever showed
a survivor that was not a file descriptor: every scenario whose fds reached 0
exited naturally, including ones with permanently unsettled callbacks. All
survivors were sockets or child-stdio socketpairs. No transport-owned timer
exists to survive anything.

### Process-exit liveness matrix

| Scenario | Survivors at script end | Natural exit? | Exit code |
| --- | --- | --- | --- |
| S1, S2, S3, S4, S9, S10, S10b | none after socket close | yes | 0 |
| S5 (final form) | none | yes | 0 |
| S5 (idle recovered socket, first run) | idle connected socket | **no** (watchdog) | 99 |
| S6 late-connected idle socket | connected idle socket | **no** (watchdog) | 99 |
| S6b late-failed connect | dead socket object (no fd) | yes | 0 |
| S7 never-completing child | child + stdio socketpairs; outlives process | **no** (watchdog; child killed in cleanup) | 99 |
| S8a–e | none — but callbacks permanently unsettled | yes | 0 |

### Logical callback settlement vs OS resource termination

| | OS resource terminated | OS resource still live |
| --- | --- | --- |
| **Callback settled** | S3/S4 remote end (cancel + FIN both complete); S1/S2/S9/S10 after `end()` + close | `end()` returns while the socket fd is open (ms-scale); S6's idle post-`end()` socket — logically quiescent, **fd live indefinitely** |
| **Callback never settled** | S5 refused (fd gone at ~6 ms, callback pending until `end()` at 909); S8a–e (child gone, callback abandoned forever, process exits anyway) | S7 (child alive, callback pending); S10b pre-`end()` (socket alive, fiber already interrupted) |

The two axes are independent in both directions; the raw transport offers no
primitive that couples them.

## E12 fact disposition

| E12/E04 source-reading claim | Experiment verdict |
| --- | --- |
| `Client.end()` returns `void`, does not await socket close | **Confirmed** (returns in <1 ms; close 1.4 ms later; no handle returned) |
| `end()` synchronously cancels active and queued callbacks | **Confirmed** (settlement observed strictly before `end()` returned, S2/S5/S8e) |
| `end()` sets no permanent ended state; a later command can connect again | **Confirmed** (S9 full reconnect; S5 fourth command) |
| `end()` cannot cancel or join the `get-sockname` child | **Confirmed** (S6 child completes and connects after `end()`; S7 child outlives `end()` and the process) |
| Local `end()` emits no `end` event | **Qualified** — true synchronously; a client `end` fires ≈1 ms later via the peer-FIN round trip, re-running `cancelCommands` in a post-`end()` window |
| Socket `error` does not settle commands | **Confirmed** (unsettled 900 ms until `end()`; source allows forever) |
| E12's implicit "new command after error retries" | **Contradicted in part** — the error path retains the dead socket object; retries without an intervening `end()` are swallowed (S5 c2/c3); recovery exists only through `end()` |
| E04: clean remote end invokes the command callback before the `end` listener sees anything | **Confirmed** (S3/S4, same-tick ordering) |
| E04: local `end()` with callbacks pending settles them before nulling the socket | **Confirmed** (S2) |
| E12: discovery child "not retained on the client" | **Confirmed behaviorally** — no field, no kill, no join (S6/S7) |
| *(new)* Failed discovery wedges `connecting: true` forever | **Established** (S8a–e); absent from E12/E04 text |
| *(new)* Bun 1.4.1 in-process handle APIs are blind to sockets/children | **Established** (probe in trace set); constrains any in-process supervision |

## Confidence and gaps

- **High confidence** (direct, repeated, deterministic observations on this
  host): synchronous `end()` callback settlement; post-`end()` reconnect;
  delayed-locator connect-after-end with an indefinitely idle socket; child
  survival past `end()` and past process death; refused-socket non-settlement;
  locator-failure non-settlement with clean exit; the `connecting` wedge;
  Effect-interruption separation from raw callback execution.
- **Medium confidence**: the Bun 1.4.1-specific silence of write-after-destroy
  (one runtime, one observation path); the peer-FIN `end` emission depends on
  the peer closing its half — a daemon using `allowHalfOpen` semantics could
  suppress it, and the real Watchwoman's socket-close behavior was deliberately
  not contacted.
- **Gaps**: Bun 1.4.1 vs the carrier's 1.4.2 pin (patch delta, untested);
  Unix sockets only (no TCP, no Windows paths); no mid-stream `ECONNRESET`
  (destroy-after-read yields FIN here); no malformed-BSER/garbage-PDU case
  (E03 territory); no daemon-side subscription teardown observation (client
  `end()` leaves the daemon's view unmeasured by design); Effect scenarios
  cover `Effect.callback` + `Fiber.interrupt` only, not the donor's
  semaphore/timeout composition (N4's assignment); single kernel and host.

## Cross-references

- [`v2-readd4-validation0.gpt56solxh.md`](v2-readd4-validation0.gpt56solxh.md) — assigned this N3/E12 follow-up; its gate table listed raw-transport lifecycle behavior as the remaining E12 item.
- [`v2-readd4-e12-lifecycle0.gpt56solmax.md`](v2-readd4-e12-lifecycle0.gpt56solmax.md) — the source-audit claims this report confirms, qualifies, and extends (wedge state, dead-socket retention).
- [`v2-readd4-e04-interleavings0.gpt56solmax.md`](v2-readd4-e04-interleavings0.gpt56solmax.md) — its callback-before-`end`-event ordering and late-connect guard rationale are now experimentally grounded (S3/S4, S6).
- [`v2-readd4-e03-protocol-ordering0.glm53max.md`](v2-readd4-e03-protocol-ordering0.glm53max.md) — command-response classification; the response-withheld and clean-close behaviors exercised here are its PDU-level complement.
- [`v2-readd4-e11-acquisition0.gpt56solmax.md`](v2-readd4-e11-acquisition0.gpt56solmax.md) — the acquisition circuit's connection-failure predicate must account for the wedge and dead-socket facts above.

## Strongest primary references

- Transport source, all line-referenced behaviors:
  [`watchman/node/index.js`](file:///home/rektide/src/watchman-esm/watchman/node/index.js)
  — FIFO/cancel ([L72–L112](file:///home/rektide/src/watchman-esm/watchman/node/index.js#L72-L112)),
  locator/discovery ([L114–L273](file:///home/rektide/src/watchman-esm/watchman/node/index.js#L114-L273)),
  `command` admission ([L275–L291](file:///home/rektide/src/watchman-esm/watchman/node/index.js#L275-L291)),
  `end()` ([L353–L361](file:///home/rektide/src/watchman-esm/watchman/node/index.js#L353-L361)).
- Authoritative traces:
  [`logs/`](file:///home/rektide/tmp-opencode/v4-n3-transport-lifecycle/logs/) —
  notably [`s6-delayed-locator-end.jsonl`](file:///home/rektide/tmp-opencode/v4-n3-transport-lifecycle/logs/s6-delayed-locator-end.jsonl)
  (connect-after-end), [`s8e-post-failure-wedge.jsonl`](file:///home/rektide/tmp-opencode/v4-n3-transport-lifecycle/logs/s8e-post-failure-wedge.jsonl)
  (permanent wedge), [`s5-econnrefused.jsonl`](file:///home/rektide/tmp-opencode/v4-n3-transport-lifecycle/logs/s5-econnrefused.jsonl)
  (dead-socket retention and recovery), and
  [`s10-effect-interrupt-late-response.jsonl`](file:///home/rektide/tmp-opencode/v4-n3-transport-lifecycle/logs/s10-effect-interrupt-late-response.jsonl)
  (interruption vs raw callback).
- OpenCode carrier base pin:
  [`package.json` `packageManager`](https://github.com/anomalyco/opencode/blob/4306c07b340b9a0504e65785f366d2793cd1b169/package.json#L7)
  (bun@1.4.2; experiments ran on the nearest installed 1.4.1).
