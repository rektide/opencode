---
type: Design
title: Crossing contract for observation semantics
description: The C0 frozen wire and semantic contract between the OpenCode client and the Watchwoman daemon - F5 failure vocabulary, additive envelopes, epoch identity, watchwoman-observation-v1 semantics, B2 tags, orderings, state ownership, three undecided floor-shaping stations, queue policy, and shared fixtures.
resource: /.design/watchman/contract0.glm53max.md
tags: [opencode, watchman, watchwoman, filesystem, observation, contract, invalidation, epochs]
status: draft
generated: { by: model:zai/glm-5.3-max, at: 2026-09-04T05:30:00Z }
verified: { by: none, at: never }
stale_after: 2026-10-04
sources:
  - id: route-synthesis
    resource: /.design/watchman/nav0-syn0.gpt56sol.md
    title: Watchman assurance navigation synthesis
  - id: route-chart
    resource: /.design/watchman/nav0.glm53.md
    title: Assurance route - beacons, rocks, and impositions
  - id: assurance-map
    resource: /.design/watchman/assurances0.gpt56sol.md
    title: Filesystem observation assurance
  - id: position
    resource: /.design/watchman/position0.glm53max.md
    title: Light position record and citation-follows convention
  - id: client-harness
    resource: /.design/watchman/tools0.gpt56s.md
    title: Watchman carrier tooling inventory
  - id: carrier-audit
    resource: /.design/watchman/carrier1-review0.gpt56sol.md
    title: Source-grounded carrier1 correctness audit
  - id: upstream-delta
    resource: /.design/watchman/upstream-delta0.glm53h.md
    title: Upstream delta check for the carrier1 rebuild baseline
  - id: b3-deferred
    resource: /.design/watchman/typed-watcher0.glm53.md
    title: Deferred B3 typed-watcher end-state contract
  - id: authority
    resource: /.design/watchman/vision0.gpt56s.md
    title: Watchman consolidation vision and human direction decisions
  - id: watchwoman-source
    resource: file:///home/rektide/src/watchwoman-systemd
    title: Watchwoman systemd branch source (follows d2eef362)
  - id: opencode-source
    resource: /packages/core/src/filesystem/watcher/watchman/
    title: OpenCode Watchman client modules (follows opencode-watchman 84127b0e)
---

# Crossing contract for observation semantics

This is beacon **C0** from
[`nav0-syn0`](/.design/watchman/nav0-syn0.gpt56sol.md): the one small
spec both crews must agree on before either builds a state machine, so
that the OpenCode client track and the Watchwoman daemon track converge
on Profile R instead of colliding vocabulary. It freezes what crosses
the socket and the seam; it does not schedule work.

Citation convention follows
[`position0.glm53max.md`](/.design/watchman/position0.glm53max.md):
daemon citations follow `watchwoman-systemd d2eef362` (working copy is
identical), client citations follow `opencode-watchman 84127b0e`. Every
section carries a **current gap** note distinguishing the target
contract from what exists today, because the daemon's cancellation and
failure surfaces have drifted twice since the assurance map was written
and drift is expected, not exceptional.

## Scope

### What this contract governs

| Governed                                                        | Where it lives                                                                                                    |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Wire vocabulary for reported observation loss                   | error responses, `canceled` PDUs, capability negotiation                                                          |
| Epoch identity and fencing facts                                | root epochs (daemon-minted), delivery attachments and attempts (client-minted)                                    |
| The exact semantic contents of `watchwoman-observation-v1`       | daemon advertisement gate; client negotiation                                                                      |
| B2 invalidation tag shape and consumer switch rules             | `Config.changes` union and the Agent/Command/Plugin Source predicates                                             |
| Client-side attachment, readiness, failure, and release ordering | root supervisor, interests, Config lifecycle mediation                                                           |
| State ownership for terminal and circuit states                 | adapter lifetime vs root supervisors vs owners                                                                    |
| Cross-repo shared test fixtures                                  | consumed by both harnesses; fault actors remain per-seam                                                          |

### What this contract deliberately does not govern

- **VCS filtering policy.** Watchwoman's ignore/filter rules and the
  exact-root placement strategy are daemon-internal product choices
  ([`watches.glm53.md`](/.design/watchman/watches.glm53.md) defines the
  client-side requirement; this contract only requires that VCS
  observation ride the same loss/ordering semantics as every other
  interest).
- **Compfuzor deployment.** Socket-activation, restart policy, and
  provenance pinning are release operations
  ([`nav0-syn0`](/.design/watchman/nav0-syn0.gpt56sol.md) position
  gate), not wire semantics.
- **B3.** Watcher-level typed invalidation is deferred by recorded
  human decision. Any generic invalidation produced below `Config` is
  B3 renamed and requires its own acceptance
  ([`nav0.glm53.md:315`](/.design/watchman/nav0.glm53.md#L315)). This
  contract's B2 vocabulary exists so the later layer shift is a move,
  not a rework.
- G5 audit economics, probe design, queue bounds beyond the minimal
  policy, and default-backend promotion policy - each has its own
  station in
  [`nav0-syn0`](/.design/watchman/nav0-syn0.gpt56sol.md)'s decision
  table.

## F5 failure vocabulary

Every reported-loss signal that carries policy must decompose into
three independent facts: `code`, `scope`, `recovery`. Operation names
and prose are diagnostic only.

| `error_code`                  | Scope         | Wire `recovery` | Meaning                                                                                                    |
| ----------------------------- | ------------- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| `root_blocked`                | `root`        | `terminal`      | Administrative policy rejected the root before observation.                                                 |
| `root_too_large`              | `root`        | `terminal`      | The configured per-root scan cap was exceeded; do not repeat the expensive crawl automatically.             |
| `observer_start_failed`       | `root`        | `retry`         | Native construction or registration failed for a reason not proven permanent.                               |
| `observer_unsupported`        | `backend`     | `terminal`      | The selected adapter cannot provide observation on this platform.                                           |
| `observer_resource_exhausted` | `environment` | `operator`      | A shared inotify watch or instance pool is exhausted; churn cannot manufacture capacity.                    |
| `observation_lost`            | `root`        | `retry`         | A previously live root reported error, rescan, or task death.                                                |
| `protocol_incompatible`       | `backend`     | `terminal`      | A structurally proven capability or response incompatibility affects the selected adapter.                  |

Wire tokens are closed sets: `scope in {root, backend, environment}`,
`recovery in {retry, terminal, operator}`. Human-readable `error`
remains for compatible diagnostics and never selects policy
([`assurances0:498-510`](/.design/watchman/assurances0.gpt56sol.md#L498-L510)).

### Unknown-code policy (additive evolution)

Codes are additive forever. A client that receives an unknown or
missing code must apply exactly this fallback, never prose matching:

1. Treat the failure as **delivery-epoch-scoped and retryable** under
   the root supervisor's shared backoff. Unknown codes never select
   terminal policy and never open or close the environment circuit.
2. Decode the raw daemon response retained by the transport - the
   fb-watchman callback error carries the full response object - rather
   than reducing it to `error.message`
   ([`client.ts:110-119`](/packages/core/src/filesystem/watcher/watchman/client.ts#L110-L119)
   drops it today).
3. Log the unknown code verbatim for corpus feedback; the code enters
   this table only through a contract revision, never client-side
   inference.

The inverse also holds: the enhanced daemon must not emit an
unstructured failure for any case whose policy v1 promises to classify.

### Current gap (d2eef362)

There is no structured failure surface at all. `CommandError` is five
prose variants
([`commands.rs:22-34`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/commands.rs#L22-L34))
and `dispatch` flattens every error to `{error: <string>, version: ...}`
([`commands.rs:44-61`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/commands.rs#L44-L61)).
The `Blocked`/`TooLarge` prose collapse the assurance map cited at
`4eb1ecb7` no longer exists - that policy layer is simply absent now,
which is the same Prose Trap with fewer words. On the client,
`WatchmanError.stage` (`connect|command|decode|route|subscribe|reconnect`,
[`schema.ts:60-70`](/packages/core/src/filesystem/watcher/watchman/schema.ts#L60-L70))
is a client-local transport taxonomy, not a wire vocabulary, and may
not be reused as one.

## Additive envelope fields

All fields are additive to Watchman-compatible objects; standard
clients ignore them and keep working.

### 1. `error_code` on error responses

```json
{
  "error": "watchwoman: root blocked by policy: /repo/node_modules",
  "error_code": "root_blocked"
}
```

Minted by the daemon at the point a command fails for a classifiable
reason. The client reads it only from the retained raw response, never
from the message string.

### 2. `watchwoman_failure` facts on cancellation

```json
{
  "subscription": "opencode-3-7-2",
  "root": "/repo",
  "canceled": true,
  "watchwoman_epoch": "daemon-start:1770000000:4211:12",
  "watchwoman_failure": {
    "code": "observation_lost",
    "scope": "root",
    "recovery": "retry"
  }
}
```

Minted by the daemon when a root epoch ends with a known cause. A
`canceled` PDU without `watchwoman_failure` means cancellation without
diagnosed loss (deliberate retirement, shutdown) and the client treats
it as delivery-epoch loss with the unknown-code fallback.

### 3. Epoch identity

**Root epoch - minted by the daemon.** One registration of one root.
`root_number` is allocated monotonically per daemon process
([`state.rs:135`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/daemon/state.rs#L135))
and embedded in every clock as `c:<start>:<pid>:<root_number>:<tick>`
([`clock.rs:42-51`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/daemon/clock.rs#L42-L51);
the code is authoritative over the doc comment's differing field order).
Carried on the wire by `watchwoman_epoch` and by every clock string.

**Delivery attachment - minted by the client.** One attached
exact-event path on one generation; today the
`Established {generation, route, name}` tuple
([`root.ts:25-29`](/packages/core/src/filesystem/watcher/watchman/root.ts#L25-L29)).
Never conflated with the daemon's root epoch: socket loss ends a
delivery attachment without proving root loss.

**Attempt identity - minted by the client.** One establishment attempt,
so a late PDU from an abandoned attempt cannot enter a new epoch (F6).
Names are `opencode-<generation>-<subscription>` today
([`root.ts:216`](/packages/core/src/filesystem/watcher/watchman/root.ts#L216));
v1 requires the generation component to be non-repeating per attempt,
not merely per connection.

The daemon never interprets subscription names; it echoes them. Epoch
strings are opaque to the client except for equality and the clock's
documented prefix. A replacement registration must yield a different
root epoch than the one it replaces - identity reuse is the Late Ghost
entry point.

### Current gap (d2eef362 / 84127b0e)

The daemon mints root numbers and clocks but exposes neither
envelope field, and **emits no `canceled` PDU at all** (a grep for
`canceled` across `crates/watchwoman/src` returns nothing): the push
loop breaks silently when the root's tick channel closes and removes
the subscription
([`subscribe.rs:98-158`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/commands/subscribe.rs#L98-L158)),
so today the client's only loss signal is connection death. The client
already decodes a `canceled` union member
([`schema.ts:50-57`](/packages/core/src/filesystem/watcher/watchman/schema.ts#L50-L57))
that nothing sends. Watchwoman briefly emitted cancellation at
`166eeb6d`; it is gone again at `d2eef362` - exactly the Two-Crew Drift
this contract exists to stop.

## `watchwoman-observation-v1`

The named capability a daemon may advertise **only after passing all
twelve mandatory daemon gates**
([`assurances0:1224-1243`](/.design/watchman/assurances0.gpt56sol.md#L1224-L1243)).
Negotiation is the existing `version` command shape:

```json
["version", { "required": ["relative_root"], "optional": ["watchwoman-observation-v1"] }]
```

The daemon's required/optional negotiation machinery already exists
([`info.rs:143-185`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/commands/info.rs#L143-L185));
v1 becomes one more row in that map. Semver, buildinfo, and
compatibility dates are not behavior negotiation.

### What v1 promises

1. **Fenced watcher-first acquisition (F1).** A successful `watch` ack
   means native construction and recursive registration returned
   success and buffered callbacks were reconciled with the initial scan
   before the root became routable. The claim stops there: v1 does not
   promise complete recursive descriptor coverage - `notify` suppresses
   traversal errors - that is RS.
2. **Root observation epochs (F2).** One registration is one epoch;
   only `Live` epochs are routable; loss callbacks carry epoch
   identity; replacement registration means new identity.
3. **Complete handling of reported loss (F3).** The first of
   `notify::Error`, a pathless `Rescan` marker, callback-channel
   closure, watcher-task or holder-thread death, or internal
   mailbox-overflow ends exactly one root epoch; repeats coalesce;
   exact events from that epoch are fenced after the transition.
4. **Remove-before-cancel and the subscription fence (F4).** A lost
   root is unroutable before cancellation is visible; the tick
   receiver, starting fence, and cancellation receiver are installed
   before the initial query runs.
5. **Structural failure classification (F5).** Every reported-loss
   signal carries `error_code`/`watchwoman_failure` facts from the
   frozen table above.
6. **Fresh identity on re-watch.** Re-watching a path after a lost
   epoch returns a new root epoch; `register_root` no longer
   returns the existing (possibly damaged) registration.
7. **Cancellation on the wire.** Retirement of a subscribed root
   produces a `canceled` PDU with the additive epoch and failure
   fields; standard clients ignore them.
8. **Environment circuit (F8, daemon share).** Shared-resource
   exhaustion opens an environment-level circuit reported as
   `observer_resource_exhausted`; the daemon does not answer it with
   root churn or process suicide.
9. **Capability honesty (F9 precondition).** `clock-sync-timeout` and
   `cmd-flush-subscriptions` are removed from the advertisement before
   v1 appears - a capability list is interface, not marketing.

### What v1 explicitly does not promise

Hidden-loss detection, descriptor coverage (G8), Config audits (G5),
probes (G7), exactly-once delivery, complete event history, or
reconstruction of intermediate states during an outage. Absence of v1
means *unproven*, never *broken*; stock Watchman has its own real
cookie/recrawl semantics and must not be misclassified by absence.

### Current gap (d2eef362)

The advertisement actively lies today: `clock-sync-timeout` and
`cmd-flush-subscriptions` are in the capability list
([`info.rs:11`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/commands/info.rs#L11),
[`info.rs:30`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/commands/info.rs#L30))
with no barriers behind them, and `status.health=active` merely means
subscribers exist
([`info.rs:407-433`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/commands/info.rs#L407-L433)).
The client's capability check requires only `relative_root` and logs
warnings away
([`client.ts:85-94`](/packages/core/src/filesystem/watcher/watchman/client.ts#L85-L94)),
so nothing on either side negotiates behavior today. Leg 2's
false-claim removal precedes any v1 advertisement.

## B2 tag vocabulary

### Shape

`Config.changes` widens from `Stream<Watcher.Update>` to:

```ts
export type ConfigChange =
  | { readonly path: string; readonly type: "create" | "update" | "delete" } // exact event
  | { readonly type: "invalidation"; readonly path: string }                 // subtree unknown; rescan
```

This is deliberately the future B3 `Watcher.Update` member verbatim
([`typed-watcher0:73-91`](/.design/watchman/typed-watcher0.glm53.md#L73-L91)):
the later migration moves the tag down a layer without renaming it, and
the three consumers' switches survive unchanged
([`typed-watcher0:125-136`](/.design/watchman/typed-watcher0.glm53.md#L125-L136)).
`path` on the invalidation member is the highest watched subtree whose
continuity was lost - the subscription target - never a guess about
which descendant changed.

### Producer

Exactly one producer: **Config's lifecycle mediation** of watcher
control facts. `Watcher.Update` stays exact-only; the substrate, root
supervisor, and interests layer never emit invalidation values. Config
publishes the tag on stream failure (retaining last-good state), again
on epoch-ready before the recovery reload closes the gap, and after any
successful owner audit as selected - that last case is the G5 product
question, not this contract's
([`nav0-syn0` Leg 0](/.design/watchman/nav0-syn0.gpt56sol.md)). Today
`config.ts` republishes raw `Watcher.Update` into its PubSub
([`config.ts:329-346`](/packages/core/src/config.ts#L329-L346)) and its
type is the seam to widen
([`config.ts:43`](/packages/core/src/config.ts#L43)).

### Consumer switch rules

1. **Tag first.** Every consumer dispatches on
   `update.type === "invalidation"` before applying any exact-path
   predicate. Today the three indirect consumers apply path predicates
   directly to `update.path` and would silently reject the tag:
   Agent
   ([`agent.ts:63-69`](/packages/core/src/config/plugin/agent.ts#L63-L69)),
   Command
   ([`command.ts:44-50`](/packages/core/src/config/plugin/command.ts#L44-L50)),
   Plugin Source
   ([`source.ts:79-84`](/packages/core/src/config/plugin/source.ts#L79-L84)).
2. **Path filtering only after.** An invalidation bypasses ignore/glob
   filtering - it is a control fact about an extent, not a file event
   under filtering policy.
3. **Invalidation-before-failure ordering** (below) applies at the
   producer: a terminal transition that may hide changes enqueues the
   invalidation before the failure value escapes to consumers.
4. **No new producers.** Skill and future VCS owners consume
   detected-loss behavior at their own seam; they do not consume (or
   mint) Config's tag. An exact-sensitive non-Config directory owner
   needs its own mediation or a renewed B3 decision.

### B3 drift guard

If any proposed change introduces a shared invalidation value below
Config - on the substrate, a shared lifecycle stream, or
`Watcher.Update` itself - that is B3 under another name and requires an
explicit new human acceptance record. This contract's tag vocabulary
keeps that channel open without walking through it.

## Client-side orderings

Five orderings are frozen here because races at these seams are how
Late Ghosts and Redemand Whirlpools are born
([`nav0-syn0` rock chart](/.design/watchman/nav0-syn0.gpt56sol.md)).

- **O1 - attachment-before-ready.** The direct epoch-ready
  acknowledgement fires only after the replacement delivery epoch is
  attached (generation live, subscription established, attempt fenced).
  Config's recovery reload runs against source while the new stream is
  attached, closing the blind window. Upstream's public `onReady`
  already pins this outcome for Node
  ([`upstream-delta0:126-136`](/.design/watchman/upstream-delta0.glm53h.md#L126-L136));
  the Watchman path must reproduce the outcome stream-natively
  (invalidation as the epoch's first observable fact) rather than by
  callback.
- **O2 - invalidation-before-failure.** Any terminal or stream-failing
  transition that may hide changes enqueues the B2 invalidation before
  the failure value reaches consumers
  ([`carrier1-review0` CB5](/.design/watchman/carrier1-review0.gpt56sol.md)).
  A malformed PDU can itself be the only evidence that changes were
  missed; reporting only failure violates the tag's meaning.
- **O3 - loss terminates exact streams exactly once.** A `canceled`
  PDU, connection end, admitted-command timeout, or decode failure ends
  the delivery epoch once; exact events from the ended epoch are
  fenced; repeated loss signals coalesce.
- **O4 - release cannot resurrect replacement demand.** Local removal
  is authoritative and happens before daemon cleanup. No late
  acknowledgement, late PDU, retry completion, or unsubscribe response
  may recreate a registration or re-issue demand for a released
  interest. A completed, correlated unsubscribe rejection is
  diagnostic-only; an unsubscribe **timeout** retires the generation
  under the universal admitted-command rule
  ([`carrier1-review0` CB6](/.design/watchman/carrier1-review0.gpt56sol.md),
  [`timeout0.gpt56s.md`](/.design/watchman/timeout0.gpt56s.md)).
- **O5 - request once, park.** An owner requests replacement
  observation once and parks; the root supervisor alone schedules retry
  with one shared per-root backoff sequence
  ([`assurances0` F7](/.design/watchman/assurances0.gpt56sol.md)).

### Current gap (84127b0e)

All five are violated in composition today. Fabricated
`{path: target, type: "update"}` markers stand in for readiness,
cursor rejection, cancellation, and fresh-instance at
[`root.ts:215`](/packages/core/src/filesystem/watcher/watchman/root.ts#L215),
[`root.ts:246`](/packages/core/src/filesystem/watcher/watchman/root.ts#L246),
[`root.ts:377-379`](/packages/core/src/filesystem/watcher/watchman/root.ts#L377-L379),
and
[`root.ts:389-391`](/packages/core/src/filesystem/watcher/watchman/root.ts#L389-L391);
the old-cursor `compatible` reuse discards recovery rows by schema
([`schema.ts:23-26`](/packages/core/src/filesystem/watcher/watchman/schema.ts#L23-L26),
[`root.ts:204-215`](/packages/core/src/filesystem/watcher/watchman/root.ts#L204-L215));
and Config answers stream failure with the `yieldNow` resubscribe loop
([`config.ts:338-344`](/packages/core/src/config.ts#L338-L344)) - the
Redemand Whirlpool - while the registry retries acquisition forever
with Parcel as the escape hatch
([`backend.ts:23-31`](/packages/core/src/filesystem/watcher/watchman/backend.ts#L23-L31)).

## State ownership

| State                              | Owner                                     | Lifetime / clearing                                                                                             |
| ---------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Backend-terminal latch             | The selected Watchman **adapter layer**, above all root supervisors | Set by structurally proven incompatibility (`observer_unsupported`, `protocol_incompatible`); fails current and future roots once; clears only on adapter-layer reconstruction (Watcher layer rebuild) |
| Root-terminal suppression          | Root supervisor / watch-set, per intent   | Attributed record retained while desired intent is unchanged; clearing is DS-B below                                                            |
| Environment circuit                | Daemon (F8); client reflects it           | Opened by `observer_resource_exhausted`; client stops acquisition churn and surfaces degraded observation; cleared by capacity or operator action, never by retry storms |
| Delivery-epoch state               | Root supervisor, per logical subscription | Ended by any O3 signal; replaced under fresh identity (F6)                                                      |
| Observation-health state           | Observation substrate (daemon + supervisor) | Set by reported loss; cleared only by observation recovery - a fresh attachment, never by an audit             |
| Source-freshness / lease state     | Each owner (Config, Skill, VCS)           | Renewed only by successful authoritative reads; failed reads retain last-good and degraded health               |

**Observation health and source freshness are permanently separate
gauges.** A successful Config audit converges domain state while the
watcher stays dead; it must never clear an observation-health error
(Audit Mirage), and a failed audit must never publish an empty snapshot
as truth (Empty Snapshot). No future profile merges them; the
"separate forever" row in
[`nav0-syn0`'s no-incoherent-middle table](/.design/watchman/nav0-syn0.gpt56sol.md)
is the authority.

Today's client has only a proto-terminal `state.fatal` latch scoped to
one root-intent connection and set only by decode/route errors
([`root.ts:185-192`](/packages/core/src/filesystem/watcher/watchman/root.ts#L185-L192),
[`root.ts:308-316`](/packages/core/src/filesystem/watcher/watchman/root.ts#L308-L316));
there is no backend-wide latch, no suppression record, and no circuit;
recoverable stages retry forever
([`root.ts:290-297`](/packages/core/src/filesystem/watcher/watchman/root.ts#L290-L297)).

## Decision stations - explicitly UNDECIDED

Three floor-shaping items are presented for the human to decide before
the supervisor and strict-selection work hard-codes them. Each carries
options, a recommendation, and consequences. **None is decided by this
document.**

### DS-A. Unreadable initial entries

During the initial scan, the daemon's `walk` silently skips entries it
cannot read or stat
([`watcher.rs:185-198`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/daemon/watcher.rs#L185-L198)).
G2's wording must say which of these is true.

- **Option 1 - fail G2 acquisition by default.** Any unreadable entry
  aborts acquisition; the root is not acknowledged; the failure carries
  a dedicated root-scoped retryable code (e.g. a `root_scan_incomplete`
  row added to the F5 table) and the supervisor's backoff governs
  reattempts.
- **Option 2 - explicitly narrow the root-completeness claim.** v1
  wording becomes "complete modulo entries unreadable at acquisition";
  exclusions are either enumerated in an additive ack field or declared
  non-enumerable.

**Recommendation: Option 1.** It matches G2's existing shape
("acknowledgement means registration succeeded and callbacks were
reconciled"), keeps the no-incoherent-middle rule intact (a silently
narrowed completeness claim is an incoherent middle between G2 and RS),
and unreadability is usually transient (permissions mid-install),
which the supervisor already handles generically. Consequences:
Option 1 costs acquisition retries on imperfect-but-real roots and
needs the new code minted here so policy is retry-with-backoff, not
terminal; Option 2 costs nothing at acquisition but permanently widens
the fog G2 admits, pushes every owner toward audit-only freshness, and
invites RS pressure later.

### DS-B. Terminal suppression clearing

What clears backend-terminal and root/policy suppression state.

- **Option 1 - the four named clearers, scoped.** Root- and
  policy-scope suppressions (`root_blocked`, `root_too_large`) clear on
  intent change, policy generation change, or explicit operator retry;
  backend-terminal latch clears only on adapter-layer reconstruction.
- **Option 2 - time-based clearing.** Suppressions expire on a timer.
- **Option 3 - process-restart clearing.** Any suppression dies with
  the client process.

**Recommendation: Option 1.** Timers retry refusals the policy layer
meant to be permanent (Terminal Cache wearing a stability costume in
reverse), and process restart clearing makes terminal retention
meaningless for long-lived servers. Consequences: Option 1 requires
each clearer to be observable - policy generation identity on the
daemon side, intent-change signals and an operator retry surface on the
client side - and the vanished-root case still needs parent/topology
sentinels, since a watch on a deleted directory cannot observe its own
recreation
([`assurances0:1133-1139`](/.design/watchman/assurances0.gpt56sol.md#L1133-L1139)).

### DS-C. Composite construction failure

If the selected Watchman transport is unavailable at construction
(transport module missing, socket unwritable), does the whole Watcher
layer abort?

- **Option 1 - abort the Watcher layer.** Server startup fails loudly;
  no file or directory watching runs.
- **Option 2 - degraded composite.** Node exact-file service survives;
  directory observation is terminally unavailable with an attributed
  backend-terminal state under DS-B's clearing rules.

**Recommendation: Option 2.** Exact files already route to Node by
construction (`input.type === "file"` never touches the registry,
[`backend.ts:18`](/packages/core/src/filesystem/watcher/watchman/backend.ts#L18)),
and imposition 5 says exact-file interests do not share the daemon's
failure domain; aborting startup because a *directory* backend is down
couples them anyway and contradicts G1's spirit (initial owner state
completes while the daemon is absent or pending). Consequences:
Option 2 requires the terminal state to be visible (never silent
`Stream.empty`-style EOF, which is upstream's current behavior for
unsupported backends), requires Instruction-style direct consumers to
have a disposition, and keeps operator remediation explicit; Option 1
is simpler and fails fast, at the cost of making a Watchman misconfig
take down Node-backed file watching with it.

## Queue policy

The minimal current delivery policy stays **unbounded** on both sides
of the socket: the client's per-subscription queue is
`Queue.unbounded`
([`root.ts:405`](/packages/core/src/filesystem/watcher/watchman/root.ts#L405))
and the daemon's session channel is an unbounded mpsc
([`session.rs:26`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/daemon/session.rs#L26)).
Unbounded queues cannot silently drop exact events, so G3's exact-row
wording holds without further machinery. Note the daemon's earlier
per-session output budget (poison-and-close on overrun) is absent at
`d2eef362`; if a bounded budget returns, it must fail-stop the session,
never silently drop.

A bounded queue may be selected later only with one of two additional
designs, before G3 may be claimed for it:

- **Per-logical-subscriber reserved invalidation state** - each mailbox
  reserves an invalidation slot that exact-event capacity cannot
  displace; on overflow it discards or subsumes buffered exact rows,
  sets invalidation pending, and guarantees the invalidation is
  observed before any later exact row; repeated overload coalesces
  idempotently; a slow subscriber cannot affect a sibling's mailbox
  ([`carrier1-review0` CB7/addendum](/.design/watchman/carrier1-review0.gpt56sol.md)),
  or
- **Stream termination** - saturation ends the affected exact stream
  under O3, and the owner re-reads after fresh attachment.

A full queue cannot accept its own repair marker without the reserved
state; silent drop is never an assurance profile.

## Shared fixtures

The contract mints a fixture family consumed by **both** harnesses;
fault actors remain per-seam. Because two repositories cannot share a
path, fixtures are checked into both repos under
`fixtures/observation/` with a hash manifest, and a fixture revision is
a contract revision.

| Fixture family                          | Contents                                                                                                                                    | Exercises                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `capability-negotiation`                | version exchanges: enhanced v1 daemon; legacy Watchwoman (no v1, no codes); stock Watchman; daemon advertising an unknown future capability   | v1 negotiation, missing-capability inference     |
| `error-envelopes`                       | one error response and one canceled PDU per F5 code, plus an unknown-code case and a code-less cancellation                                  | F5 decoding, unknown-code fallback               |
| `epoch-identity`                        | clock strings, `watchwoman_epoch` strings, foreign-generation clocks, repeated-vs-replacement epochs                                          | fencing, Late Ghost prevention                   |
| `ordering`                              | scripted PDU sequences: invalidation-before-failure, canceled-then-reattach, late-PDU-after-release, unsubscribe-timeout                      | O1-O5                                            |
| `v1-semantic-claims`                    | one row per enumerated v1 promise, as observable wire behavior                                                                              | advertisement gate evidence                       |

Per-seam fault actors:

- **OpenCode scripted raw-client harness** - the tool specified in
  [`tools0` section 1](/.design/watchman/tools0.gpt56s.md#L1798-L1830):
  a protocol actor with expected-command queues, named Deferred
  barriers instead of sleeps, explicit response/error/timeout/end/cancel
  actions, multiple roots and generations, and injected sleepers.
  Proposed home
  `packages/core/test/filesystem/fixture/watchman/harness.ts`. It is
  the client-side consumer of these fixtures.
- **Watchwoman native fault-injection harness** - a separate, required,
  currently-unbuilt tool in the daemon repository: an injectable
  native-observation adapter that can fail construction, fail recursive
  registration, pause an initial scan, emit `Rescan`, close callback
  channels, kill holder/event tasks, overflow its buffer, and deliver
  stale-epoch callbacks
  ([`nav0-syn0` Leg 1](/.design/watchman/nav0-syn0.gpt56sol.md)). A
  real-binary launcher cannot prove those transitions deterministically;
  this harness is what the twelve daemon gates run against before v1 is
  advertised.

Fixtures carry no assertions; each harness binds the same fixture to
its own seam's claims, which is what makes a shared fixture a contract
rather than a shared test.

## Cross-references

- [`nav0-syn0.gpt56sol.md`](/.design/watchman/nav0-syn0.gpt56sol.md) is
  the route this C0 beacon belongs to: the Leg 0 checklist, the rock
  chart (Two-Crew Drift, Prose Trap, Fabricated Event Reef, Redemand
  Whirlpool), the no-incoherent-middle table, and the decision-station
  placements this document elaborates.
- [`nav0.glm53.md`](/.design/watchman/nav0.glm53.md) is the source of
  the crossing-contract layer - error-code list, envelope fields, v1
  capability name, and the B3-drift guard - and places the three
  decision stations on its beacons.
- [`assurances0.gpt56sol.md`](/.design/watchman/assurances0.gpt56sol.md)
  remains the atlas: F1-F9 definitions, G1-G8 catalog, gates, and the
  open ledger. Its F5 table and envelope examples are the seed of
  sections here; its daemon line citations predate `d2eef362` and this
  document's current-gap notes supersede them positionally, not
  conceptually.
- [`position0.glm53max.md`](/.design/watchman/position0.glm53max.md)
  defines the citation-follows convention used throughout and records
  the drift (`166eeb6d` -> `d2eef362`) this document's cancellation-gap
  findings extend.
- [`vision0.gpt56s.md`](/.design/watchman/vision0.gpt56s.md) is the
  recorded human authority for B2, full-current-line scope,
  source-state-is-truth, and static selection that this contract
  encodes rather than reopens.
- [`carrier1-review0.gpt56sol.md`](/.design/watchman/carrier1-review0.gpt56sol.md)
  supplies the contract-shaped corrections absorbed here: CB2 (decode
  the raw response), CB5 (invalidation-before-failure), CB6 (unsubscribe
  timeout vs rejection), CB7 (queue saturation), and the
  selected-backend lifecycle whose latch ownership section "State
  ownership" restates.
- [`upstream-delta0.glm53h.md`](/.design/watchman/upstream-delta0.glm53h.md)
  documents upstream's public `onReady` and source-derived `ConfigWatch`
  whose outcomes O1 and the B2 producer must generalize rather than
  displace.
- [`tools0.gpt56s.md`](/.design/watchman/tools0.gpt56s.md) specifies
  the OpenCode scripted raw-client harness that consumes these
  fixtures client-side.
- [`typed-watcher0.glm53.md`](/.design/watchman/typed-watcher0.glm53.md)
  is the deferred B3 design whose union member the B2 tag matches
  exactly; it stays a branch until a human acceptance record exists.
- [`timeout0.gpt56s.md`](/.design/watchman/timeout0.gpt56s.md) is the
  FIFO-no-request-ID fact behind O4's timeout-vs-rejection split.
- [`watches.glm53.md`](/.design/watchman/watches.glm53.md) defines the
  VCS invalidate-then-reread pattern that rides this contract's
  semantics without changing them.
