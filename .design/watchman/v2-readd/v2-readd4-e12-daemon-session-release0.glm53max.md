---
type: EvidenceExperiment
title: E12 follow-up daemon-side session release at deployed a1e16cbf and local systemd tip 603f3b5
description: Controlled experiments isolating which event or lifetime boundary releases the Watchwoman session task, push loop, accepted socket, subscription registry entry, root subscriber, and queued messages after client FIN, abrupt client death, or unsubscribe; quiescent waits, staged ticks, GC/root retirement, SIGHUP retire, queue overrun, and daemon shutdown at both revisions.
resource: /.design/watchman/v2-readd/v2-readd4-e12-daemon-session-release0.glm53max.md
tags: [opencode, watchman, watchwoman, e12, session, release, lifecycle, gc, poison, evidence]
status: draft
generated: { by: model:zai/glm-5.3-max, at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-10-05
sources:
  - id: validation1
    resource: /.design/watchman/v2-readd/v2-readd4-validation1.gpt56solxh.md
    title: Assigning record for P6 / E12 follow-up
  - id: pressure
    resource: /.design/watchman/v2-readd/v2-readd4-e11-pressure0.gpt56solxh.md
    title: Prior 5 s retention bound and socket arithmetic
  - id: lifecycle
    resource: /.design/watchman/v2-readd/v2-readd4-e12-transport-lifecycle0.glm53max.md
    title: Client-side transport lifecycle complement
  - id: delta
    resource: /.design/watchman/v2-readd/v2-readd4-watchwoman-delta0.glm53max.md
    title: Deployed-to-tip source delta (surfaces 2, 6, 7)
  - id: apparatus
    resource: file:///home/rektide/tmp-opencode/v4-p6-daemon-session-release/README.md
    title: Isolated apparatus, cells, pins, and cleanup verification
  - id: watchwoman-repo
    resource: file:///home/rektide/a/radiosilence/watchwoman
    title: Read-only source checkout (git archive copies used for builds)
    revision: deployed a1e16cbf35b6bb1e4b429af53d65e738f955c32b; local systemd tip 603f3b57fe8dbbce8d3925fb4bf03959c507cb5f (both re-verified 2026-09-05)
---

# Daemon-side session release after FIN, abrupt death, and unsubscribe — deployed `a1e16cbf` vs local `systemd` tip `603f3b5`

## One-sentence answer

At both revisions, nothing at the moment of client FIN, abrupt client death, or
`unsubscribe` releases a subscribed session: the accepted socket, session
reader/writer tasks, push loop, and subscription registry entry are held
indefinitely on a quiescent root, and release happens only at the next
**write attempt on the dead peer** (a file-matching tick; socket freed at
tick 1, registry entry at tick 2, ≈6 ms each after the respective tick) or at
**root drop** (GC stale/dead reap or tip-only SIGHUP retire; everything freed
≤1 ms, tip additionally emits a `canceled` PDU), with `unsubscribe` removing
only the registry entry immediately while delivery to a connected client
continues — and the tip's bounded-queue commits change none of that, adding
only poison teardown of a *live-but-not-reading* client (~44 µs, no tick or
disconnect needed) plus the cancel signaling, while daemon shutdown remains a
separate category that frees everything only by process death (~2.0–2.1 s when
a parked session holds the drain, ~0.1 s when connections keep issuing PDUs).

## Pins and isolation

| Pin | Value |
| --- | --- |
| Deployed source | `a1e16cbf35b6bb1e4b429af53d65e738f955c32b` (clean detached checkout; `git archive` copy built) |
| Tip source | `603f3b57fe8dbbce8d3925fb4bf03959c507cb5f` (local `systemd`; re-verified tip before use) |
| Binaries | scratch builds, rustc `1.96.0-nightly (d9563937f 2026-03-03)`: `a1e16cbf` SHA-256 `c84cfcac9cfa0968faaba3abe4bf1978858525396680f438943aa72171e8599d`; `603f3b5` SHA-256 `2c4f8172bacb3ca176bd59907556ae66a788f2b71250d2683d56e7d8eb3af295` (deterministic rebuild byte-identical; every tip cell used this hash) |
| Instrumentation | scratch-only `tracing::info!` lines at reader-loop-done, writer-loop-done, connection-released, push-loop-spawned/exited in both archive trees; behavior-neutral (log lines only); pristine line numbers cited below from `git show`, not the edited trees |
| Isolation | every daemon `--foreground-daemon` with private `--sockname/--logfile/--pidfile`, `HOME`/`XDG_*` under the scratch run dir, `WATCHMAN_SOCK` unset; wire commands used: `version`, `watch`, `subscribe`, `unsubscribe`, `clock`, `status`, `watch-list`, `debug-gc-tick`, `shutdown-server`; never `watch-project`, `watch-del`, `watch-del-all`; the active service (PID 806505, started 2026-09-01 23:33:41, exe = archive checkout target binary) was confirmed identical and untouched before and after; post-run verification in [`final-cleanup.txt`](file:///home/rektide/tmp-opencode/v4-p6-daemon-session-release/final-cleanup.txt) shows no owned processes or scratch sockets |
| Raw evidence | [`runs/`](file:///home/rektide/tmp-opencode/v4-p6-daemon-session-release/runs/) — per-cell `events.jsonl`, `samples.json` (≈120 ms `/proc` FD/task/RSS + `status` probes), `daemon.log.final` (RFC3339 tracing), client PDU logs |

## Source control flow that decides release

Each accepted connection splits the socket; a reader task (the JoinSet task
itself) parses PDUs and a writer task drains an mpsc queue
(`server.rs:63,70,116,119` at `a1e16cbf`). The writer exits only on
channel-closed — i.e. when **every** `Session` clone is dropped — or on write
failure (`server.rs:159-170`). `Session::is_closed()` is `tx.is_closed()`
(`session.rs:49-51`), which becomes true only after the writer's receiver is
gone. The push loop holds a session clone and waits on the root's tick
broadcast; it checks `is_closed()` **only after a tick arrives**
(`subscribe.rs:99-107`), skips sending when the query yields no files
(`subscribe.rs:132-134`), and removes the registry entry only when the loop
itself exits (`subscribe.rs:155-158`). `unsubscribe` is registry-only and takes
no session or loop handle (`subscribe.rs:161-180`). Consequently, on a
quiescent disconnected subscriber every party is parked — reader awaiting
writer, writer awaiting queue traffic, push loop awaiting a tick — and nothing
observes the dead peer until either a PDU is written (EPIPE) or the root is
dropped (broadcast sender dropped → `RecvError::Closed`,
`subscribe.rs:104`). GC sweeps every 60 s; stale reaping requires zero
subscriptions and zero triggers plus idle ≥ `WATCHWOMAN_STALE_IDLE_SECS`
(default 3600 s; `gc.rs:38,55,123-129`); dead reaping requires the root
missing on disk for two sweeps (`gc.rs:43,106-116`); both call
`unregister_root` (`gc.rs:148-151`, `state.rs:173-175`), dropping the `Root`.
At the tip, sessions use a bounded queue (256 PDUs / 64 MiB default;
`WATCHWOMAN_SESSION_QUEUE_PDUS/_BYTES`, `session.rs:29-49`) with a poison
flag + doorbells (`session.rs:228-271`), the writer abandons mid-write on
poison and rings a `done` doorbell that breaks the reader's read wait
(`server.rs:126-140,166-207`), and the push loop selects on a per-root cancel
watch channel, emitting `{subscription, canceled:true, clock?}` on retire or
drop (`subscribe.rs:135-153`); `retire_root` = cancel → 250 ms grace →
unregister (`state.rs:275-283`), driven by SIGHUP policy reload
(`daemon.rs:109-131`) reading `WATCHWOMAN_CONFIG_FILE` (`policy.rs:56`).

## Experiment matrix and results

Identical cells ran against fresh private daemons at both revisions; each cell
is a fresh daemon + fresh scratch root (20 files), one control client, and one
measured raw-JSON client child. "Retained" means daemon-socket FD and/or
`status.total_subscriptions` unchanged across all samples in the window.

| Cell | Scenario (both revisions unless noted) | Observed release boundary | Latency |
| --- | --- | --- | --- |
| x1-plain-clean / x1-plain-kill | disconnect (FIN / self-SIGKILL) with `watch` but **no subscription** | reader→writer→connection released immediately; socket FD gone | reader-done→released 40–47 µs |
| x2-sub-clean-quiescent | subscribe, clean FIN, quiescent root | **none** through 48 s at both revisions: socket FD, subscription record, push loop all held; reader loop exited at EOF but its task stayed parked awaiting the writer | no release observed |
| x3-sub-kill-quiescent | subscribe then SIGKILL client | identical to x2 through 35 s | no release observed |
| x4-tick-release | x2 state, then file-matching tick 1, 14 s hold, tick 2 | tick 1: writer's write → EPIPE → writer exit + connection release + accepted socket FD freed; tick 2 (any tick): push loop `is_closed` → break → registry entry removed | writer exit 6–7 ms after tick-1 file create (5 ms watcher settle); push-loop exit + registry removal 6–7 ms after tick 2 |
| x4c-nonmatching-tick | directory-only tick against a `type f` spec, then matching file | directory tick produced **no release** (query empty → no PDU → writer never wakes) for 10 s; the following matching file released the socket in 6 ms | confirms the releasing event is the write attempt, not the tick |
| x5-unsub-stay | `unsubscribe` while client stays connected and reading | registry entry removed immediately (`status` subs 0); push loop alive; unilateral result PDUs delivered 1.015 s and 5.015 s after the unsubscribe ack (`a1e16cbf`; tip identical shape) | delivery continues until root drop or session closure |
| x6-unsub-clean-quiescent | `unsubscribe` then FIN, 18 s quiescent, two ticks | socket + push loop retained with `status` already showing 0 subscriptions; then identical two-stage tick release (socket at tick 1, loop at tick 2) | 6 ms per stage |
| x7-stale-reap | after unsubscribe, idle 7 s ≥ 3 s threshold, one `debug-gc-tick` | sweep reaps (warn "garbage-collected watch") → `Root` dropped → tick channel closes → push loop breaks → session dropped → writer exits → connection released; root + inotify FD gone same sample | entire chain ≤1 ms at both revisions |
| x8-dead-reap | subscriber retained (registry entry live), root directory renamed away, two `debug-gc-tick`s | first sweep marks missing ("health missing", no release); second sweep reaps → full release exactly as x7, including the still-live registry entry | ≤1 ms at both revisions |
| x9-sighup-retire (tip only) | connected subscriber; policy flipped to deny; SIGHUP | same millisecond: "retiring root denied by reloaded policy" → push loop exited → **`canceled` PDU delivered to the connected client** (`{"subscription":"p6sub","canceled":true,"clock":"c:…:3"}` — no `version`, no `unilateral`, no `root`); registry 0; root + inotify dropped after the 250 ms grace ("root policy reloaded" +252 ms); accepted socket retained while the client stayed connected and released within the same millisecond at the client's later FIN | push-loop exit + PDU ≈82 µs after the retiring log; root gone ≈335 ms incl. grace |
| x10-stall | subscribed client stops reading (paused socket), 1500 file ticks | **a1e16cbf**: no bound — RSS +3.16 MiB over 1500 PDUs (≈2.1 KiB/PDU, monotonic), socket and subscription retained, client alive; SIGKILL of the stalled client → EPIPE → writer exit → connection released (1.4–2.3 ms), queued messages freed, push loop still parked. **603f3b5** (queue 2 PDUs / 64 KiB): "poisoning slow session … write queue full" after ≈230–290 ticks (2.89 s) → writer abandons mid-write → `done` doorbell → reader exits → connection released, push loop exited via failed send, registry removed, queue freed — **while the client process was still alive**; RSS bounded (peak 11.9 MiB vs 8.8 baseline) | poison→fully-released 44 µs at tip |
| x11a/b/c — daemon shutdown (kept separate) | SIGTERM with a parked retained subscriber + polling control; SIGTERM with control only; `shutdown-server` PDU with parked retained subscriber | process exit releases everything; owned socket file removed at exit in every case; push loops log their exit at serve-return/runtime-teardown (≈0 ms when no parked connections; +2.0 s when a parked connection holds the drain) | exit 2103/2003 ms (a1e16cbf), 2003/2103 ms (tip) with a parked session (2 s drain timeout dominates); 106/101 ms idle-with-polling control (a connected silent client would wait the drain: the read loop observes shutdown only between PDUs) |

## Resource-release timeline (who frees what, when)

| Resource | no-sub FIN/kill | subscribed FIN/kill, quiescent | matching tick 1 | any later tick | `unsubscribe` (connected) | GC stale/dead reap | SIGHUP retire (tip) | slow reader (tip poison) | slow reader (a1e16cbf) | daemon shutdown |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Session reader task | released ≤50 µs | reader loop exits at EOF; task parked awaiting writer | task freed at connection release | — | unchanged | freed ≤1 ms at reap | unchanged while connected; freed at client FIN | freed at poison (done doorbell) | parked | process death (≤2.1 s observed) |
| Writer task | released ≤50 µs | parked on queue recv | exits on EPIPE 6–7 ms after tick | — | unchanged | exits ≤1 ms at reap (channel closes) | unchanged while connected | exits at poison, abandons mid-write | parked in `write_all` until client death → EPIPE ≈1.4 ms | process death |
| Accepted socket FD | released ≤50 µs | retained (read half by parked task, write half by writer) | released at writer exit | — | retained while connected | released ≤1 ms | retained while client connected; released ≤1 ms at client FIN | released at poison | retained until client death | process death; socket file unlinked at exit |
| Subscription registry entry | n/a | retained | retained | removed 6–7 ms after tick | removed immediately | removed with root | removed at push-loop exit (same ms as `canceled` PDU) | removed at poison | retained (until tick after client death, or root drop) | process death |
| Push loop task | n/a | parked on tick broadcast | parked (is_closed not yet true) | exits at is_closed check | alive, keeps delivering | exits ≤1 ms (RecvError::Closed) | exits ≈82 µs after retire + emits `canceled` PDU | exits on send failure same instant | parked | runtime teardown (observed at serve-return) |
| Root subscriber / root + inotify | n/a root persists | persists | persists | persists | persists; becomes stale-eligible (subs=0) | root dropped, inotify released at reap | root dropped after 250 ms grace | persists | persists | process death |
| Queued messages | none | none (no traffic) | freed at writer exit | — | none | freed at writer exit | `canceled` PDU delivered, not queued | freed at writer abandon | grow ≈2.1 KiB/PDU, unbounded until writer exit | process death |

## Revision delta (deployed `a1e16cbf` → tip `603f3b5`)

1. **Quiescent-disconnect retention: unchanged.** Both revisions held the
   accepted socket, subscription record, and push loop through the full 48 s
   (FIN) and 35 s (SIGKILL) windows with no tick; both release identically at
   the first file-matching tick (socket, 6–7 ms) and the following tick
   (registry, 6–7 ms). The bounded queue does not help because the writer is
   parked on an *empty* queue, and the `done` doorbell only breaks the reader,
   not the writer.
2. **Unsubscribe semantics: unchanged.** Registry-only removal, continued
   delivery to a connected client (observed PDUs at +1.015 s/+5.015 s),
   and identical post-disconnect tick release at both revisions.
3. **Root-drop release: same mechanism, same ≤1 ms latency; the tip adds
   signaling.** GC stale/dead reap frees everything within 1 ms at both
   revisions via tick-channel closure; the tip's cancel arm additionally
   emits `{subscription, canceled:true, clock?}` — observed delivered to a
   connected client at SIGHUP retire (82 µs) — and SIGHUP policy reload
   retires roots (250 ms grace) where `a1e16cbf` has no SIGHUP handler at
   all (default SIGHUP disposition would terminate that daemon; not
   exercised).
4. **Slow-reader overrun: this is the actual behavioral change.** A live
   client that stops reading is buffered without bound at `a1e16cbf`
   (measured ≈2.1 KiB/PDU linear growth, no release, matching the in-code
   2026-08-31 incident comment) but is torn down at the tip within 44 µs of
   crossing the queue budget: socket, session, push loop, registry entry, and
   queued messages all released while the client process lives. Abrupt death
   of the stalled client releases both revisions ≈1.4–2.3 ms via EPIPE.
5. **Daemon shutdown: unchanged in mechanism** (2 s connection drain, then
   process death frees everything), with identical measured exit latencies
   at both pins.

## Factual quirks recorded

- The tip's SIGHUP no-op log message prints `no WATCHMAN_CONFIG_FILE
  configured` while the actual environment variable is
  `WATCHWOMAN_CONFIG_FILE` (`policy.rs:56` vs `daemon.rs:116`); the message
  misdirected this investigation until a byte-level const dump resolved it.
  Fail-closed startup on a configured-but-missing file was verified (rc=1,
  "WATCHWOMAN_CONFIG_FILE is set, so it must load (fail-closed)").
- The unsubscribe acknowledgement shape
  `{"version", "unsubscribed":true, "subscription"}` was observed on the wire
  again (x5/x6, both revisions) — the shape that stalls the selected JS
  transport's key-presence classifier (E03 K7).
- `status.total_subscriptions` counts registry entries only: after
  `unsubscribe` it reads 0 while the push loop and session are still live —
  an operator-visible undercount of retained work.
- Idle time is reset by any command that resolves the root
  (`state.rs:107-113`); `status`, `watch-list`, `debug-gc-tick`, and the GC
  sweep itself do not touch it, which is what made the 3 s stale-reap cell
  deterministic.

## Limits and confidence

1. One host/kernel (Linux 7.1.0-debplus.1, x86-64), one toolchain
   (rustc 1.96.0-nightly; the deployed production binary was built with 1.97
   per E01 — the scratch `a1e16cbf` build is source-identical but not
   byte-identical to the deployed binary, whose hash E01/E11 recorded as
   `78aaceb0…`). Millisecond-scale latencies include the watcher's 5 ms
   settle batching; microsecond figures are same-host log timestamps.
2. Retention "indefinite" claims are bounded by observation windows: 48 s
   (x2), 35 s (x3), 18 s (x6 quiescent phase), 10 s (x4c), 15 s (x10
   a1e16cbf post-tick phase). No spontaneous release occurred in any window;
   the source shows no timer that would produce one, but longer horizons were
   not run. Default GC cadence (60 s sweep, 3600 s stale threshold) was
   compressed via `WATCHWOMAN_STALE_IDLE_SECS=3` + `debug-gc-tick` — the
   hidden command exists for exactly this and performs the production sweep
   body (`gc.rs:90-93`).
3. Subscription specs matched regular files (`["type","f"]`); the x4c
   non-matching case used a directory-only tick. Other empty-result shapes
   (e.g. expression misses) follow the same no-send branch by source but were
   not each exercised.
4. The stalled client in x10 paused reads at the Node/Bun socket layer; the
   client-side close event was not captured (client was then SIGKILLED for
   cleanup), so client-visible EOF at tip poison is established daemon-side
   (connection released, socket FD freed while the client process lived) plus
   the tip's own `session_queue.rs` black-box test; the a1e16cbf growth
   figure (2.1 KiB/PDU) is for this fixture's small PDUs, not a general rate.
5. FD classification is by `/proc/<pid>/fd` symlink text; task counts are
   Linux thread counts, not a Tokio task census. Push-loop/writer/reader
   lifetimes are established by the added info-level log lines (scratch
   builds only), whose code motion is three log statements.
6. Daemon-shutdown push-loop exit logging was observed at serve-return
   (≈0 ms or +2.0 s depending on parked connections); the exact tokio
   teardown mechanics were not investigated further — the release claim rests
   on process exit and the observed logs, not on runtime internals.
7. High confidence on every bolded boundary: each was reproduced at both
   revisions with full logs and FD/task/sample series, and each matches the
   cited source lines. Medium confidence on the generalization of x10's
   per-PDU growth rate and on client-visible EOF perception latency at tip
   poison.

## Cross-references

- [`v2-readd4-validation1.gpt56solxh.md`](v2-readd4-validation1.gpt56solxh.md)
  — assigned P6/E12 follow-up; its "exact release trigger remains open" gap
  is closed here.
- [`v2-readd4-e11-pressure0.gpt56solxh.md`](v2-readd4-e11-pressure0.gpt56solxh.md)
  — the 5 s quiescent retention bound and `4N` reconnect accumulation are
  extended to 48 s with the trigger identified (write attempt or root drop);
  its source citations for the parked writer/reader shape are confirmed
  behaviorally.
- [`v2-readd4-e12-transport-lifecycle0.glm53max.md`](v2-readd4-e12-transport-lifecycle0.glm53max.md)
  — client-side complement: its "daemon-side subscription teardown left
  unmeasured by design" gap is this report's subject.
- [`v2-readd4-watchwoman-delta0.glm53max.md`](v2-readd4-watchwoman-delta0.glm53max.md)
  — surfaces 2 (unsubscribe ownership), 6 (cancellation signaling), and 7
  (bounded queues) are now behaviorally measured, including the canceled-PDU
  shape `{subscription, canceled, clock}` on the SIGHUP path.
- [`v2-readd4-e03-protocol-ordering0.gpt56solxh.md`](v2-readd4-e03-protocol-ordering0.glm53max.md)
  — K6 post-unsubscribe delivery and K7 ack shape re-observed daemon-side at
  both pins.
- Scratch evidence:
  [`README.md`](file:///home/rektide/tmp-opencode/v4-p6-daemon-session-release/README.md),
  [`final-cleanup.txt`](file:///home/rektide/tmp-opencode/v4-p6-daemon-session-release/final-cleanup.txt),
  and [`runs/`](file:///home/rektide/tmp-opencode/v4-p6-daemon-session-release/runs/).
