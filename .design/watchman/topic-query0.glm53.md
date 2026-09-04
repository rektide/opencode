---
type: Reference
title: Since-query semantics vs the root-scoped Watchman client
description: Assessment of watchwoman-systemd's verified since-queries README against this branch's Watchman backend — resume discards the daemon-computed delta, plus tombstone-GC and directory-noise notes.
resource: /.design/watchman/topic-query0.glm53.md
tags: [watchman, watchwoman, since-query, cursors, tombstones, resume, reconnect]
status: draft # findings verified by code read; no implementation yet
generated: { by: model:glm-5.3, at: 2026-09-01T12:00:00Z }
verified: { by: none, at: never } # code-read only; see Verification sketch
stale_after: 2027-01-01
sources:
  - id: since-queries-readme
    resource: file:///home/rektide/src/watchwoman-systemd/.test-agent/since-queries/README.md
    title: Since-queries — getEventsSince as a daemon since-query (probe-verified)
    author: model:glm-5.3 (watchwoman-systemd session)
    last_modified: 2026-09-01
  - id: daemon-source
    resource: file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/commands/subscribe.rs
    title: watchwoman daemon — subscribe, query run, tombstone prune, clock
  - id: branch-source
    resource: /packages/core/src/filesystem/watcher/watchman/root.ts
    title: root-scoped Watchman backend — establish/loop/publishFiles
---

# Since-query semantics vs the root-scoped Watchman client

## What's up

The watchwoman-systemd workspace produced a probe-verified reference on how
its daemon answers "events since X":
[`since-queries/README.md`](file:///home/rektide/src/watchwoman-systemd/.test-agent/since-queries/README.md)
(2026-09-01, all four scenarios assert-passing via
[`probe.py`](file:///home/rektide/src/watchwoman-systemd/.test-agent/since-queries/probe.py)).
The user asked whether anything in it should tune this branch's root-scoped
Watchman backend. Explicitly "not super crucial" — an opportunistic
cross-check of client assumptions against freshly verified daemon semantics.

Research prompt, roughly: *the branch subscribes with a `since` clock and
resumes subscriptions from `item.clock` after disconnects; watchwoman's
since-scan is a state diff over a pruned-tombstone tree with named-cursor
retention — does the client's resume path actually receive everything the
daemon computed for it?*

Headline answer: **live streaming is fine; the resume path is not.** The
daemon computes the reconnect delta and ships it in the subscribe response —
and the client throws it away. That contradicts the accepted design's own
degradation story (Amendment 3). One small publish closes the gap; two
smaller nits follow.

## Background map

### What the external README establishes (probe-verified)

- A since-query is a **state diff, not an event log**: a tree scan keeping
  entries with `oclock > since_tick`; deletions are tombstone rows
  (`exists: false`); N writes in one batch coalesce to one row.
- Clock forms (`c:<start>:<pid>:<root>:<tick>`, bare tick, `n:<cursor>`,
  `scm:`): see the README's clock table. Foreign-generation clocks reset
  `tick_against` to 0 — the whole live tree comes back.
- **The sharp edge**: tombstones are pruned by GC (60 s sweep) down to
  `min(current_tick, oldest named cursor)`. With no named cursors the
  watermark is the current tick, so tombstones live at most ~60 s. Bare-clock
  pollers silently lose deletions after a sweep.
- Quirks: `always_include_directories` defaults **true** (compat); the bare
  `fields: ["name"]` shortcut hides deletions; cursor advance goes to
  `current_tick` *after* the query so mid-query events are never skipped.

### How this branch consumes the daemon

| Piece | Role |
| --- | --- |
| [`root.ts` — `establish`](/packages/core/src/filesystem/watcher/watchman/root.ts) | Resolves route, picks `since` clock (resume: `item.clock`; fresh: `clock` command), sends `subscribe` with `fields: ["name", "exists", "new", "type"]` |
| [`root.ts` — `loop`](/packages/core/src/filesystem/watcher/watchman/root.ts) | Decodes unilateral PDUs; handles `canceled` (resubscribe) and `is_fresh_instance` (one conservative update); publishes file rows |
| [`root.ts` — `publishFiles`](/packages/core/src/filesystem/watcher/watchman/root.ts) | Maps rows to create/update/delete after ignore filtering |
| [`schema.ts` — `SubscribeResponse`](/packages/core/src/filesystem/watcher/watchman/schema.ts) | Decodes **only** `subscribe`/`version`/`warning` — Effect Schema strips `files` |
| [`client.ts`](/packages/core/src/filesystem/watcher/watchman/client.ts) | Generations, serialized commands, 60 s deadline |

### How the daemon serves it

| Piece | Behavior |
| --- | --- |
| [`commands/subscribe.rs`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/commands/subscribe.rs) | `subscribe` runs the initial since-query **synchronously and returns its files in the command response**; a push task then evaluates ticks after a `start_tick` fence. PDU `is_fresh_instance` is always false on this path — only `query::run` sets it, and only when `since` is absent entirely |
| [`query/run.rs`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/query/run.rs) | `since_tick = cursor.or(spec.since.map(tick_against))`; `is_fresh_instance = since_tick.is_none()`; named cursors resolve and advance to `current_tick` after the scan; `always_include_directories` defaults true |
| [`daemon/root.rs` — `prune_tombstones`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/daemon/root.rs) | Watermark `min(current_tick, min named cursor)`; **subscriptions are not cursors** |
| [`daemon/clock.rs` — `tick_against`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/daemon/clock.rs) | Mismatched start/pid/root ⇒ tick 0 ⇒ whole live tree, still `is_fresh_instance: false` |

## Findings

### What already aligns

The README's top-line guidance is `subscribe` for live consumers, `n:<cursor>`
for pollers — and this branch is a live consumer that never polls. Checked
against the daemon source:

- ✅ Uses `subscribe`, not `query` polling.
- ✅ Requests `exists` (deletions visible; avoids the bare-name trap).
- ✅ Clocks are only ever daemon-issued (`clock` command or PDU clock) — never
  client-synthesized, so the "unknown clock form ⇒ everything" trap can't fire.
- ✅ `canceled` PDU handled by conservative update + resubscribe.
- ✅ `is_fresh_instance` PDUs handled by one conservative update.
- ✅ Foreign-generation clock after daemon restart degrades to a whole-tree
  diff rather than an error (README scenario D).

### F1 — Resume discards the daemon-computed delta (medium; design-conformance gap)

On reconnect, `establish` re-subscribes with `since: item.clock`. The daemon
runs the since-scan and returns **the entire disconnect gap in the subscribe
response's `files`** — that response is the *only* carrier of the gap, because
the push loop fences at `start_tick` captured at subscribe time. The client
decodes the response through `SubscribeResponse`, which has no `files` field,
and publishes nothing from it. The gap is computed, shipped, and dropped.

For a same-generation resume this silently skips every change that happened
while disconnected. For a daemon-restart resume (foreign clock ⇒
`tick_against` 0) the response is the **whole live tree**, and
`is_fresh_instance` is `false` on this path (see
[`run.rs:104-106`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/query/run.rs)),
so the PDU-side fresh-instance handler never fires either. Consumers get no
signal at all that anything changed during the outage.

This is a gap against our own accepted design.
[`draft2.gpt56t.md`](/.design/watchman/draft2.gpt56t.md) **Amendment 3**
says it explicitly:

> a full dump republishes every file, and the source owner's capacity-one
> sliding change queue coalesces that burst into exactly one refresh. […]
> Do not later "optimize" the burst — the coalescing is the intended behavior.

The intended degradation *is* the burst — and the implementation never
publishes it. The failure-table row "Fresh instance or rejected cursor →
publish one conservative update" ([draft2 §Failure
Semantics](/.design/watchman/draft2.gpt56t.md)) likewise has no
response-side counterpart.

**Fix (design-conformant):** add `files` (same row shape as
`SubscriptionChanges`) to `SubscribeResponse`, and run the response files
through the existing `publishFiles` + sub-metrics path in `establish`. On the
fresh-subscribe path the response is empty, so this only ever publishes real
deltas. The existing `!compatible` conservative-update publish stays for
route changes.

### F2 — Tombstone GC vs long same-generation disconnects (low; residual after F1)

The README's sharp edge, now on our resume path: tombstones prune to
`min(current_tick, oldest named cursor)` every 60 s, and **subscriptions pin
nothing** — a disconnect longer than ~60 s with deletions under the watched
root leaves pruned tombstones, so even the F1-published delta is missing
those `exists: false` rows. The clock is same-generation, so no whole-tree
dump rescues it.

Why the exposure is narrow: `item.clock` is client-memory only, so an
opencode restart always starts a fresh subscription (no gap); mid-session
reconnects normally complete in milliseconds-to-seconds (backoff caps at
2 s), well inside retention. The realistic window is suspend/resume or a
long daemon-side stall without a daemon restart.

Options, ranked:

1. **Accept it** once F1 lands — any surviving delta row still triggers a
   consumer refresh, and consumers are refresh-on-signal, not
   apply-each-event. Only an all-deletions-pruned gap yields silence.
2. **Belt-and-braces:** publish one conservative update-on-target on every
   resume (drop the `!compatible` condition on the existing publish in
   `establish`). One spurious refresh per reconnect is cheap and makes every
   resume lossless regardless of daemon retention. Tiny diff.
3. **Named cursors** (`since: "n:..."`) — not usable here: a cursor's first
   resolution returns tick 0 (whole tree, still not fresh-instance), and
   keeping a cursor pinned at the last consumed tick would require a `query`
   per PDU. The README's "use a cursor" answer is for pollers; we're a
   subscriber whose resume is a one-shot bare-clock since-query.

Upstream feedback (not our repo): the watchwoman README's own open question —
a `tombstone_retention_secs` floor — is exactly what would close this;
retention pinned by live subscriptions' `last_tick` would too. Neither is
needed by this branch if option 2 is taken.

### F3 — Directory-row noise (nit)

`always_include_directories` defaults true, so directory rows flow in PDUs
and — once F1 lands — would flood every resume's whole-tree dump with
`new: true` directory rows that `publishFiles` maps to `create` events. The
Parcel fallback does not emit directory creates. Passing
`always_include_directories: false` in the subscribe spec cuts the noise at
the source; directory deletes lose their own row, but child tombstones
(already emitted) still trigger consumer refreshes. Only an empty-directory
delete would publish nothing — negligible for refresh-on-signal consumers.
Worth bundling with F1 since F1 makes the dump path live.

### F4 — Watchwoman subscribe race (unverified observation for the other repo)

In
[`commands/subscribe.rs`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/commands/subscribe.rs),
the initial query (line ~32) completes and drops the tree read lock *before*
`tick_tx.subscribe()` (line ~43). A tick applying in that window broadcasts
to a receiver set that doesn't yet include this subscription, and
`start_tick` is read after it, so the push loop skips it too (`ev.tick <=
last_tick`). The window is scan-shaped: on a large fresh subscribe the
since-scan can run for hundreds of ms (watchwoman0's measurements: 0.71 s
full-state on a 338k-file root). Code-read only — a probe scenario (fresh
subscribe under concurrent writes, assert no lost file) would confirm.
Suggested daemon fix: subscribe the broadcast receiver (and capture the
fence) *before* running the initial query, matching what the code comment
already claims it does.

## Recommended tuning

1. **Publish the subscribe response's `files`** through `publishFiles` with
   `always_include_directories: false` in the spec (F1 + F3). Restores
   Amendment 3's intended degradation; makes resume lossless for restarts
   and short disconnects.
2. Optionally, conservative update on **every** resume (F2 option 2) if the
   suspend/resume window matters in practice.
3. Feed F2's retention question and F4 back to watchwoman-systemd (their
   `.test-agent/since-queries/` corpus is the right home).

## Verification sketch

- Extend the fake-daemon in `watchman-root.test.ts`: on the second
  `subscribe` (resume), return `files` with a create, a modify, and a delete
  row; assert all three publish. The existing "resumes each subscription
  from its cursor after a socket restart" test pins the `since` clock only —
  add publish assertions to it.
- Add a case where the resume response returns a full tree with
  `is_fresh_instance: false` (daemon-restart shape) and assert the burst
  publishes and coalesces downstream.
- Live (`OPENCODE_WATCHMAN_LIVE=1`): restart the daemon mid-subscription,
  touch + delete files during the outage, assert the reconnect burst covers
  them; then a `debug-gc-tick` + long-disconnect variant to observe the F2
  residual in the metrics' `files_in`/`updates_out` counters (see
  [`metrics0.glm53.md`](/.design/watchman/metrics0.glm53.md)).

## Cross-references

- [`since-queries/README.md`](file:///home/rektide/src/watchwoman-systemd/.test-agent/since-queries/README.md) — the probe-verified daemon semantics this doc assesses against; its code map and open retention question ground F2.
- [`draft2.gpt56t.md`](/.design/watchman/draft2.gpt56t.md) — accepted design; Amendment 3 (stale cursors return full results, the burst is the intended degradation) and the failure-semantics table that F1 falls short of.
- [`README.md`](/.design/watchman/README.md) — implementation maintenance log; "cursor recovery" in the runtime shape is exactly the path F1 corrects.
- [`watchwoman0.unknown.md`](/.design/watchman/watchwoman0.unknown.md) — daemon validation record; its full-state scan timings motivate F4's window-size estimate.
- [`metrics0.glm53.md`](/.design/watchman/metrics0.glm53.md) — channel metrics reading guide; `files_in`/`updates_out` and per-subscription cursor fields are the instruments for observing resume behavior live.
- [`parcel0.glm53.md`](/.design/watchman/parcel0.glm53.md) — Parcel fallback semantics; F3's "Parcel does not emit directory creates" claim comes from this line of work.
