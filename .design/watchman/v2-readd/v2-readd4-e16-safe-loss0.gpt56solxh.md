---
type: EvidenceExperiment
title: O1 / E16 reversible connection-loss apparatus for stock Watchman and Watchwoman
description: Controlled live comparison of private-daemon termination and per-client Unix-relay loss, including JS transport events, pending callbacks, daemon roots and subscriptions, reconnect clocks and freshness, control continuity, and cleanup.
resource: /.design/watchman/v2-readd/v2-readd4-e16-safe-loss0.gpt56solxh.md
tags: [opencode, watchman, watchwoman, e16, connection-loss, reconnect, unix-relay, isolation]
status: draft
generated: { by: model:openai/gpt-5.6-sol-xhigh, at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-10-05
sources:
  - id: apparatus
    resource: file:///home/rektide/tmp-opencode/v4-o1-safe-loss/README.md
    title: E16 isolated apparatus, transcripts, derived matrix, provenance, and cleanup proof
  - id: stock-source
    resource: file:///home/rektide/a/facebook/watchman
    title: Stock Watchman source checkout
    revision: 923b0935155590be54c0fc052fdca0201f8ebc4b
  - id: stock-binary
    resource: file:///usr/local/bin/watchman-facebook
    title: Installed stock fallback used live
    revision: sha256 044c9625e80a943b3741507afdc6486aeb4cc47a86badaf3cdaa86cc7ebbb6e4; wire buildinfo 54602bcad27e0887fd26f77c6747a38f0d701fc7
  - id: watchwoman
    resource: file:///home/rektide/a/radiosilence/watchwoman
    title: Watchwoman deployed source and installed binary target
    revision: a1e16cbf35b6bb1e4b429af53d65e738f955c32b; binary sha256 78aaceb0012f245a452027117cfc97c1ec0038d2d3d0c5a09bde6f425a9e9d53
  - id: transport
    resource: file:///home/rektide/src/watchman-esm/watchman/node/index.js
    title: '@superbfowle/fb-watchman-esm 3.0.0 transport used live'
    revision: sha256 4221933dd0caafdf41e7a69215b0639d58888ef55b1654efd3a9bd6bc645751a
  - id: validation
    resource: /.design/watchman/v2-readd/v2-readd4-validation2.gpt56solxh.md
    title: Validation assigning O1 / E16
  - id: stock-live
    resource: /.design/watchman/v2-readd/v2-readd4-e03-stock-live0.glm53max.md
    title: Accepted installed-stock live baseline
  - id: transport-conformance
    resource: /.design/watchman/v2-readd/v2-readd4-e07-transport-conformance0.glm53max.md
    title: Accepted JS transport conformance baseline
  - id: transport-lifecycle
    resource: /.design/watchman/v2-readd/v2-readd4-e12-transport-lifecycle0.glm53max.md
    title: Accepted raw transport lifecycle evidence
  - id: daemon-release
    resource: /.design/watchman/v2-readd/v2-readd4-e12-daemon-session-release0.glm53max.md
    title: Accepted Watchwoman daemon-side release evidence
---

# O1 / E16 — reversible connection loss without destructive daemon commands

Research only: this report identifies test apparatus and observed boundaries. It
does not select a production recovery architecture or edit production/design
code.

## One-sentence result

**For a wholly private daemon, terminating its retained process handle and
restarting the identical private invocation reliably forces `end` and a new
daemon incarnation but necessarily destroys every root and unrelated
subscription; for a daemon that must remain shared, FIN-closing only the test
client's pre-installed private Unix relay is the demonstrated non-destructive
apparatus—both daemons kept a direct control client, an unrelated root, and a
same-root control subscription live, all pending JS callbacks canceled before
`end`, and the same `Client` reconnected through a replacement relay—subject to
Watchwoman's observed requirement for two matching ticks on the test-owned root
to retire the disconnected subscription, and to its cross-incarnation mismatch:
it returns a complete fresh snapshot while labeling it
`is_fresh_instance:false`.**

## Pins actually exercised

| Surface | Pin used live | Provenance boundary |
| --- | --- | --- |
| Stock source | `923b0935155590be54c0fc052fdca0201f8ebc4b` (`v2026.08.31.00-2-g923b09351`) | Inspected source; not the installed binary's build revision. |
| Installed stock fallback | `/usr/local/bin/watchman-facebook` → `/usr/local/src/watchman-git/watchman/bin/watchman`; SHA-256 `044c9625…bb6e4`; wire version `20260708.093114.0`, `buildinfo=54602bcad27e0887fd26f77c6747a38f0d701fc7` | Every stock live cell used this older July build. Both daemon generations in the restart cell returned the same buildinfo. |
| Watchwoman | source HEAD and deployed pin `a1e16cbf35b6bb1e4b429af53d65e738f955c32b`; installed `/usr/local/bin/watchwoman` SHA-256 `78aaceb0…9d53`; CLI `watchwoman 0.7.0`; wire `buildinfo=watchwoman 0.7.0` | Every Watchwoman cell used the installed deployed binary, not a scratch rebuild or current systemd tip. |
| JS transport | `/home/rektide/src/watchman-esm/watchman/node/index.js`, package `3.0.0`, SHA-256 `4221933d…751a` | This hash is the npm 3.0.0 `index.js` hash established in E07. Imported directly and run under Bun. |
| Runtime / host | Bun `1.4.1`; Node `v26.6.0` recorded but not used for the client; Linux `7.1.0-debplus.1`, x86-64 | Carrier Bun 1.4.2 remains outside this experiment, as in E07/E12. AF_UNIX only. |

Full values and the before/after ambient-socket stat are in
[`pins.json`](file:///home/rektide/tmp-opencode/v4-o1-safe-loss/pins.json).

## Candidate matrix

“Shared-safe” below means safe with respect to other clients of the daemon. The
experiment itself never contacted the active shared service: it simulated that
topology with a private daemon, a direct control client, and a relayed test
client.

| Loss procedure | Daemon | JS event and pending callbacks | Daemon/root/subscription result | Reconnect result | Safe scope established |
| --- | --- | --- | --- | --- | --- |
| SIGTERM retained private-daemon PID; restart same socket/options | Installed stock `54602bca` | `end` 33 ms after signal request; all 3 held/current/queued callbacks first received `The watchman connection was closed`; no `error` | Control received EOF; daemon exited 63 ms after signal; restart `watch-list=[]`; old control root/subscription did not return | Same `Client` connected to successor; old clock produced full `seed.txt` + downtime file with `is_fresh_instance:true`; later `recovery.txt` delta arrived | **Private daemon only.** It proves incarnation loss by destroying all clients and state, so it is not safe against a shared daemon. |
| SIGTERM retained private-daemon PID; restart same socket/options | Watchwoman `a1e16cbf` | `end` 2,002 ms after signal; callbacks canceled first with the same string; no `error` | Control received EOF; the 2 s drain expired; restart `watch-list=[]`; old control root/subscription absent | Same `Client` connected; full `seed.txt` + downtime file returned, but `is_fresh_instance:false`; later `recovery.txt` delta arrived | **Private daemon only.** Same destructive scope; additionally carries the bounded shutdown-drain delay. |
| FIN-close both sides of only the test client's private relay; daemon remains live | Installed stock `54602bca` | `end` in the same millisecond as cut; 3/3 callbacks canceled before it; no `error` | Same daemon PID; both roots remained; disconnected `t-client` was absent by first post-cut probe while same-root `c-same` remained | Replacement relay + same `Client`; old `:3` clock advanced to same-incarnation `:6`, `is_fresh_instance:false`, replayed `loss-1.txt`/`loss-2.txt`; recovery delta arrived | **Demonstrated shared-safe topology.** No daemon signal or root/subscription deletion; direct controls continued. |
| FIN-close both sides of only the test client's private relay; daemon remains live | Watchwoman `a1e16cbf` | `end` 1 ms after cut; 3/3 callbacks canceled before it; no `error` | Same daemon PID and roots. `t-client` remained after cut and tick 1 (`total_subscriptions=3`), then disappeared after tick 2 (`total_subscriptions=2`); `c-same` and `c-ctrl` remained | Replacement relay + same `Client`; old `:2` clock advanced to same-incarnation `:5`, `is_fresh_instance:false`, replayed both loss files; recovery delta arrived | **Demonstrated shared-safe topology with a cleanup condition:** two matching ticks must be confined to the test-owned root before reusing the name or declaring teardown complete. |
| Exploratory `SO_LINGER(0)` relay close | Both | No `error`; each client eventually received only `end`, with callbacks canceled first | Same semantic root/subscription outcomes as FIN | Recovery succeeded as above | **Not a usable error-injection recipe.** Blocked relay threads retained the fds through two one-second joins; `end` appeared only after helper exit (2,014 ms stock / 2,011 ms Watchwoman). This run does not establish AF_UNIX RST behavior. |

The FIN relay is therefore the only measured procedure in this assignment that
both isolates loss to one client and immediately exposes the transport's
settling `end` path. An established-socket `error` was not produced. This is a
useful negative distinction because this transport's source settles callbacks
on `end` but merely emits on socket `error`.

## Apparatus

### Isolation and daemon invocations

All paths were under
`/home/rektide/tmp-opencode/v4-o1-safe-loss/runs/<cell>/`. Each cell had private
`roots/{control,test}`, `run`, `state`, `logs`, `home`, `conf`, and `xdg`
trees. The stock command was:

```text
/usr/local/bin/watchman-facebook --foreground --no-save-state
  --unix-listener-path=<cell>/run/daemon.sock
  --statefile=<cell>/state/watchman.state
  --logfile=<cell>/logs/daemon.log
  --pidfile=<cell>/run/daemon.pid --log-level=2
```

Watchwoman used:

```text
/usr/local/bin/watchwoman --sockname <cell>/run/daemon.sock
  --foreground-daemon --logfile <cell>/logs/daemon.log
  --pidfile <cell>/run/daemon.pid --log-level 2
```

The daemon environment contained private `HOME`, `TMPDIR`, and `XDG_*` values;
`WATCHMAN_SOCK` was absent. Stock additionally received a private empty
`WATCHMAN_CONFIG_FILE`. The only wire commands were `version`, plain `watch`,
`subscribe`, `get-pid`, `watch-list`, `status` (Watchwoman),
`debug-get-subscriptions`, and `clock`. No `watch-project`, `watch-del`,
`watch-del-all`, `unsubscribe`, service command, or root deletion occurred.

### Three independent connections

1. A raw JSON-line control client connected directly to the daemon. It owned
   `c-ctrl` on the unrelated `control` root and `c-same` on the `test` root.
2. The actual 3.0.0 JS `Client` connected only to `relay.sock`; the relay
   connected onward to the private daemon and captured both BSER byte streams.
   It owned `t-client` on the test root.
3. Short raw read-only probe connections recorded root lists, subscription
   registries, status, and clocks without traversing the relay.

Before loss, each daemon had two roots and three subscriptions in total:
`c-ctrl`, `c-same`, and `t-client`. The relay's dynamic hold captured but did
not forward the first `get-pid` response. The transport consequently had one
current and two queued commands at the exact loss boundary; this removed a
timing race from callback measurement. In daemon-loss cells, relay EOF
propagation was observation apparatus, while SIGTERM of the retained daemon
handle was the cause of loss.

The three inherited scratch helpers were present without any run output. Their
exact bytes, modes, mtimes, and SHA-256 hashes are preserved read-only in
[`inherited/`](file:///home/rektide/tmp-opencode/v4-o1-safe-loss/inherited/).
The original control helper did not account for stock's separate initial
unilateral PDU, and the original relay did not propagate one-sided EOF;
corrected successors were added under new names rather than replacing the
original evidence.

## Observed timelines

Times are epoch milliseconds in the JSONL; deltas below are from the requested
loss operation. Reconnect was intentionally held until state probes and, in
relay cells, two test-root ticks completed, so reconnect delay is apparatus
scheduling rather than a transport backoff measurement.

| Cell | Loss request | Client terminal event | Daemon exit / continuity | Successor connect | Recovery PDU |
| --- | ---: | ---: | --- | ---: | ---: |
| stock daemon | `1788612282585` | `end` +33 ms | exit +63 ms, rc `-15` | +510 ms | +1,111 ms |
| Watchwoman daemon | `1788612285765` | `end` +2,002 ms | exit +2,066 ms, rc `0` after drain timeout | +2,468 ms | +3,019 ms |
| stock relay FIN | `1788612292786` | `end` +0 ms | daemon PID `2434705` remained | +1,506 ms | +2,069 ms |
| Watchwoman relay FIN | `1788612297097` | `end` +1 ms | daemon PID `2435428` remained | +1,530 ms | +2,091 ms |
| stock linger attempt | `1788612303384` | `end` +2,014 ms | daemon PID `2436026` remained | +3,553 ms | +4,130 ms |
| Watchwoman linger attempt | `1788612309729` | `end` +2,011 ms | daemon PID `2438948` remained | +3,500 ms | +4,056 ms |

In all six cells, the three pending callback records precede the `end` record in
[`client.jsonl`](file:///home/rektide/tmp-opencode/v4-o1-safe-loss/runs/), and
the disruption snapshot is `current:false`, `queued:0`, `socket:false`. The
observed order matches the transport's `socket.on('end')` implementation:
null socket/Bunser, `cancelCommands`, then emit `end` (`index.js:167-172`). A
later `command` sees no socket and reconnects (`index.js:275-290`).

## Root, subscription, and control evidence

### Private-daemon termination

Both daemon cells began with full absolute `control` and `test` paths in
`watch-list`; `debug-get-subscriptions(test)` contained `c-same` and
`t-client`, and Watchwoman `status.total_subscriptions` was 3. Termination did
not preserve continuity:

- the direct control client logged EOF (`stock` at `1788612282625`,
  Watchwoman at `1788612287767`);
- probing the dead stock socket returned `ECONNREFUSED` because SIGTERM left the
  socket pathname; probing Watchwoman returned `ENOENT` because it unlinked its
  socket;
- stock successfully rebound its stale pathname, but the first successor
  `watch-list` was `[]` on both daemons and `clock(test)` returned unknown-root;
- after only the test client reattached, `watch-list` contained only the test
  root and the only subscription was `t-client`. Neither `c-ctrl`, `c-same`,
  nor the control root silently returned.

Thus this method is reversible only in the sense that a private fixture can
start a clean successor and rebuild declared test state. It is destructive to
every other client by construction.

### Per-client relay FIN

The stock FIN cell kept the same daemon PID and both roots at baseline,
post-cut, tick 1, tick 2, post-resubscribe, and post-recovery. Its test-root
subscription names were:

```text
baseline       c-same, t-client
post-cut       c-same
post-tick-1    c-same
post-tick-2    c-same
post-resub     c-same, t-client
post-recovery  c-same, t-client
```

Watchwoman also retained the same PID and roots. Its measured totals and
test-root names were:

```text
baseline       total=3  c-same, t-client
post-cut       total=3  c-same, t-client
post-tick-1    total=3  c-same, t-client
post-tick-2    total=2  c-same
post-resub     total=3  c-same, t-client
post-recovery  total=3  c-same, t-client
```

The first matching test-root tick made the disconnected push loop attempt a
write and Watchwoman logged `Broken pipe`; the registry still listed the old
subscription. On the second matching tick the push loop observed the closed
session and removed `t-client`. This is the same two-stage boundary established
more broadly by E12 daemon-session-release, now exercised through the proposed
per-client relay while controls remained live.

Control evidence is positive, not merely process liveness. In both FIN cells,
the same direct control PID received `before-loss.txt`, `during-loss.txt`, both
same-root `loss-*.txt` events, and a same-root `recovery.txt` event; it never
logged EOF and exited only after its stop file. Every timeline liveness check at
post-cut, tick 1, tick 2, and post-recovery was true. The exploratory linger
cells reproduced the same control and daemon-state result.

## Reconnect clocks and freshness

| Cell | Clock before loss | Reconnect clock | Reported freshness | Files returned at reconnect |
| --- | --- | --- | --- | --- |
| stock daemon restart | `c:1788612281:2433446:2:3` | `c:1788612282:2433568:1:2` | `true` | `seed.txt`, `during-down.txt` |
| Watchwoman daemon restart | `c:1788612284:2434116:2:2` | `c:1788612288:2434239:1:2` | **`false`** | `seed.txt`, `during-down.txt` |
| stock relay FIN | `c:1788612291:2434705:2:3` | `c:1788612291:2434705:2:6` | `false` | `loss-1.txt`, `loss-2.txt` |
| Watchwoman relay FIN | `c:1788612296:2435428:2:2` | `c:1788612296:2435428:2:5` | `false` | `loss-1.txt`, `loss-2.txt` |

Both relay reconnects are same-incarnation incremental recovery: the loss-window
files were returned and the next mutation produced a unilateral
`recovery.txt` PDU with `is_fresh_instance:false`.

The Watchwoman restart result is internally consistent with its deployed source
but not stock semantics. `ClockSpec::tick_against` maps a mismatched
start/PID/root to numeric tick 0 (`daemon/clock.rs:127-153`). `query::run` wraps
that numeric result in `Some(0)` and defines freshness as `since_tick.is_none()`
(`query/run.rs:102-106`), so it scans every row newer than 0 while setting
freshness false. Stock explicitly sets freshness true and tick 0 when
start/PID/root differs (`Clock.cpp:140-156`). The observed Watchwoman response
therefore proves complete snapshot recovery in this fixture, but its
`is_fresh_instance:false` bit cannot be used as truthful cross-incarnation
evidence at `a1e16cbf`.

## Reversible test procedures established

### Procedure A: private-daemon incarnation loss

1. Start the daemon in foreground mode with every socket/state/log/pid/config
   path and HOME/XDG value under one private cell; for stock, use
   `--no-save-state`.
2. Retain the exact process handle and verify `/proc/<pid>/exe` before signaling.
3. Connect only fixture clients and roots. Optionally hold a benign read-only
   response in a fixture relay to make pending callbacks deterministic.
4. SIGTERM that retained private handle; wait for process exit, client `end`,
   and callback settlement. Watchwoman's measured bound included its 2 s drain;
   stock died by signal.
5. Restart the identical invocation on the identical private socket, assert
   `watch-list=[]`, then reissue plain `watch`/`subscribe` with the old clock and
   verify the snapshot plus a later delta.
6. Stop the successor by its retained handle. After it is dead, remove stale
   stock socket files explicitly; verify every owned PID is absent.

This procedure must not be pointed at a daemon with unrelated clients.

### Procedure B: per-client loss while a daemon remains shared

1. Before the test client connects, place only that client behind a private
   single-client AF_UNIX relay. Other clients connect directly to the daemon.
   Use a test-owned root and unique subscription name.
2. To assert callback behavior, hold one daemon-to-client response in the relay
   after setup, then queue additional benign read-only commands.
3. Close both relay connections with `shutdown(SHUT_RDWR)` plus close. Do not
   signal the daemon and do not issue deletion commands. Assert callbacks were
   canceled before the transport's `end`.
4. Assert a direct control client still receives events and that unrelated
   root/subscription entries remain.
5. Stock removed the disconnected subscription immediately in this run. For
   deployed Watchwoman, create two matching changes **inside the test-owned
   root**, and wait until the old subscription disappears after the second
   tick. The same two-tick check applies after the final recovered client is
   closed if the daemon itself will remain shared; this run directly measured
   that release sequence at the first loss boundary, while its final fixture
   cleanup instead terminated the private daemon.
6. Bind a successor relay at the same private path and submit `watch` then
   `subscribe` with the saved clock on the same JS `Client`. Verify replay and a
   new post-reconnect mutation.
7. Close the final client and relay, perform the daemon-specific subscription
   disappearance check, and remove only relay socket files owned by the test.

This is apparatus guidance only. It does not imply that a relay, two-tick
cleanup, or any particular retry policy belongs in production.

## Cleanup proof

The matrix owned 32 processes: 8 daemon incarnations, 12 relay processes, 6 JS
clients, and 6 direct controls. Every per-cell
[`cleanup.json`](file:///home/rektide/tmp-opencode/v4-o1-safe-loss/runs/)
records a return code, `proc_exists:false` for every PID, no command-line
residue, and no remaining relay/daemon socket. All three stock final
terminations left a private daemon socket, as expected from E03; each was
unlinked only after its owning process was proven dead. Watchwoman removed its
own socket.

The cross-cell
[`final-cleanup.json`](file:///home/rektide/tmp-opencode/v4-o1-safe-loss/final-cleanup.json)
records no command line containing a run path and no socket anywhere in the
scratch tree. The active service socket was never opened: read-only snapshots
before and after have the same path, inode `211986690`, mtime
`1788311430467520146` ns, and size 0. Roots, scripts, BSER captures, daemon
logs, state probes, control logs, and cleanup records remain preserved.

## Limits and confidence

1. **High confidence** in FIN-cut event order, callback settlement, root and
   subscription state, direct-control continuity, reconnect clocks/files, and
   cleanup: each has timestamped client, relay, direct-control, probe, and
   process evidence, and FIN behavior was reproduced on both daemons.
2. **High confidence** that private-daemon death is unsuitable for shared use:
   both direct controls ended and both successor root lists were empty.
3. **High confidence** in the Watchwoman cross-incarnation freshness mismatch:
   the exact installed pin returned false with a changed start/PID/root and full
   rows, and the source algebra explains that exact combination.
4. The `SO_LINGER(0)` cells are **negative and apparatus-confounded** by the
   relay's blocked-thread joins. They establish only that this helper did not
   force `error`; they do not establish a general AF_UNIX reset result.
5. One Linux kernel/architecture and Bun 1.4.1 were exercised. No TCP, macOS,
   Windows, libc, load, or Bun 1.4.2 claim follows.
6. Latencies are one run per cell on an idle host. The FIN 0–1 ms observation
   is not a general upper bound, and scheduled reconnect delays are not backoff
   clocks.
7. The final recovered Watchwoman connection was released by private-daemon
   shutdown, not by a second post-test two-tick sequence. The report therefore
   states the shared-daemon final cleanup step as application of the identical
   first-loss sequence directly measured here and source-validated by E12, not
   as a separately repeated cell.

## Cross-references

- [`v2-readd4-validation2.gpt56solxh.md`](v2-readd4-validation2.gpt56solxh.md)
  — assigns E16 and requires a distinction between private-daemon and
  shared-daemon-safe loss apparatus; this report closes that factual matrix.
- [`v2-readd4-e03-stock-live0.glm53max.md`](v2-readd4-e03-stock-live0.glm53max.md)
  — pins the installed stock fallback, cross-incarnation stock freshness, stale
  socket behavior, and silent disconnect teardown reproduced here.
- [`v2-readd4-e07-transport-conformance0.glm53max.md`](v2-readd4-e07-transport-conformance0.glm53max.md)
  — establishes npm 3.0.0 file identity and the actual transport's
  error/end/reconnect surface; E16 adds controlled daemon and relay loss with
  unrelated-client continuity.
- [`v2-readd4-e12-transport-lifecycle0.glm53max.md`](v2-readd4-e12-transport-lifecycle0.glm53max.md)
  — source and Bun evidence for callback-before-`end`, non-settling socket
  `error`, and post-end reconnect; the FIN relay selects the settling path.
- [`v2-readd4-e12-daemon-session-release0.glm53max.md`](v2-readd4-e12-daemon-session-release0.glm53max.md)
  — daemon-side explanation for Watchwoman's retained post-FIN subscription and
  its two matching-tick release chain, now paired with a live direct control.
- [`scratch README`](file:///home/rektide/tmp-opencode/v4-o1-safe-loss/README.md),
  [`results-summary.json`](file:///home/rektide/tmp-opencode/v4-o1-safe-loss/results-summary.json),
  and [`runs/`](file:///home/rektide/tmp-opencode/v4-o1-safe-loss/runs/) —
  complete executable apparatus, compact result matrix, raw streams, timelines,
  root lists, control evidence, and cleanup proofs.
