---
type: Design
title: Watchman retained backend recommendation
description: Concise synthesis of the Watchman design corpus and a prioritized recommendation for resilience, observability, and rollout.
resource: /.design/watchman/rec0.gpt56s.md
tags: [opencode, watchman, resilience, observability, recommendation]
status: draft
generated: { by: model:gpt-5.6-sol, at: 2026-08-30T17:24:45Z }
sources:
  - id: maintenance
    resource: /.design/watchman/README.md
  - id: initial-design
    resource: /.design/watchman/draft0.ds4p.md
  - id: registry-design
    resource: /.design/watchman/init0.glm52.md
  - id: cleanup-design
    resource: /.design/watchman/cleanup0.gpt56t.md
  - id: observability-design
    resource: /.design/watchman/otel0.glm53.md
  - id: timeout-inventory
    resource: /.design/watchman/timeout0.glm53.md
  - id: timeout-review
    resource: /.design/watchman/timeout0.gpt56s.md
---

# Watchman retained backend recommendation

## Recommendation

Keep the retained Watchman backend and its current ownership model. The core
architecture is sound, substantially implemented, and well tested. Do not
redesign root retention, add a cross-process ledger, or issue `watch-del`.

The next work should be a focused resilience pass:

1. Suppress Watchman synchronization cookies before config-skill refresh and
   add enough timing to separate watcher activity from plugin readiness.
2. Replace blanket generation retirement with typed, scope-aware failure
   handling.
3. Put an admission gate before the serialized raw client so queue wait and
   command execution have different deadlines.
4. Retry interests closed only as collateral damage; retain immediate Parcel
   fallback for genuinely local or initial failures.
5. Instrument the resulting boundaries with structured logs and short linked
   spans. Add exported metrics only when the host has a metric reader.

Do not change the five-second model-readiness behavior as a Watchman fix yet.
The watcher starts in a child fiber, so the incident proves correlation and
resource contention, not that Watchman acknowledgement directly held the ready
latch. Run a controlled Watchman/Parcel/disabled comparison first.

## Decision summary

| Area | Recommendation | Status |
| --- | --- | --- |
| Backend shape | First-party Watchman native behind `Watcher.Native`, with Parcel fallback | Keep |
| Root routing | Reuse walked-up project roots with `relative_root`; exact-watch paths that cannot safely walk up | Keep |
| Root ownership | Unsubscribe our subscriptions; never issue global `watch-del` | Settled |
| Retention | Flat 15-minute `RcMap` idle TTL; rely on location-service retention above it | Settled |
| Recovery | Cursor resume, unbounded reconnect after acknowledgement, blanket update on fresh instance | Keep |
| Initial fallback | Parcel is allowed before the first successful subscribe acknowledgement | Keep, narrow by failure kind |
| Default posture | Remain opt-in while timeout hardening is unfinished | Keep for now |
| Command timeout | Separate admission wait from submitted-command response time | Change next |
| Failure scope | Retire only for transport/protocol-generation failure, not path-local daemon responses | Change next |
| Cookie events | Filter exact `.watchman-cookie-<host>-<pid>-<serial>` artifacts in config-skill handling | Change next |
| Model readiness | Measure before changing the gate or activation ordering | Investigate separately |
| Telemetry | Structured causes and linked event spans first; metric export after a reader exists | Add incrementally |

## What the corpus says

The seven documents form a useful progression rather than seven competing
current designs:

| Document | Lasting contribution | Superseded or corrected point |
| --- | --- | --- |
| [`draft0.ds4p.md`](/.design/watchman/draft0.ds4p.md) | Identified duplicate crawls, overlapping skill/config watches, skill invalidation churn, and the existing native seam | Proposed handwritten protocol code and proactive root deletion |
| [`init0.glm52.md`](/.design/watchman/init0.glm52.md) | Verified `watch-project`, `relative_root`, expressions, cursor behavior, the Parcel backend's limits, and shared-route coalescing | Per-context root leases, activity-gated grace, and `watch-del` accounting were unnecessary; dropping fresh PDUs was too weak |
| [`cleanup0.gpt56t.md`](/.design/watchman/cleanup0.gpt56t.md) | Source-verified that subscriptions are connection-scoped and roots are daemon-global and self-reaped | Eliminated the landed ledger and all proactive `watch-del` plans |
| [`README.md`](/.design/watchman/README.md) | Records the actual feature stack, settled behavior, configuration, rebases, tests, and open work | Operational source of truth, not a new design |
| [`otel0.glm53.md`](/.design/watchman/otel0.glm53.md) | Established short linked subscribe/unsubscribe/resume spans and mapped the host's real logs/traces support | Metrics have no export pipeline today; plugin tracing is separate from backend instrumentation |
| [`timeout0.glm53.md`](/.design/watchman/timeout0.glm53.md) | Found the shared FIFO blast radius, flat timeout, policy-poison bug, route-cache churn, fallback behavior, and logging gap | Over-attributed model 503s and cookies to direct Watchman subscription behavior |
| [`timeout0.gpt56s.md`](/.design/watchman/timeout0.gpt56s.md) | Corrected readiness, daemon-clock, and cookie attribution; separated admission from execution and path failures from generation failures | Best basis for the resilience implementation |

## Settled architecture

The original problem was not a large steady-state watch count in one process.
It was repeated recursive crawls, overlapping roots, unignored skill trees, and
clear/re-watch churn multiplied across several OpenCode servers. Watchman is the
right consolidation layer because its daemon shares kernel watches and crawls
across OpenCode, editors, and other clients.

The retained implementation has the right shape:

- Directory interests use a separated Watchman adapter behind the existing
  `Watcher.Native` interface; file interests keep the lightweight native path.
- One client generation per OpenCode process serves many logical interests.
- `watch-project` and exact routing find a safe daemon root; subscriptions use
  `relative_root`, distinct expressions, and generation-local route coalescing.
- Local ignore filtering remains authoritative even when literal expression
  terms are pushed to Watchman.
- Per-subscription cursors preserve changes across reconnect. A fresh daemon
  instance causes conservative invalidation through one blanket update rather
  than silently dropping an uncertain interval.
- Parcel fallback is safe before the first Watchman subscribe acknowledgement.
  After acknowledgement, recovery remains on the Watchman lifecycle so a
  backend switch cannot silently introduce an event gap.
- Reconnection is unbounded with capped exponential backoff. An explicit
  unsubscribe still wins during an outage and prevents resurrection.

The ownership decision is especially important. A Watchman subscription belongs
to its socket and disappears when that client disconnects. A root is global,
unowned, and shared by every daemon client; `watch-del` removes it for everyone.
The daemon already reaps a root with no subscriptions, triggers, or command
activity after `idle_reap_age` (five days by default). Therefore:

- the subscription is OpenCode's claim;
- the 15-minute `RcMap` TTL decides when OpenCode no longer wants an interest;
- unsubscribe is the only cleanup OpenCode should perform;
- daemon root GC is the only safe root-level arbiter;
- ledgers, PID probes, root censuses as deletion gates, and activity-tiered
  retention should stay deleted.

## Highest risk: FIFO failure amplification

The current resilience defect is narrower than the architecture and severe
enough to fix before broader rollout.

The fork serializes all commands on one connection. OpenCode starts a flat
ten-second timer when a caller enters that hidden FIFO, not when its command is
submitted. A cold root crawl can consume almost the whole budget. Every sibling
behind it then expires from queue residence, the first timeout retires the
generation, `client.end()` fails the current and queued callbacks, and many
interests permanently fall back to Parcel for their retained lifetimes.

Two additional mistakes enlarge the blast radius:

- `establish` retires the shared generation for completed path-local errors such
  as an `enforce_root_files` rejection, even though the response consumed its
  proper FIFO slot and the connection remains synchronized.
- Collateral callers canceled by generation retirement are treated like callers
  whose own command failed, so they do not retry on the replacement generation.

The active command is different. Watchman's protocol and the fork expose no
request IDs or command cancellation. If a submitted command exceeds its
response deadline, response position is unknown and same-connection probes
cannot overtake it. Retiring that generation is correct. The error is timing
queued callers as though they were active and treating all completed daemon
errors as transport poison.

## Recommended implementation

### 1. Remove the proven rescan amplifier

Filter exact Watchman synchronization-cookie basenames in
`ConfigSkillPlugin`, before they enter the capacity-one change queue. This is a
domain fact: a daemon synchronization artifact cannot add, remove, or modify a
skill. Filtering at this boundary works for Watchman, Parcel, inotify, and node
fallback; a Watchman expression alone would miss the observed Parcel path.

Keep the match narrow enough to require the terminal numeric PID and serial.
Do not use this change to ignore `.watchmanconfig`, all dotfiles, or all
non-Markdown paths. Add one regression test for a cookie event and one proving a
normal skill change still refreshes.

At the same time, time plugin activation, initial skill scan/parse, ready-latch
transitions, watcher admission, and fallback. This creates evidence for the
separate model-readiness investigation without changing ordering or semantics.

### 2. Make failure scope explicit

Introduce typed failure kinds and remove blanket `tapError(retire)` behavior.
Use this action table:

| Failure | Action |
| --- | --- |
| Known path-policy response | Fall back that initial interest; keep generation |
| Admission expiry before submission | Retry or fall back that interest; keep generation |
| Collateral generation closure | Retry against the next generation |
| Socket `error` or `end` | Retire generation once |
| Submitted-command response timeout | Retire generation once |
| Capability failure before publication | Close candidate generation; report unavailable |
| Unsupported decoded response | Fail visibly without reconnect churn; decide backend disablement explicitly |
| Subscription cancellation PDU | Re-establish that subscription first, not all siblings |

Keep classification narrow. Do not add a long-lived negative route cache: root
markers and daemon policy can change while OpenCode remains alive, and the
retained Parcel entry already damps repeated acquisition for its TTL.

### 3. Gate admission before the raw FIFO

Add one command admission gate per generation in the adapter. A command waits
for the gate while racing generation closure; only the admitted command is
submitted to the raw client. Start its response deadline after admission. This
keeps the fork's internal FIFO empty except for the active command and ensures
queue wait cannot consume execution budget.

Use separate internal policies for capability, route creation, clock,
subscribe, and best-effort unsubscribe. Route creation needs a cold-crawl
budget; clock is a cheap logical-clock command and should not gain
`sync_timeout`. Do not expose five new public knobs before telemetry shows a
real operational need. Choose initial durations from measured crawl and
subscribe distributions, not from the unrelated model endpoint deadline.

The adapter gate is the smallest correct first step. A dispatch notification in
`fb-watchman-esm` could anchor response timing exactly at `socket.write`, but it
is not required to remove local queue residence from the timer.

### 4. Retry only collateral failure

Waiters that lose a generation before submitting should back off and acquire the
manager's replacement generation. They should not touch the ended raw client or
immediately become retained Parcel watchers.

Keep immediate fallback for an unavailable daemon, a path-policy rejection, or
the interest whose submitted command genuinely timed out. Do not add live
Parcel-to-Watchman promotion yet; safe promotion needs an explicit overlap or
invalidation handoff. Existing Parcel entries can naturally retry after their
`RcMap` lifecycle ends.

### 5. Instrument the new boundaries

First make the normal log file sufficient to reconstruct an incident:

- generation creation and one attributed retirement cause;
- command stage, admission wait, and submitted response latency;
- admission expiry versus active timeout;
- policy rejection, collateral retry, and fallback reason;
- suppressed synchronization artifacts;
- selected socket and daemon version at connect.

Do not put root paths or subscription IDs in metric labels. They belong in debug
logs or sampled spans.

For tracing, use short `watchman.subscribe`, `watchman.unsubscribe`, and
`watchman.resume` event spans. Link unsubscribe and resume back to the completed
subscribe span and include a shared subscription attribute. Do not use a
hours-long subscription lifetime span. Core Effect code already inherits the
host tracer when OTLP is configured.

The host currently exports logs and traces, not metrics. Effect counters,
gauges, and histograms can be added with the command-boundary work, but they are
not operational telemetry until `Observability.layer` gains a metric reader.
The separate `ctx.trace` proposal for promise/TUI plugins is useful but does not
block Watchman instrumentation.

## Verification gate

Before considering Watchman-by-default, deterministic tests should prove:

1. A slow route command does not start sibling response timers while they wait.
2. Admission expiry occurs before raw submission and does not end the client.
3. A submitted command that never responds retires exactly one generation.
4. Collateral waiters retry on the replacement generation.
5. A root-policy rejection falls back one path while a sibling succeeds on the
   same generation.
6. A cookie event from the Parcel test backend does not refresh skills, while a
   normal skill event still does.
7. A never-answering Watchman command does not hold the initial skill transform
   or plugin-ready latch if all synchronous plugin work is fast.
8. Existing cursor recovery, fresh-instance invalidation, cancellation, and
   no-`watch-del` behavior remain intact.

Use fake time for deadline tests. Add a committed, opt-in live-daemon suite for
policy rejection, daemon restart, cookie suppression, and cursor resume. Run the
same cold Location set with Watchman, Parcel, and watching disabled before
assigning causality to model-readiness failures.

## Defer until after resilience

- Flipping the default from opt-in to prefer-when-reachable.
- Changing the model-readiness timeout or activation ordering.
- Live Parcel-to-Watchman promotion.
- Session-activity-tiered watcher retention.
- Any root ledger, root census deletion gate, or proactive `watch-del`.
- Broad cookie or dotfile normalization in the generic watcher.
- Collapsing skill watches to a narrower `SKILL.md` expression until consumer
  semantics are audited.
- Exposing plugin tracers and adding the host OTLP metric reader; useful, but
  separate platform work.
- Upstreaming the adapter's lifecycle guards and a dispatch hook to
  `fb-watchman-esm`; do after the adapter behavior is proven.
- CLI packaging checks and the fork's pending type-shim removal; maintenance
  work, not resilience design.

## Bottom line

The Watchman project does not need another ownership or registry redesign. Its
retained-subscription model, cursor recovery, daemon-native root lifecycle, and
Parcel fallback are the right foundation. The remaining production risk comes
from treating a serialized command queue as concurrent timed work and treating
every establishment error as a broken shared connection.

Fix those boundaries, stop backend-crossing cookie artifacts from triggering
full skill reloads, and make each fallback and retirement attributable. Only
then decide whether Watchman should become the default or whether model
readiness needs a separate product change.

## Cross-references

- [`README.md`](/.design/watchman/README.md) is the operational source of truth
  for the retained stack, configuration, verification commands, and known
  flakes.
- [`cleanup0.gpt56t.md`](/.design/watchman/cleanup0.gpt56t.md) is the
  source-verified ownership argument behind the no-`watch-del` ruling.
- [`timeout0.gpt56s.md`](/.design/watchman/timeout0.gpt56s.md) contains the
  detailed incident evidence and source corrections behind the resilience
  sequence above.
- [`otel0.glm53.md`](/.design/watchman/otel0.glm53.md) contains the host
  observability inventory and linked-span design.
