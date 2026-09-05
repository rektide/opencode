---
type: EvidenceExperiment
title: E11 and E20 Watchwoman client, root, and reconnect pressure
description: Controlled measurements of 1, 4, 13, and 34 raw JavaScript clients against shared and distinct roots on an isolated source-matched Watchwoman daemon, including reconnect retention and synchronized same-root registration races.
resource: /.design/watchman/v2-readd/v2-readd4-e11-pressure0.gpt56solxh.md
tags: [opencode, watchman, watchwoman, e11, e20, pressure, latency, resources, evidence]
status: draft
generated: { by: model:openai/gpt-5.6-sol-xhigh, at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-10-05
sources:
  - id: validation
    resource: /.design/watchman/v2-readd/v2-readd4-validation0.gpt56solxh.md
    title: Evidence validation and N5 assignment
  - id: e01
    resource: /.design/watchman/v2-readd/v2-readd4-e01-daemon0.glm53max.md
    title: Deployed Watchwoman identity
  - id: e11
    resource: /.design/watchman/v2-readd/v2-readd4-e11-acquisition0.gpt56solmax.md
    title: Acquisition, topology, and root-cardinality audit
  - id: apparatus
    resource: file:///home/rektide/tmp-opencode/v4-n5-watchwoman-pressure/README.md
    title: N5 isolated measurement apparatus and evidence map
  - id: aggregate
    resource: file:///home/rektide/tmp-opencode/v4-n5-watchwoman-pressure/out/analysis.json
    title: Deterministic aggregate of broad and synchronized raw samples
  - id: provenance
    resource: file:///home/rektide/tmp-opencode/v4-n5-watchwoman-pressure/out/provenance-verify.txt
    title: Host, source, binary, transport, apparatus, and cleanup verification
---

# E11 and E20 Watchwoman pressure measurement

## Result

Against isolated Watchwoman `a1e16cbf`, all 416 broad-matrix and 170
synchronized measured raw clients completed without command error through 34
simultaneous connections, while resource state separated into root-proportional
inotify pressure and connection-proportional socket pressure: shared roots
settled at one registry entry/inotify FD, distinct roots at `N`, disconnected
quiescent subscribers retained `N` daemon socket FDs and subscription records
for at least five seconds and accumulated to `4N` after three reconnect bursts,
and five synchronized 34-client shared-root trials all exposed transient duplicate
root construction (final root-number lower bounds 3–10, sampled 2–10 concurrent
inotify FDs) before settling to one canonical root.

This is a factual pressure record. It does not choose a connection budget,
topology, circuit policy, or architecture, and it does not amend v4 or any
production source.

## Pins and isolation

| Pin | Measured value |
| --- | --- |
| Date and host | 2026-09-05; `workhorse.hosts.voodoowarez.com`; x86-64 |
| Kernel | Linux `7.1.0-debplus.1`, PREEMPT_DYNAMIC |
| CPU / memory | AMD Ryzen 7 5800X, 16 online logical CPUs; 65,757,580 kB RAM |
| Runtime | Bun `1.4.1`; kernel `CLK_TCK=100` |
| Watchwoman source | clean `/home/rektide/a/radiosilence/watchwoman` at `a1e16cbf35b6bb1e4b429af53d65e738f955c32b`, described `v0.7.0-5-ga1e16cb` |
| Daemon binary used | `/home/rektide/a/radiosilence/watchwoman/target/release/watchwoman`; SHA-256 `78aaceb0012f245a452027117cfc97c1ec0038d2d3d0c5a09bde6f425a9e9d53`; `watchwoman 0.7.0` — the exact binary hash E01 matched to the deployed target |
| JavaScript transport | actual `/home/rektide/src/watchman-esm/watchman/node/index.js`; clean content commit `3a463955acf6843301ceae387f7a1a0f187e4a65` under an empty jj working commit; SHA-256 `4221933dd0caafdf41e7a69215b0639d58888ef55b1654efd3a9bd6bc645751a`; package `@superbfowle/fb-watchman-esm@3.0.0` |
| Raw evidence | [`README.md`](file:///home/rektide/tmp-opencode/v4-n5-watchwoman-pressure/README.md), [`analysis.json`](file:///home/rektide/tmp-opencode/v4-n5-watchwoman-pressure/out/analysis.json), and the 492-entry [`sha256-manifest.txt`](file:///home/rektide/tmp-opencode/v4-n5-watchwoman-pressure/out/sha256-manifest.txt) |

Every daemon was started explicitly with `--foreground-daemon`, a private
`--sockname`, pidfile, logfile, and state directory below
`/home/rektide/tmp-opencode/v4-n5-watchwoman-pressure/`. Every transport process
received that socket through `WATCHMAN_SOCK`, taking the direct
`net.createConnection(process.env.WATCHMAN_SOCK)` branch
([`index.js:114-181`](file:///home/rektide/src/watchman-esm/watchman/node/index.js#L114-L181)); no locator child ran. All watched roots were scratch-only.

The broad matrix reused one private socket pathname **sequentially**, but used a
fresh daemon for every cell; each driver waited for that PID to exit and for the
socket to disappear before the next cell. The synchronized supplement used a
different private run directory, socket, state, log, and root for each repeat.
No apparatus command calls `watch-project`, `watch-del`, or `watch-del-all`.
The only wire commands were `version`, `watch`, `subscribe`, repeated `watch`,
`clock`, `watch-list`, and `status`. No unsubscribe was sent.

The active service was not used or altered. The pre-run pin and post-run
read-only identity record both showed the same active system PID `806505`; all
transport socket paths in the apparatus and results point instead into the N5
scratch.

## Apparatus

### Broad 8-cell matrix

For each topology (`shared`, `distinct`) and `N ∈ {1,4,13,34}`:

1. Start a fresh private daemon with `WATCHWOMAN_STALE_IDLE_SECS=0`.
2. Connect one long-lived control client, then spawn `N` Bun child processes,
   each owning one raw transport `Client`.
3. Each measured client sends first `watch`, then `subscribe`, three same-client
   warm `watch` commands, five `clock` probes, holds for 8 seconds, calls
   `Client.end()`, writes its raw JSON row, and exits.
4. Wait for every client process, then sample the daemon at +0.5, +2, and +5
   seconds after client exit.
5. Run three bounded reconnect cohorts. Each cohort creates another `N` raw
   client processes with the same command sequence, holds for 350 ms, exits,
   and is followed by a bounded observation/gap window.
6. Terminate and wait for the private daemon; record process and socket cleanup.

The shared cell sends every client to one canonical `shared-root`. A distinct
cell sends client `i` to canonical `dNN`. Every root contains 210 regular files
in seven subdirectories; every initial subscription returned 217 rows (files
plus directories). Thus root shape was constant while canonical-root count was
the independent variable.

The runner recorded 1,381 repeated daemon `/proc` samples across the eight
cells: eight 150 ms baseline samples; 60–100 ms cold samples for 3–5 seconds;
250 ms hold samples; the three post-exit checkpoints; and 120 ms samples during
each burst. Control `watch-list`/`status` samples captured registry, file,
subscription, RSS/footprint, and CPU state. A total of 312 client-process FD
snapshots were retained. The broad matrix therefore contains 104 main-cohort
clients plus 312 reconnect clients.

### Synchronized same-root supplement

The broad shared clients begin with separate process startup and did not expose
the source-inferred concurrent first-registration window. The supplement repeats
this narrower experiment five times against five fresh private daemons:

1. Construct 34 measured raw `Client`s plus one control client in one Bun
   process and connect all of them first with `version`, while the registry is
   empty.
2. Submit all 34 first `watch` commands for the same fresh canonical root in one
   scheduler turn.
3. Sample daemon FDs, `/proc/$pid/task`, `Threads`, RSS, and CPU around every 1
   ms through the operation and 100 ms settlement window.
4. Query all root clocks, subscribe all 34 clients, end the 34 measured clients,
   and sample at +0.1, +0.5, +2, and +5 seconds while the control client remains.
5. End the control client, terminate and wait for the daemon, and verify PID and
   socket absence.

The script and all five raw records are preserved under
[`scripts/same-root-race.ts`](file:///home/rektide/tmp-opencode/v4-n5-watchwoman-pressure/scripts/same-root-race.ts)
and `out/sync-shared-01` through `out/sync-shared-05`.

## Broad result: descriptors, kernel tasks, roots, and cleanup

`B` below is the daemon baseline after the control connection: 12 total FDs, 5
socket-typed FDs, no inotify FD, and 18 Linux kernel tasks/threads. `hold` is the
stable main cohort. `+5 s` is after every main client process exited. `final` is
after all three reconnect cohorts exited. Values are
`total FD / socket FD / inotify FD / kernel tasks`.

| Cell | Hold | +5 s after main exit | Final after 3 bursts | Final roots / subscriptions |
| --- | ---: | ---: | ---: | ---: |
| shared-1 | `16 / 6 / 1 / 20` | `16 / 6 / 1 / 20` | `19 / 9 / 1 / 20` | `1 / 4` |
| shared-4 | `19 / 9 / 1 / 23` | `19 / 9 / 1 / 21` | `31 / 21 / 1 / 22` | `1 / 16` |
| shared-13 | `28 / 18 / 1 / 26` | `28 / 18 / 1 / 26` | `67 / 57 / 1 / 28` | `1 / 52` |
| shared-34 | `49 / 39 / 1 / 30` | `49 / 39 / 1 / 30` | `151 / 141 / 1 / 30` | `1 / 136` |
| distinct-1 | `16 / 6 / 1 / 20` | `16 / 6 / 1 / 20` | `19 / 9 / 1 / 20` | `1 / 4` |
| distinct-4 | `28 / 9 / 4 / 29` | `28 / 9 / 4 / 27` | `40 / 21 / 4 / 29` | `4 / 16` |
| distinct-13 | `64 / 18 / 13 / 52` | `64 / 18 / 13 / 52` | `103 / 57 / 13 / 52` | `13 / 52` |
| distinct-34 | `148 / 39 / 34 / 89` | `148 / 39 / 34 / 89` | `250 / 141 / 34 / 99` | `34 / 136` |

The observed steady FD arithmetic is exact for these fixtures:

- one additional connected raw client added one daemon socket FD;
- one stable canonical root added one inotify FD, one eventfd, and one
  eventpoll FD (the broad classifier labels the latter `other` because Linux
  renders it as `anon_inode:[eventpoll]`); therefore shared hold total was
  `B + N client sockets + 3 root FDs`, while distinct hold total was
  `B + N client sockets + 3N root FDs`;
- `watch-list` and `status` settled at one root for every shared cell and `N`
  roots for every distinct cell. The distinct-34 poll saw the one intermediate
  count, 24 roots, then 34 about 62 ms later; all other recorded polls were zero
  or final;
- `status.total_tracked_files` settled at 217 for shared and `217N` for
  distinct: 868, 2,821, and 7,378 at 4, 13, and 34 roots;
- every client process FD snapshot was exactly 8 total and 2 socket-typed. The
  transport source establishes that one is its private Watchwoman socket; the
  process also inherited a socket-typed harness stream.

### Quiescent disconnect and reconnect retention

After the main client processes had exited, neither daemon accepted-socket FDs
nor `status.total_subscriptions` decreased at +0.5, +2, or +5 seconds. Each of
the three later cohorts added another `N` accepted socket FDs and another `N`
subscription records. Consequently final socket count was baseline `5 + 4N`
and final subscription count was `4N` in every shared and distinct cell. All
416 clients nevertheless reported success, and no accept, command, or transport
error appeared.

This retention observation is bounded to a **quiescent root** and five seconds
after each measured cohort: the fixture generated no filesystem event after
subscribe. Source explains that boundary. Each accepted connection has a
reader/session task and writer task
([`server.rs:63-82`](file:///home/rektide/a/radiosilence/watchwoman/crates/watchwoman/src/daemon/server.rs#L63-L82),
[`server.rs:106-142`](file:///home/rektide/a/radiosilence/watchwoman/crates/watchwoman/src/daemon/server.rs#L106-L142));
each subscription clones the session into a push task, which waits first on
`rx.recv()` and checks `session.is_closed()` only after a tick arrives
([`subscribe.rs:43-66`](file:///home/rektide/a/radiosilence/watchwoman/crates/watchwoman/src/commands/subscribe.rs#L43-L66),
[`subscribe.rs:87-109`](file:///home/rektide/a/radiosilence/watchwoman/crates/watchwoman/src/commands/subscribe.rs#L87-L109)).
The root subscription record is removed only when that loop exits
([`subscribe.rs:150-158`](file:///home/rektide/a/radiosilence/watchwoman/crates/watchwoman/src/commands/subscribe.rs#L150-L158)).
The experiment did not generate a tick to test cleanup after activity, wait for
the 60-second GC sweep, or claim indefinite retention.

The OS task/thread count did not grow one-for-one with sockets because Tokio
connection and push tasks multiplex over runtime threads. Distinct roots each
also hold a blocking notify watcher. The table reports the directly sampled
Linux task/thread count, not a Tokio task census; the daemon exposes no task
inventory. Source establishes the logical per-connection reader/writer and
per-subscription push tasks, but their runtime cardinality was not introspected.

## Broad result: RSS and CPU

The `status` command's Linux `rss_bytes` and `footprint_bytes` were identical in
every recorded row. CPU below is `user_cpu_ms + system_cpu_ms`, expressed as the
increase from each cell's own baseline. Because fresh-daemon baseline RSS varied
from 8.89 to 36.84 MiB, both absolute values and within-run deltas are shown;
cross-cell subtraction is not implied.

| Cell | Baseline RSS | Hold RSS (delta) | Final RSS (delta) | CPU delta at hold / final |
| --- | ---: | ---: | ---: | ---: |
| shared-1 | 10.83 MiB | 12.00 MiB (+1.17) | 12.40 MiB (+1.57) | 5 / 8 ms |
| shared-4 | 14.83 MiB | 17.30 MiB (+2.47) | 17.87 MiB (+3.04) | 11 / 22 ms |
| shared-13 | 8.91 MiB | 13.99 MiB (+5.08) | 18.61 MiB (+9.70) | 21 / 56 ms |
| shared-34 | 8.89 MiB | 17.18 MiB (+8.29) | 22.62 MiB (+13.73) | 37 / 125 ms |
| distinct-1 | 36.84 MiB | 37.95 MiB (+1.11) | 38.29 MiB (+1.45) | 5 / 8 ms |
| distinct-4 | 34.92 MiB | 38.57 MiB (+3.66) | 39.81 MiB (+4.89) | 12 / 24 ms |
| distinct-13 | 10.84 MiB | 23.81 MiB (+12.98) | 28.81 MiB (+17.98) | 45 / 83 ms |
| distinct-34 | 10.93 MiB | 33.60 MiB (+22.66) | 43.23 MiB (+32.30) | 97 / 189 ms |

“Final” includes root indexes plus the four cohorts' retained connection and
subscription state. It is not a root-only memory measurement. The raw `/proc`
samples preserve RSS ranges and CPU jiffies separately; at `CLK_TCK=100` those
jiffies are coarser than the status command's millisecond usage fields.

## Broad result: cold and same-client warm latency

Each table cell is `p50 / p95 / max` milliseconds using nearest-rank quantiles.
Main sample count is `N`. `First watch total` begins at raw Client construction
and includes socket connect. `Watch after connect` is the deterministic
difference between first-watch and transport `connect` timestamps. The original
client stored subscribe completion cumulatively, so `Subscribe` is likewise
derived as `subscribe_ms - watch_ms`; no command occurs between those markers.
“Warm watch” pools the three later watch RTTs per client.

| Cell | Connect | First watch total | Watch after connect | Subscribe | Warm watch |
| --- | ---: | ---: | ---: | ---: | ---: |
| shared-1 | `3.640 / 3.640 / 3.640` | `6.496 / 6.496 / 6.496` | `2.856 / 2.856 / 2.856` | `2.131 / 2.131 / 2.131` | `0.114 / 0.161 / 0.161` |
| shared-4 | `4.759 / 5.429 / 5.429` | `8.044 / 8.971 / 8.971` | `2.615 / 4.489 / 4.489` | `3.657 / 4.380 / 4.380` | `0.719 / 0.893 / 0.893` |
| shared-13 | `4.499 / 6.500 / 6.500` | `9.168 / 12.849 / 12.849` | `3.891 / 7.545 / 7.545` | `5.751 / 12.420 / 12.420` | `0.296 / 3.226 / 4.048` |
| shared-34 | `5.128 / 25.487 / 25.789` | `10.688 / 38.014 / 46.738` | `4.327 / 20.179 / 31.258` | `10.220 / 24.343 / 30.331` | `0.496 / 7.615 / 18.503` |
| distinct-1 | `2.912 / 2.912 / 2.912` | `6.378 / 6.378 / 6.378` | `3.466 / 3.466 / 3.466` | `1.979 / 1.979 / 1.979` | `0.084 / 0.117 / 0.117` |
| distinct-4 | `2.937 / 3.321 / 3.321` | `5.556 / 6.104 / 6.104` | `2.641 / 2.827 / 2.827` | `2.410 / 2.647 / 2.647` | `0.161 / 0.284 / 0.284` |
| distinct-13 | `4.448 / 5.079 / 5.079` | `10.235 / 13.585 / 13.585` | `5.990 / 8.802 / 8.802` | `4.273 / 5.967 / 5.967` | `0.398 / 1.693 / 2.015` |
| distinct-34 | `4.957 / 13.666 / 14.930` | `13.952 / 44.306 / 50.540` | `7.751 / 39.177 / 39.616` | `6.015 / 18.501 / 20.137` | `0.641 / 4.624 / 7.138` |

Every main subscribe response had `is_fresh_instance: true` and 217 rows.
Clock RTT distributions, all individual client rows, minimums, means, and exact
sample counts remain in [`analysis.json`](file:///home/rektide/tmp-opencode/v4-n5-watchwoman-pressure/out/analysis.json).

## Broad result: bounded reconnect latency

Each reconnect row pools three cohorts (`3N` clients); roots were already in the
same daemon registry. Values remain `p50 / p95 / max` ms. A reconnect client's
first watch still includes its new socket connect; its three later watch calls
are “warm watch.”

| Cell | Connect | First watch total | Watch after connect | Subscribe | Warm watch |
| --- | ---: | ---: | ---: | ---: | ---: |
| shared-1 | `3.295 / 3.575 / 3.575` | `4.765 / 5.419 / 5.419` | `1.470 / 1.844 / 1.844` | `1.837 / 2.272 / 2.272` | `0.109 / 0.165 / 0.165` |
| shared-4 | `3.182 / 4.164 / 4.164` | `4.749 / 6.328 / 6.328` | `1.562 / 2.164 / 2.164` | `2.530 / 3.228 / 3.228` | `0.172 / 0.516 / 0.755` |
| shared-13 | `4.895 / 10.251 / 10.737` | `8.383 / 17.396 / 18.571` | `2.783 / 9.755 / 14.173` | `6.121 / 11.009 / 11.139` | `0.432 / 3.412 / 5.074` |
| shared-34 | `5.222 / 14.613 / 24.374` | `9.585 / 23.992 / 27.819` | `3.419 / 10.626 / 14.443` | `6.803 / 17.944 / 34.492` | `0.536 / 4.056 / 7.736` |
| distinct-1 | `2.979 / 4.512 / 4.512` | `4.420 / 6.341 / 6.341` | `1.441 / 1.829 / 1.829` | `2.125 / 2.529 / 2.529` | `0.127 / 0.210 / 0.210` |
| distinct-4 | `2.948 / 3.298 / 3.298` | `4.358 / 5.106 / 5.106` | `1.413 / 1.890 / 1.890` | `2.470 / 2.814 / 2.814` | `0.151 / 0.654 / 0.738` |
| distinct-13 | `4.791 / 14.867 / 18.534` | `7.819 / 22.139 / 25.239` | `2.516 / 7.968 / 8.522` | `4.573 / 11.013 / 12.573` | `0.359 / 2.838 / 4.316` |
| distinct-34 | `5.416 / 23.737 / 31.317` | `11.026 / 33.564 / 37.374` | `4.343 / 17.912 / 27.388` | `8.361 / 22.649 / 31.894` | `0.857 / 7.129 / 28.886` |

No tested cohort was rejected or timed out. These distributions establish only
the measured host/run behavior through 34 clients, not a saturation threshold.

## Synchronized same-root behavior

All 34 measured clients were connected before their first `watch`, so watch
latency below excludes connect. The root registry was one after every trial and
the steady inotify count was one. The clock's fourth colon-delimited field is
the root number in the actual encoder
([`clock.rs:42-50`](file:///home/rektide/a/radiosilence/watchwoman/crates/watchwoman/src/daemon/clock.rs#L42-L50));
because `register_root` increments that number before scanning and inserting
([`state.rs:121-168`](file:///home/rektide/a/radiosilence/watchwoman/crates/watchwoman/src/daemon/state.rs#L121-L168)),
a final number greater than one proves at least that many root constructions in
an otherwise empty fresh daemon.

| Repeat | Final root-number lower bound | Sampled peak inotify / settled | First-watch p50 / p95 / max | Subscribe p50 / p95 / max |
| --- | ---: | ---: | ---: | ---: |
| sync-01 | 9 | `9 / 1` | `2.318 / 3.947 / 4.503` ms | `10.440 / 14.780 / 15.066` ms |
| sync-02 | 10 | `10 / 1` | `2.029 / 3.617 / 3.643` ms | `11.713 / 16.672 / 16.930` ms |
| sync-03 | 3 | `3 / 1` | `1.804 / 2.413 / 2.515` ms | `11.285 / 16.068 / 16.335` ms |
| sync-04 | 3 | `3 / 1` | `1.930 / 2.936 / 3.741` ms | `10.590 / 15.109 / 15.399` ms |
| sync-05 | 3 | `2 / 1` | `1.856 / 2.491 / 2.754` ms | `11.954 / 16.640 / 16.929` ms |

Trial 05's final root number proves at least three constructions while the
sampler caught at most two registrations simultaneously; this is a sampling
miss, not contradictory state. Across the five runs, sampled first-watch peaks
were 54–94 total daemon FDs, 39 socket FDs (34 measured clients plus control
within the baseline runtime shape), 2–10 inotify FDs, 45–71 `/proc/$pid/task`
entries, and 46–71 `Threads` readings. After 100 ms, every run had one registry
root and one inotify FD.

This directly reproduces the E11 source inference: `DashMap::get`, metadata,
initial scan, and `insert` are not one atomic operation, and insertion precedes
the blocking watcher registration rendezvous
([`state.rs:121-170`](file:///home/rektide/a/radiosilence/watchwoman/crates/watchwoman/src/daemon/state.rs#L121-L170),
[`watcher.rs:29-77`](file:///home/rektide/a/radiosilence/watchwoman/crates/watchwoman/src/daemon/watcher.rs#L29-L77)).
It does not establish how often ordinary process-staggered clients hit that
window: the unsynchronized broad shared runs observed only root number one and
one inotify FD.

Each synchronized process had 43 total and 37 socket-typed client-process FDs:
35 were the 34 measured Watchwoman connections plus control, with two inherited
harness output sockets. After ending the 34 measured clients, every repeat still
showed 39 daemon socket FDs and 34 subscriptions at +0.1, +0.5, +2, and +5
seconds, independently reproducing the broad quiescent-retention result.

## Shutdown and residual cleanup

- All eight broad drivers returned runner rc 0; every private daemon handled
  SIGTERM and exited rc 0; every broad private socket was removed.
- All five synchronized drivers returned runner rc 0; every private daemon
  exited rc 0; each driver directly recorded `daemon_pid_alive_after_stop:
  false` and `socket_present_after_stop: false`.
- Final cross-scenario verification found every recorded PID absent, no Unix
  listener under the scratch prefix, and no process command line belonging to
  the apparatus. The retained pidfiles and logs are evidence files, not live
  state.
- The final verification is preserved at
  [`out/final-cleanup.txt`](file:///home/rektide/tmp-opencode/v4-n5-watchwoman-pressure/out/final-cleanup.txt).

## Limits

1. This is one Linux host, kernel, filesystem, CPU, Bun version, daemon binary,
   and transport revision. Host activity was not quiesced; fresh-daemon baseline
   RSS varied materially.
2. Each broad cell has one fresh-daemon cold run. It has `N` simultaneous raw
   client samples, 3 same-client warm watches per client, 5 clock probes per
   client, three reconnect cohorts, and repeated daemon samples, but not several
   independent cold daemon replicates. The synchronized shared-34 question has
   five independent fresh-daemon replicates.
3. Broad clients were spawned sequentially and began `watch` immediately; they
   are overlapping process cohorts, not a barrier-synchronized command wave.
   The supplement supplies the barrier-like same-root wave, but only for 34
   already-connected clients and one 217-entry root.
4. Broad first-watch and subscribe component durations are differences between
   cumulative monotonic timestamps, as explicitly labelled. Process spawn time
   occurs before the child's clock starts and is excluded.
5. `/proc/$pid/status` `Threads` is a Linux kernel task/thread count, not a
   count of Tokio futures. Synchronized `/proc/$pid/task` and `Threads` reads
   were sequential, so a rapidly changing sample can differ by one or two.
6. FD classification is by `/proc/$pid/fd` symlink text. It proves category and
   count, while exact transport ownership is correlated from the private socket
   configuration, one-socket-per-Client source, and one-per-client daemon socket
   deltas.
7. Stale reaping was disabled to hold registry state constant. The experiment
   neither invokes GC nor measures root retirement. Its disconnect-retention
   claim is bounded to quiescent subscriptions and the recorded five-second
   windows.
8. The broad driver used one sequentially reused private logfile path and did
   not copy every daemon log into each cell; its per-cell JSON, JSONL, client
   rows, driver cleanup, PIDs, and timestamps are preserved. Every synchronized
   repeat has its own retained daemon log.
9. The maximum tested cohort is 34. There is no rejection or saturation result
   beyond that point and no statement here about an acceptable resource budget.

## Cross-references

- [`v2-readd4-validation0.gpt56solxh.md`](v2-readd4-validation0.gpt56solxh.md)
  — assigns N5/E11+E20 and identifies the missing descriptor, task, latency,
  CPU, and daemon-pressure evidence this experiment supplies.
- [`v2-readd4-e01-daemon0.glm53max.md`](v2-readd4-e01-daemon0.glm53max.md)
  — pins `a1e16cbf` and the binary hash matched by the isolated executable.
- [`v2-readd4-e11-acquisition0.gpt56solmax.md`](v2-readd4-e11-acquisition0.gpt56solmax.md)
  — source audit and prior 13/34 root-cardinality observations; its same-root
  race inference is directly reproduced here.
- [`v2-readd4-e12-transport-lifecycle0.glm53max.md`](v2-readd4-e12-transport-lifecycle0.glm53max.md)
  — adjacent raw-client lifecycle measurements; N5 adds the daemon-side
  quiescent subscription/socket retention under concurrent disconnects.
- Scratch evidence index:
  [`v4-n5-watchwoman-pressure/README.md`](file:///home/rektide/tmp-opencode/v4-n5-watchwoman-pressure/README.md).
