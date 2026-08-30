---
type: Design
title: Watchman value gate and maintenance-first reassessment
description: Reopens whether the retained Watchman backend should be carried at all, separates its proven generic improvements from its unproven unique value, and defines a falsification-first path.
resource: /.design/watchman/draft1.gpt56t.md
tags: [opencode, watchman, maintenance, patch-stack, value-gate]
status: draft
generated: { by: model:gpt-5.6-terra, at: 2026-08-30T14:17:11-04:00 }
stale_after: 2026-10-30
sources:
  - id: retained-recommendation
    resource: /.design/watchman/rec0.gpt56s.md
  - id: maintenance-log
    resource: /.design/watchman/README.md
  - id: initial-assessment
    resource: /.design/watchman/draft0.ds4p.md
  - id: retained-design
    resource: /.design/watch/draft1.gpt56t.md
  - id: timeout-review
    resource: /.design/watchman/timeout0.gpt56s.md
  - id: patch-policy
    resource: file:///home/rektide/a/doc/opencode/patches.md
  - id: local-log
    resource: file:///home/rektide/.local/share/opencode/log/opencode-local.log
---

# Watchman value gate and maintenance-first reassessment

## What's up

[`rec0.gpt56s.md`](rec0.gpt56s.md) gives a credible answer to a narrow
question: if the retained Watchman backend is staying, which resilience defects
should be fixed next? Its answer is cookie suppression, admission-aware command
deadlines, typed failure scope, collateral retry, and focused observability.

That is not yet the highest-value question. The recommendation assumes the
backend has earned a permanent place in the downstream patch stack. The record
shows that its architecture is coherent and its deterministic tests are good,
but it does not show that its unique benefits outweigh its operational and
maintenance costs. Several original acceptance gates remain unmeasured, the
only live test is gitignored scratch, and the strongest production evidence so
far is failure amplification rather than a measured user-facing improvement.

The question for this draft is therefore:

> If every line carried above upstream has a recurring cost, does the Watchman
> backend deliver enough unique value to keep paying for it, or should we keep
> only the small backend-neutral improvements discovered while building it?

Research prompt: *compare the current Parcel watcher, the smallest generic
retention/source-topology improvements, and the retained Watchman backend under
the same realistic OpenCode workload; identify benefits only Watchman can
provide, measure them against availability and patch-stack cost, and retire the
backend if those benefits do not appear.*

## Recommendation

Do not implement the `rec0` resilience program yet. Move Watchman from
"accepted feature that needs hardening" to "parked experiment that must earn
re-promotion."

Concretely:

1. Omit the Watchman feature from the next `working` composition while
   preserving the current bookmark and dated snapshot intact.
2. Extract or reproduce only the smallest backend-neutral candidate, initially
   watcher retention across short Skill refresh gaps, on a separate clean
   patch.
3. Let upstream's source-watch and Skill-observer work settle, then compare
   source-topology improvements against Watchman rather than benchmarking an
   already-obsolete baseline.
4. Run one controlled value experiment using the existing branch. Do not add
   more permanent instrumentation to the carrier merely to run the experiment.
5. Re-promote and harden Watchman only if it shows a clear, repeatable benefit
   that the much smaller Parcel-based changes cannot provide.

This is a hold, not a deletion. The current implementation and research remain
useful experimental assets. The change is that proof of value now precedes
more reliability engineering and recurring rebase work.

## What `rec0` actually proposes

The prior recommendation is not a registry redesign. In plain terms, it says:

1. Ignore Watchman's temporary cookie files before they trigger full Skill
   rescans.
2. Stop timing commands while they wait behind another command in the local
   FIFO.
3. Stop destroying the shared Watchman connection for errors that affect only
   one path.
4. Retry callers canceled as collateral damage when a connection really does
   fail.
5. Add enough logs and spans to attribute fallback and retirement.

Those are sensible fixes for a backend we intend to retain. They are also
second-order work. Admission semantics, policy-error taxonomy, cursor recovery,
and transport generations are all complexity created by choosing a first-party
Watchman client. Fixing them makes that choice safer; it does not establish that
the choice produces enough value.

## Evidence balance

### What is established

- The original watcher churn was real. The initial assessment observed 83
  subscribe calls, 61 stops, overlapping Skill/config roots, and four OpenCode
  server processes in one sample.
- A short `RcMap` idle lifetime makes clear-and-reacquire churn cheap for Parcel
  as well as Watchman.
- Watchman can share one recursively crawled root across subscriptions,
  processes, editors, and other clients. This is its strongest unique property.
- The retained backend has deterministic coverage for routing, fallback,
  reconnect, cursors, interruption, and subscription cleanup.
- The current flat command deadline and shared FIFO have a real burst-failure
  mode. The August 30 run captured a 9.46-second root crawl followed by broad
  generation retirement and Parcel fallback.

### What is not established

- No controlled result shows lower OpenCode startup or Location readiness
  latency with Watchman.
- No controlled result shows lower OpenCode CPU, I/O, memory, or event latency.
- No result quantifies how many recursive crawls remain after exact-key `RcMap`
  sharing, retention, one supervised server, and source-root consolidation.
- No committed live-daemon suite covers the actual daemon lifecycle. The
  current scratch script only subscribes to a temporary directory, writes one
  file, and checks for one event.
- The original design's dogfood gates for root count, subscription count,
  daemon CPU, and settle latency were never closed.
- The model-readiness incident remains correlated with Watchman activity, not
  proven to be directly blocked by watcher acknowledgement.

### The current operational signal

The retained local log is not a controlled benchmark, so these counts must not
be read as rates. They still describe the direction of the evidence available:

| Signal in `opencode-local.log` | Count |
| --- | ---: |
| Watchman-backed watcher starts | 54 |
| Watchman connection generations | 23 |
| Watchman acquisition failures falling back to Parcel | 109 |
| Skill rescans naming `.watchman-cookie-*` | 1,124 |

One cookie event is observed by many Location-scoped Skill observers, so the
last number is amplification rather than 1,124 distinct daemon incidents. That
is precisely the problem: the feature has demonstrated a way to multiply work,
while its intended savings were not instrumented or measured.

## Reassessing the original thesis

| Original claim | Current assessment | Cheapest next test or fix |
| --- | --- | --- |
| Skill invalidation repeatedly tears down and recrawls unchanged trees | Proven | Retain watcher entries briefly, or reconcile Skill watches instead of clearing all of them |
| Overlapping Config and Skill watches duplicate recursive work | Proven structurally, cost not quantified | Consolidate domain observers onto stable source roots where semantics allow |
| Multiple OpenCode servers duplicate all watcher work | Proven in the original four-server incident | First establish one supervised service; only benchmark multi-process sharing if multiple production servers remain intentional |
| Watchman shares crawls across processes and tools | True by architecture | Measure whether OpenCode actually avoids meaningful crawl/CPU/I/O cost after the smaller fixes |
| Watch count itself is a resource problem | Not supported by the initial sample, which found only 0-4 kernel watches per process | Do not optimize count without new evidence |
| Cursor recovery prevents important missed updates | Correct in theory, value not demonstrated for rescan-oriented Config/Skill consumers | Test consumer correctness across watcher restart before paying for a custom recovery state machine |
| A first-party Watchman client is the best consolidation point | Plausible, not proven | Compare it against retained Parcel subscriptions and upstream source-root consolidation |

The context also changed after the original decision:

- The systemd work is converging on one stable, supervisor-owned OpenCode
  service. That removes much of the motivating cross-process duplication.
- Upstream now retains active Location service graphs and is actively moving
  watcher ownership. `config-source-watches@origin` introduces shared source
  roots for config plugins, while `skill-source-observer@origin` moves Skill
  watch logic out of `ConfigSkillPlugin`.
- Those branches directly target the topology that made the original watcher
  behavior expensive. They also make `ConfigSkillPlugin` a poor place to grow
  more downstream timing and filtering code.

Watchman's cross-tool daemon sharing remains genuinely unique. It now needs to
show that this unique property matters in the intended deployment, rather than
being accepted because it is elegant infrastructure.

## Carry cost

Against `v2@origin`, the persistent package/code/test delta at
`watchman-20260829` is 1,023 insertions and 30 deletions across 18 files. The
whole feature stack is 29 commits because it also carries design history and
corrective work such as adding and later removing the root ledger.

The merge-conflict count has been manageable, but line count is not the only
cost. The feature also owns:

- a private ESM transport fork and its release/type lifecycle;
- a generation manager, command timeout policy, reconnect loop, route cache,
  cursor state, subscription naming, decoding, and fallback contract;
- backend selection through Core, Server, and CLI;
- project/exact routing hints in fast-moving Config and Skill consumers;
- daemon policy and health interactions outside OpenCode's process;
- a permanent obligation to distinguish Watchman failures from OpenCode
  readiness, shutdown, and source-refresh failures.

The carry surface is uneven:

| Surface | Carry risk | Value if Watchman is removed |
| --- | --- | --- |
| `filesystem/watchman/*` and focused tests | Low merge risk, high semantic ownership | None |
| `filesystem/watcher.ts` retention | Moderate upstream churn | Potentially high and backend-neutral |
| Fallible/scoped native watcher contract | Moderate upstream churn | Unclear without another backend needing it |
| Routing fields in `config.ts` and Skill observer | High upstream churn, small hunks | None without Watchman |
| CLI/Server backend option | High upstream churn, small hunks | None without Watchman |
| `watchmanNotifySeconds` plumbing | Cross-package surface, disabled by default | None; drop even if Watchman later survives unless an operator uses it |
| Package and lockfile dependencies | Frequent mechanical conflicts | None without Watchman |

The isolated backend is easy to rebase but expensive to understand and own.
The shared hunks are small but sit in precisely the files upstream is changing.
Both dimensions matter.

## Small pieces that may survive

Do not assume every piece should be extracted. Evaluate these independently:

### 1. Short watcher retention

This is the strongest survivor. It directly addresses the measured
clear-and-reacquire loop with one generic `RcMap` policy and benefits the
existing Parcel backend. Rebuild it as its own final-state patch against
upstream rather than preserving it inside the Watchman commit.

The duration does not have to remain 15 minutes merely because that is the
current value. Measure the longest normal release-to-reacquire gap and choose a
small forgiving lifetime, or prefer domain-level watch reconciliation if the
new Skill observer makes that simpler.

### 2. Source-root consolidation

Prefer one stable source-root subscription plus domain filtering over nested
recursive subscriptions where the consumer semantics permit it. This is the
direction of `config-source-watches@origin` and may erase more of the original
problem without another daemon or protocol.

Do not fork those unmerged branches. Wait for an upstream shape, then measure
what duplicate physical subscriptions remain.

### 3. Cookie suppression

Cookie filtering is a valid domain rule: a synchronization artifact cannot
change a Skill. It is also primarily a response to running Watchman roots while
some interests have fallen back to Parcel.

Disable the OpenCode Watchman backend and check whether cookie-driven rescans
continue after relevant daemon roots disappear. Carry the filter as a small
upstreamable Skill fix only if the event remains reproducible independently.
Do not make a permanent patch solve residue created only by a parked feature.

### 4. Better watcher diagnostics

Keep only diagnostics that answer an active product question for every backend,
such as acquisition latency or physical subscription churn. Watchman-specific
spans, metric readers, and plugin tracing do not belong in the value experiment
unless existing logs cannot answer the decision.

## Options

| Path | Product value | Carry cost | Recommendation |
| --- | --- | --- | --- |
| Harden the current backend now | Makes a plausible feature safer, but does not prove it helps | Increases an already large semantic obligation | Do not choose yet |
| Park, extract small generic wins, and run a value gate | Preserves the option while stopping automatic maintenance investment | Small temporary experiment plus one likely generic patch | Recommended |
| Drop Watchman permanently now | Immediately removes the full backend and transport burden | Lowest | Reasonable if cross-process/cross-tool sharing is no longer a goal |
| Make Watchman the default and learn from production | Maximum exposure to value and failure | Highest operational risk | Reject |

## Value experiment

The experiment should try to falsify the need for Watchman, not demonstrate
that its API works.

### Variants

Run from one common upstream tip:

1. Upstream Parcel behavior.
2. Parcel plus the smallest retention fix.
3. Parcel plus the source-topology improvements that have actually landed
   upstream by the time of the run.
4. The current retained Watchman backend.

Do not harden variant 4 first. Its present failure rate is part of the
cost/value decision. If it wins on value but loses on reliability, that is the
specific evidence needed to justify `rec0`.

### Workload

- Start one cold supervised OpenCode service and open the same representative
  set of Locations.
- Load global, project-local, symlinked, missing, and external Skill sources.
- Trigger repeated Skill refreshes and ordinary file changes.
- Measure both cold roots and already-warm roots.
- Restart the selected watcher backend once while subscriptions are live.
- Run a multi-process variant only if the target deployment will intentionally
  retain multiple OpenCode servers.

### Outcomes

Measure user and system outcomes, not protocol activity alone:

- time until model/provider and Skill state are usable;
- full Skill rescans per logical file change;
- physical watcher acquisitions, releases, and recursive roots;
- process and daemon CPU, I/O, memory, and file-descriptor pressure;
- event delivery latency and missed-update behavior;
- fallback, reconnect, and terminal failure counts;
- cold and warm Location boot latency.

Keep the harness under `.test-agent/watchman-value/` with a README describing
setup, workload, raw outputs, and interpretation. Temporary timing patches may
live on an unbookmarked experimental descendant and be abandoned after the run.
They should not silently become part of the floating feature.

### Pass condition

Watchman earns retention only if it produces a clear, repeatable improvement in
an outcome that matters and that the smaller Parcel-based changes do not
provide. Architectural sharing, fewer conceptual crawls, or successful event
delivery are not sufficient by themselves.

It should fail the gate if:

- its only material win appears in a multi-server setup the systemd design will
  eliminate;
- retention/source consolidation removes the observed churn at much lower
  cost;
- wins are small or noisy while fallback and daemon coupling remain visible;
- the experiment requires broad permanent instrumentation before any benefit
  can be seen.

## Decision outcomes

### If Watchman fails the value gate

- Remove the backend, transport dependencies, routing hints, CLI/Server option,
  fallible native-stream additions used only by Watchman, and notify plumbing
  from `working`.
- Preserve the dated feature snapshot and design corpus as prior art.
- Promote only independently justified retention or source-observer patches.
- Recheck whether cookie filtering is still needed after daemon roots age out.

### If Watchman passes the value gate

Then `rec0` becomes the right next design. Implement admission separation,
failure scope, and collateral retry before re-promotion. Cookie suppression is
included only if the controlled run reproduces that backend-crossing path.

After behavior is proven, replace the historical 29-commit carrier with a clean
final-state line based on the current `v2@origin`, while retaining the old dated
bookmark for audit. A maintainable shape would be:

1. Generic watcher retention, preferably upstreamed and independently tested.
2. The minimum scoped/fallible native seam Watchman actually needs.
3. Retained Watchman backend, transport dependency, and deterministic tests in
   final form.
4. Project/exact routing hints at the then-current Config/Skill owner.
5. One opt-in backend selection path.
6. Command admission and failure-isolation hardening.
7. One terminal maintenance/design commit.

Do not carry the ledger add/remove sequence, successive recovery repair commits,
or cross-package notify-seconds option in the replacement line. Do not add
metrics export, readiness restructuring, or live Parcel-to-Watchman promotion
without separate evidence.

## Immediate path

1. Record Watchman as held rather than accepted for the next `working` rebuild.
2. Build the value harness without changing the floating feature stack.
3. Compare upstream Parcel, retained Parcel, landed source consolidation, and
   current Watchman.
4. Make an explicit retain/drop decision from the results.
5. Only then either recut and harden the carrier or extract the small survivors
   and retire it.

This sequence spends effort on the decision with the largest possible payoff:
eliminating an entire maintained subsystem if it is not clearly valuable. It
does not ignore the resilience findings. It makes them conditional on the
backend first earning the right to be made resilient.

## Open questions

1. Is one supervisor-owned OpenCode service now the intended steady-state
   deployment, or is multi-process sharing still a first-class requirement?
2. What user-visible symptom should Watchman improve enough that we would notice
   its absence?
3. Should the first small survivor be a generic watcher TTL or a reconciled
   Skill observer that never clears unchanged watches?
4. If the value result is marginal, is cross-tool sharing itself worth owning a
   custom transport and daemon dependency?

## Cross-references

- [`rec0.gpt56s.md`](rec0.gpt56s.md) remains the conditional hardening plan if
  Watchman passes the value gate.
- [`draft0.ds4p.md`](draft0.ds4p.md) contains the original 83-subscribe/61-stop
  and four-server measurements; this draft separates the generic churn from
  Watchman's unique value.
- [`../watch/draft1.gpt56t.md`](../watch/draft1.gpt56t.md) defines the original
  dogfood and performance acceptance gates that remain open.
- [`timeout0.gpt56s.md`](timeout0.gpt56s.md) is the strongest evidence of the
  current backend's operational cost and the source for the conditional
  resilience design.
- [`README.md`](README.md) records the current 29-commit feature line, rebase
  history, verification, and uncommitted live-daemon test.
- [OpenCode patch policy](file:///home/rektide/a/doc/opencode/patches.md) defines
  independent feature stacks, current-upstream freshening, and semantic
  collision bail-outs; parking Watchman keeps those rules honest.
- [Systemd maintenance-first recommendation](file:///home/rektide/src/opencode-systemd/.design/systemd/rec0.gpt56s.md#addendum-a-maintenance-first-manager)
  uses the same touch-point-budget principle and changes the Watchman value
  equation by targeting one stable server process.
