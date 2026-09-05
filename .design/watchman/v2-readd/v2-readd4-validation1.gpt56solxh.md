---
type: EvidenceValidation
title: Watchman v2 re-add v4 daemon and transport evidence validation
description: Cross-validation of the second research wave, factual corrections, remaining evidence gaps, and the path-owner-lifecycle follow-up wave.
resource: /.design/watchman/v2-readd/v2-readd4-validation1.gpt56solxh.md
tags: [opencode, watchman, watchwoman, v2, validation, transport, protocol]
status: draft
generated: { by: model:openai/gpt-5.6-sol-xhigh, at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-10-05
sources:
  - id: transport
    resource: /.design/watchman/v2-readd/v2-readd4-e07-transport-conformance0.glm53max.md
    title: E07 and E15 transport conformance
  - id: watchwoman-delta
    resource: /.design/watchman/v2-readd/v2-readd4-watchwoman-delta0.glm53max.md
    title: Watchwoman deployed-to-tip delta
  - id: lifecycle
    resource: /.design/watchman/v2-readd/v2-readd4-e12-transport-lifecycle0.glm53max.md
    title: Raw transport lifecycle experiments
  - id: circuit
    resource: /.design/watchman/v2-readd/v2-readd4-e11-circuit-races0.glm53max.md
    title: Acquisition circuit race experiments
  - id: pressure
    resource: /.design/watchman/v2-readd/v2-readd4-e11-pressure0.gpt56solxh.md
    title: Watchwoman pressure measurements
  - id: stock-live
    resource: /.design/watchman/v2-readd/v2-readd4-e03-stock-live0.glm53max.md
    title: Stock Watchman live protocol
  - id: expression
    resource: /.design/watchman/v2-readd/v2-readd4-e06-expression0.glm53max.md
    title: Expression and capability semantics
  - id: rows
    resource: /.design/watchman/v2-readd/v2-readd4-e09-row-shapes0.glm53max.md
    title: File and directory row shapes
---

# Watchman v2 re-add v4 daemon and transport evidence validation

## Result

Wave two closes the broad daemon and transport fact-finding, but it disproves
two implementation assumptions strongly enough that design should remain
deferred: the selected transport does not reliably complete commands against
the intended daemon, and Watchwoman's `new` field does not distinguish ordinary
creates from updates. It also shows that disconnected quiescent Watchwoman
sessions accumulate sockets and subscriptions through reconnect cohorts.

The remaining research should now drill into path semantics, symlink topology,
owner convergence, and daemon-side release behavior. This document does not
select fixes or architecture.

## Cross-validated findings

### Transport and target compatibility

1. The npm artifact and local fork runtime are byte-identical and work under Bun
   1.4.1 and Node 26.6.0. The carrier's exact Bun 1.4.2 remains unexecuted.
2. The published npm artifact omits its declared `index.d.ts`; unmodified
   consumers receive an implicit-`any` module even though the repository has a
   declaration file.
3. The response classifier treats any top-level `subscription` or `log` key as
   unilateral. Watchwoman `unsubscribe` acknowledgements and both daemons'
   `get-log` responses collide with that rule and leave the current command—and
   every later FIFO command—blocked.
4. Watchwoman's newer local-only `systemd` tip does not fix merged subscribe
   acknowledgements, unsubscribe ownership/shape, same-name bookkeeping, or
   foreign-clock freshness. It adds bounded session queues and a
   non-stock-shaped cancellation PDU; those commits are not deployed or pushed.
5. The uncommitted actor reproduces FIFO and ordinary cancellation ordering but
   is not type-compatible with the proposed factory seam and omits discovery,
   spawn failure, reconnect, and post-end behavior.

### Raw client lifecycle

1. Local `Client.end()` synchronously settles queued callbacks and returns
   before socket closure; it is not terminal and later commands reconnect.
2. A delayed locator can complete after `end()` and create an idle live socket.
   A never-finishing locator child survives `end()` and can outlive the client
   process.
3. Locator failure leaves `connecting:true`, permanently wedging later commands
   even after `end()` and a corrected binary path.
4. Socket `error` leaves a dead socket object and unsettled callbacks; recovery
   requires a separate `end()` before another command can reconnect.
5. Effect interruption fences continuation resumption but does not stop the raw
   callback or transport resource.

### Protocol and row semantics

1. The installed stock fallback live-confirms acknowledgement-before-separate-
   initial-PDU ordering and stock fresh-instance behavior, despite being older
   than the inspected stock source.
2. Both stock and Watchwoman permit same-name delivery duplication. On stock, a
   single unsubscribe after clobber does not remove every live path; on deployed
   Watchwoman, registry removal does not stop either push loop.
3. The five proposed core expression terms are available on both daemons, but
   `name` is literal equality: `["name", ".watchman-cookie-*"]` matches
   nothing. Stock exposes foreign-process cookie names and needs a glob-capable
   term to select them; Watchwoman strips every cookie basename before
   expression evaluation.
4. When explicitly requested, both daemons return `name`, `exists`, `new`, and
   `type` on every observed row; deleted directories retain `type:"d"` and no
   requested delete row omitted type.
5. `new` is not portable creation evidence. Stock marks ordinary creates,
   recreates, and rename destinations new. Deployed Watchwoman marks ordinary
   file/directory creates, recreates, and rename destinations `new:false`; only
   some single-inotify-event creates remain true.
6. Watchwoman omits descendant tombstones for directory rename and recursive
   deletion where stock emits per-child rows.

### Circuit and pressure

1. Executable Effect rc.112 tests confirm that older ordinary success or
   non-connect failure can close a newer open/half-open donor circuit and wake
   waiters before the existing delay. This is donor behavior, not v4's blanket
   stale-result rule.
2. Interrupted active probes reopen at the same attempt. Depending on the
   uninterruptible work exit, a produced success can be discarded or a failure
   returned without the expected connect-failure observation.
3. The donor backoff is exactly `min(2000, 100 * 2^attempt)` milliseconds,
   without jitter; the experiments establish behavior but do not select it.
4. The source-matched Watchwoman handled all tested commands through 34 clients
   without rejection or saturation. One client adds one steady daemon socket;
   each distinct Linux root adds one inotify, eventfd, and eventpoll FD.
5. Synchronized 34-client same-root acquisition constructed at least 3–10
   transient roots and exposed 2–10 simultaneous inotify registrations before
   settling to one registry root.
6. Quiescent ended clients did not release their accepted daemon sockets or
   subscriptions during five-second observations. Three reconnect cohorts
   accumulated to `4N` retained sockets/subscriptions. No post-subscribe
   filesystem tick was generated, so the exact release trigger remains open.

## Factual corrections to earlier records

| Earlier statement | Validated correction |
| --- | --- |
| E01 describes `/opt/watchwoman-git/etc/watchwoman.json` as active root-admission policy for deployed `a1e16cbf`. | E06 proves deployed `a1e16cbf` has no consumer of `WATCHMAN_CONFIG_FILE`; those root-policy keys are inert at that pin. N2 shows root policy was added only in the 26 newer local-only commits. |
| E12 states local `Client.end()` emits no `end` event. | It emits none synchronously, but a peer FIN can cause a later client `end`. Watchwoman push-loop session retention can prevent that FIN indefinitely while quiescent. |
| V4's cookie expression uses `name` as a basename glob. | `name` is literal on both daemons. The `*` is not special. |
| V4's create mapping relies on `new && exists`. | This recognizes stock creates but misses normal Watchwoman file and directory creates at the deployed target. |
| Validation0 names the pressure output with a GLM suffix. | Repeated provider limits moved the completed experiment to a general-routed `openai/gpt-5.6-sol-xhigh` agent; the honest output is `v2-readd4-e11-pressure0.gpt56solxh.md`. |

## Coverage after wave two

| Domain | Depth reached | Remaining research before design challenge |
| --- | --- | --- |
| Daemon identity/revisions | Strong | Human target-scope choice later; no more broad research. |
| Protocol ordering/cancellation | Strong | E02 root-return behavior and safe E16 loss procedure remain. |
| Transport runtime/lifecycle | Strong | Exact Bun 1.4.2 is a narrow residual; daemon-side session cleanup remains. |
| Circuit/concurrency | Strong on donor behavior | Desired stale-result/failure policy is design, not more source research. |
| Pressure/topology facts | Strong through 34 clients | Release-after-tick/GC behavior remains; acceptable budget is design. |
| Expression and rows | Strong | Portable create/update evidence and Parcel-ignore parity remain. |
| Path mapping and symlinks | Insufficient | E02, E08, and E10 remain open. |
| Owner convergence | Insufficient | E14 Skill behavior remains open; Config evidence exists but dirty carrier work is not accepted. |
| Operational surfaces | Partial | E16, E17, E18, and E19 remain for a later bounded wave. |

## Next research wave: path, owner, and release semantics

Every assignment is GX and produces one new evidence file in this directory.
Agents may use disposable harnesses but must not implement production code or
choose architecture.

| ID | Output | Research question |
| --- | --- | --- |
| P1 / E02 | `v2-readd4-e02-watch-roots0.glm53max.md` | For plain `watch C`, can either daemon return ancestor `D`, does either ever include `relative_path`, and how do pre-existing ancestor/descendant watches affect the result? |
| P2 / E08 | `v2-readd4-e08-ignore-parity0.glm53max.md` | What exact Parcel semantics apply to literal ignores across `L != C`, missing paths, ignored symlinks, and paths outside the root, and how do current callers construct those values? |
| P3 / E09 follow-up | `v2-readd4-e09-create-evidence0.glm53max.md` | Do any available fields or ordered observations on both daemons distinguish create/recreate/rename-destination from update when Watchwoman reports `new:false`, and which OpenCode consumers actually depend on create versus update? |
| P4 / E10 | `v2-readd4-e10-symlink-sentinel0.glm53max.md` | Which current recursive consumers can supply symlinked logical roots, and what does a Node parent-entry sentinel observe across delete, recreate, rapid retarget, and final release? |
| P5 / E14 | `v2-readd4-e14-skill-lifecycle0.glm53max.md` | Against exact Skill/FiberMap/reload behavior, does the attached-latch avoid initial loops, preserve a recovery invalidation, and settle after one authoritative refresh under adversarial ordering? |
| P6 / E12 follow-up | `v2-readd4-e12-daemon-session-release0.glm53max.md` | After client FIN/error or Watchwoman unsubscribe, exactly which event, root tick, cancellation, GC, or process action releases push loops, accepted sockets, and subscription records at deployed and newer local revisions? |

## Following operational wave

After P1–P6, a final research-only operational wave should close E16 safe loss
injection, E17 platform acceptance evidence, E18 option/HttpApi plumbing, and
E19 disposition of the dirty carrier artifacts. Only then is the corpus ready
for the requested design challenge.

## Final design challenge protocol

Once every research wave is validated, Astra xhigh and GX will independently
receive the v4 source, accepted research corpus, validation records, and direct
access to primary sources. They will run in parallel and each write a new,
model-suffixed first design draft without reading the other's draft.

Only after both first drafts finish will they be exchanged. Each agent will then
write a separate second draft that compares both first drafts, adopts stronger
ideas where warranted, explains remaining disagreements, and converges on its
own best evidence-grounded design. The two first drafts and two second drafts
will all be preserved; no draft may overwrite another.

## Cross-references

- [`v2-readd4-validation0.gpt56solxh.md`](v2-readd4-validation0.gpt56solxh.md) — first-wave synthesis and wave-two assignments.
- [`v2-readd4-e07-transport-conformance0.glm53max.md`](v2-readd4-e07-transport-conformance0.glm53max.md) and [`v2-readd4-e12-transport-lifecycle0.glm53max.md`](v2-readd4-e12-transport-lifecycle0.glm53max.md) — classifier, packaging, and raw resource behavior.
- [`v2-readd4-e11-circuit-races0.glm53max.md`](v2-readd4-e11-circuit-races0.glm53max.md) and [`v2-readd4-e11-pressure0.gpt56solxh.md`](v2-readd4-e11-pressure0.gpt56solxh.md) — executable circuit and target-pressure evidence.
- [`v2-readd4-e06-expression0.glm53max.md`](v2-readd4-e06-expression0.glm53max.md) and [`v2-readd4-e09-row-shapes0.glm53max.md`](v2-readd4-e09-row-shapes0.glm53max.md) — expression and event-row contradictions requiring P2/P3.
- [`v2-readd4-watchwoman-delta0.glm53max.md`](v2-readd4-watchwoman-delta0.glm53max.md) — deployed-to-tip facts, including non-deployed policy/cancellation/queue work.
