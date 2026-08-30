---
type: Design
title: Watchman first-principles value reassessment
description: Independent reassessment of whether the custom Watchman backend has demonstrated enough value to remain in the accepted patch stack.
resource: /.design/watchman/reassess0.gpt56s.md
tags: [opencode, watchman, filesystem, value, reassessment]
status: draft
generated: { by: model:gpt-5.6-sol, at: 2026-08-30T18:31:04Z }
model_identity: GPT-5.6 Sol inferred from the spawned-session context; the runtime did not expose a direct model-ID field for independent verification.
sources:
  - id: retained-recommendation
    resource: /.design/watchman/rec0.gpt56s.md
  - id: maintenance-log
    resource: /.design/watchman/README.md
  - id: original-motivation
    resource: /.design/watchman/draft0.ds4p.md
  - id: retained-design
    resource: /.design/watch/draft1.gpt56t.md
  - id: accepted-source-diff
    resource: jj:v2@origin..watchman-20260829
  - id: config-source-watches
    resource: jj:a1dc8662732e67d1856f1e6e88b9ade8a33af9e8
  - id: skill-source-observer
    resource: jj:9e3f6e7da50fca11293ca1a60a0bd7b3331f3471
  - id: local-log
    resource: file:///home/rektide/.local/share/opencode/log/opencode-local.log
---

# Watchman first-principles value reassessment

## Recommendation

Remove the custom Watchman backend from the accepted working patch stack. Keep
`watchman-20260829` as an experimental or archived branch so its protocol and
recovery work remains available, but do not make the current implementation a
maintenance obligation until it passes a comparative value test.

This disagrees with the recommendation to retain the backend in
[`rec0.gpt56s.md`](/.design/watchman/rec0.gpt56s.md#L28-L50). That document's
resilience diagnosis is substantially correct, but its retention conclusion
rests on architectural plausibility, implementation effort, and unit coverage.
Those are not substitutes for demonstrated product value.

The burden of proof should be reversed: a custom transport remains outside the
accepted stack until it shows a material system-level improvement over a much
smaller source-observer fix and over Parcel's existing backend choices.

## First-principles question

The relevant question is not whether Watchman is a capable daemon or whether
the adapter can eventually be hardened. It is:

> Does a first-party Watchman transport improve current OpenCode behavior enough
> to justify its dependency, protocol lifecycle, routing vocabulary, recovery
> state machine, fallback policy, observability work, and recurring rebase cost?

The evidence currently answers **not demonstrated**, and the local smoke test
shows a representative negative result.

## Original problem versus proposed mechanism

The original report was that `fs.watch`/inotify activity was "happening like
crazy." The initial investigation found:

- 83 logical subscriptions, 62 physical starts, and 61 stops in one log sample;
- overlapping config and skill roots;
- skill source watches with no ignores;
- full watch teardown and reconstruction on skill invalidation;
- four OpenCode service processes at that moment;
- only 0-4 steady-state kernel watches per process.

The last point matters. The investigation explicitly concluded that the problem
was not a large steady-state descriptor count, but inferred duplicate crawls and
churn multiplied across processes
([`draft0.ds4p.md`](/.design/watchman/draft0.ds4p.md#L48-L55)). That inference is
reasonable, but no baseline measured system CPU, crawl time, inotify setup work,
settle latency, or user-visible readiness impact.

The current service topology further weakens the original multiplier. During
this reassessment, `opencode2 service status` reported one elected service and
`pgrep` found one `opencode2 serve --service` process. Multiple standalone
servers remain possible, but four concurrent services should not be treated as
the normal case without current evidence.

Watchman is therefore one possible mechanism for an incompletely quantified
problem, not the established solution to a proven bottleneck.

## Patch cost and evidence coverage

The exact `v2@origin..watchman-20260829` code and test diff contains 1,023
insertions and 30 deletions across 18 files. The production surface includes:

| Surface | Size or implication |
| --- | --- |
| `watchman/client.ts` | 196 lines: generations, capability check, serialized raw client, deadlines, retirement, demand tracking |
| `watchman/native.ts` | 250 lines: establish, cursor recovery, retries, fallback, event mapping, local filtering |
| `watchman/route.ts` | 35 lines: project/exact route resolution and generation cache |
| `watchman/schema.ts` | 71 lines: external protocol decoding |
| `watcher.ts` integration | routing in public interest keys, terminal stream failure, lazy backend, retained entries |
| Other integration | CLI/server options, environment parsing, dependencies, config and skill routing hints |

This is roughly 650 production lines plus `@superbfowle/fb-watchman-esm`,
`micromatch`, and `is-glob` dependency surface.

The focused test count is real, but it overstates operational confidence. The
Watchman behavior tests construct a fake `Manager` and replace the real raw
client at
[`watchman.test.ts`](/packages/core/test/filesystem/watchman.test.ts#L29-L51).
They prove route memoization, event mapping, fallback selection, cursor reuse,
and an abstract reconnect loop. They do not exercise the real command FIFO,
timer placement, socket response ordering, or cold daemon crawl that failed in
the live run.

The design itself required measurements for subscriptions per root, daemon CPU,
event latency, delivered traffic, and reconnect time
([`draft1.gpt56t.md`](/.design/watch/draft1.gpt56t.md#L280-L293)). It also made
performance and root-count behavior acceptance gates
([`draft1.gpt56t.md`](/.design/watch/draft1.gpt56t.md#L546-L557)). Those gates
were not run. The maintenance log confirms that diagnostics and the committed
live-daemon integration suite remain absent
([`README.md`](/.design/watchman/README.md#L286-L297)).

## What has actually been demonstrated

The following value is demonstrated:

1. The adapter can connect to the local Watchman daemon.
2. It can create routed subscriptions and map Watchman PDUs to watcher updates.
3. It can resume some acknowledged subscriptions with cursors after connection
   replacement. Examples appear in `opencode-local.log:102880` and
   `258317-258430`.
4. It can fall back to Parcel when initial acquisition fails.
5. Backend-independent `RcMap` retention reuses an unchanged physical interest
   in deterministic tests
   ([`watcher.test.ts`](/packages/core/test/filesystem/watcher.test.ts#L87-L115)).

These are implementation capabilities, not evidence of net value. No result
demonstrates:

- fewer system-wide crawls or kernel watches in the current one-service case;
- lower OpenCode plus Watchman CPU or RSS;
- faster Location, plugin, skill, or model readiness;
- fewer skill rescans;
- better event latency;
- an advantage over Parcel's built-in Watchman backend;
- an advantage over source-level reconciliation and filtering;
- acceptable cold-start or fallback rates.

Across the uncontrolled local log corpus, there are 54 successful Watchman
watcher starts, 24 Watchman connections, 24 subscription resumes, and 124
Watchman-to-Parcel acquisition fallbacks. These totals are not a controlled
comparison and should not be converted into rates. They do show that fallback
and generation churn are ordinary observed behavior, not merely theoretical
edge cases.

## Local live smoke

### Method

A private V2 server from this worktree was started without touching the elected
background service:

```sh
OPENCODE_WATCHER_BACKEND=watchman \
OPENCODE_PRINT_LOGS=1 \
bun dev serve --hostname 127.0.0.1 --port 46789 --print-logs --log-level info
```

An authenticated local `GET /api/skill` request for
`/home/rektide/src/opencode-watchman` activated the real Location, config,
plugin, skill, and watcher paths. The daemon was Watchman/Watchwoman
`2026.03.30.00`. Repository files were not modified.

### Result

The server and Location became healthy, but the custom backend did not provide
the intended watch service:

1. Watchman connected as generation 1 at
   `~/.local/share/opencode/log/opencode-local.log:643856`.
2. A cold `watch-project` occupied the raw FIFO for the full ten-second command
   deadline.
3. The timer retired generation 1 with `command timed out: watch-project`.
4. All 15 directory interests failed with `The client was ended` at
   `opencode-local.log:643946-643960`.
5. All 15 started Parcel/inotify watchers at
   `opencode-local.log:643961-643975`.
6. `watchman watch-list` showed three newly established roots:
   `/home/rektide/.config/opencode`, `/home/rektide/.opencode`, and
   `/home/rektide/src/opencode-watchman`.
7. `watchman debug-get-subscriptions` reported zero OpenCode subscriptions for
   all three roots while the server was still alive.

The run therefore paid for a cold Watchman crawl and for the fallback inotify
watchers while receiving none of the claimed daemon-subscription benefit.

The failure follows directly from the current implementation:

- every caller starts the same flat deadline before its command is serviced by
  the raw FIFO
  ([`client.ts`](/packages/core/src/filesystem/watchman/client.ts#L75-L104));
- a timeout retires the entire generation
  ([`client.ts`](/packages/core/src/filesystem/watchman/client.ts#L90-L96));
- every establishment error retires the generation, including route-local
  failures
  ([`native.ts`](/packages/core/src/filesystem/watchman/native.ts#L63-L130));
- all initial interests closed as collateral damage fall back independently
  ([`native.ts`](/packages/core/src/filesystem/watchman/native.ts#L37-L50)).

This supports `rec0`'s FIFO diagnosis, but contradicts treating that diagnosis
as a reason to retain the feature. The issue occurred on the first realistic
cold activation attempted during this reassessment. It is a primary path, not a
tiny corner case.

## Cookie evidence is generic, not a retention argument

The local corpus contains 1,124 `skills rescanned` records whose triggering path
is a `.watchman-cookie-*` artifact. A representative burst is at
`opencode-local.log:562134-562136`.

This is concrete waste, but it does not justify the custom backend. The active
server later reproduced minute-by-minute cookie-triggered rescans while its
directory backend was `inotify`, for example
`opencode-local.log:642313-642398`. Watchman cookies can be created by another
daemon client and observed through any filesystem backend.

The durable fix is domain filtering in the skill source observer. Discovery
reads root `*.md` files and nested `SKILL.md` files; unrelated changes should
not reach the rescan queue. Such filtering removes Watchman cookies, editor
temporary files, build artifacts, and arbitrary unrelated subtree traffic
without encoding one backend artifact's filename grammar.

## Upstream direction

Two upstream branches strengthen a cheaper, domain-owned solution.

`config-source-watches@origin` contains commit `a1dc8662732e` (`refactor(core):
move agent and command watch ownership`). Its
`packages/core/src/config/source-watch.ts:14-46`:

- applies the existing `node_modules` and `.git` ignores;
- reconciles stable config roots rather than blindly rebuilding them;
- watches a source root once;
- filters events to the subdirectories the consumer actually reads.

This attacks duplicate interests and irrelevant traffic before backend choice.

`skill-source-observer@origin` contains commit `9e3f6e7da50f` (`refactor(core):
separate skill source observation`). It extracts source observation into
`packages/core/src/skill/source-observer.ts`. That creates the correct seam for
generic fixes, although the branch intentionally preserves the current churn:

- watcher acquisition is centralized at lines 28-37;
- actual discovery semantics are visible at lines 81-103;
- `FiberMap.clear(watches)` still rebuilds all interests at lines 113-132.

The extraction also exposes a Watchman maintenance cost. The observer subscribes
without Location or routing context at line 30, while
`ConfigSkillPlugin` delegates to it at
`skill-source-observer@origin:packages/core/src/config/plugin/skill.ts:59`.
Preserving Watchman's `project` versus `exact` routing would require leaking a
backend-specific route decision into this new domain seam or recreating project
classification elsewhere.

Historical logs already contain identical paths acquired as both `project` and
`exact`, such as `opencode-local.log:555778-555806`. Because routing is part of
the process-global `RcMap` key
([`watcher.ts`](/packages/core/src/filesystem/watcher.ts#L107-L156)), those
interests do not deduplicate. This undercuts the claim that routing hints are a
small, stable addition to the existing consumer model.

## Cheaper survivor architecture

Removing the custom transport should not mean reverting to the original churn.
The useful pieces can stand alone:

### 1. Reconcile source interests

Replace `FiberMap.clear` in `SkillSourceObserver` with stable-key reconciliation:
retain unchanged roots and sentinels, add new ones, and release removed ones.
This directly eliminates teardown/reacquisition rather than masking it behind a
long backend cache.

### 2. Filter by domain relevance

Apply `.git` and `node_modules` ignores and admit only paths capable of changing
the skill snapshot. Preserve explicit handling for missing roots, symlinks, root
Markdown files, and nested `SKILL.md` files. Filtering belongs beside discovery
because that module knows what can affect its output.

### 3. Consolidate config source watches

Adopt the `ConfigSourceWatch` pattern from `a1dc8662732e`: one reconciled root
watch, shared ignore policy, and consumer-specific path filtering. This reduces
watch count and event traffic on every backend.

### 4. Extract retention independently

The 15-minute `RcMap` idle TTL at
[`watcher.ts`](/packages/core/src/filesystem/watcher.ts#L114-L156) is a small,
backend-independent candidate. Keep it in a separate patch only if a live count
shows that short release/reacquire gaps still occur after source reconciliation.
The deterministic reuse test can move with it. Reconciliation may permit a much
shorter tail or make the TTL unnecessary.

### 5. Test the existing backend before owning a transport

If daemon consolidation remains valuable, compare Parcel's existing
default/Watchman backend with explicit inotify. This is a far cheaper way to
test whether shared daemon roots materially help the current topology. A custom
transport is justified only by a measured gap that Parcel cannot close.

## Maintenance implications of retention

Keeping the current backend means accepting more than the four Watchman modules:

- a forked transport dependency and its packaging/type-shim lifecycle;
- command admission and execution deadline policy;
- generation-wide failure classification;
- cursor compatibility and conservative invalidation rules;
- reconnect, cancellation, stop, shutdown, and fallback races;
- backend-specific routing hints in generic watcher consumers;
- custom expression translation plus duplicate local filtering;
- telemetry needed to explain fallback and retirement;
- rebases across the evolving config and skill source ownership work;
- an opt-in configuration surface that remains unproven as a default.

The next steps proposed by `rec0` are not small finishing details. Admission
gating, typed failure scope, collateral retry, event filtering, and
instrumentation are required to make the existing architecture reliably reach
its nominal state. Completing them may be worthwhile as an experiment, but
completion would only remove self-inflicted regressions. It would still not
establish superiority over the cheaper architecture.

## Falsification and acceptance gate

The decision should be made by a controlled three-way experiment:

| Candidate | Contents |
| --- | --- |
| Generic baseline | Parcel/inotify plus source reconciliation, relevance filtering, config root consolidation, and independently justified retention |
| Cheap daemon path | The same generic fixes plus Parcel's built-in/default Watchman backend |
| Custom backend | The same generic fixes plus the first-party Watchman transport |

Use a private Watchman daemon and socket for each run so roots, cookies, daemon
state, and cold starts are isolated. Exercise the same representative Location
corpus in the current one-service topology. Include cold activation, warm
activation, a fixed sequence of relevant and irrelevant skill changes, source
addition/removal, repeated invalidation, and daemon restart.

Record system-wide OpenCode plus daemon CPU/RSS, recursive crawl and root setup,
kernel watch counts, physical subscriptions, fallback and generation retirement,
skill rescan count, settle-to-delivery latency, Location/skill readiness, and
missed or duplicate invalidations.

The custom backend earns acceptance only if all of these hold:

1. No cold-start generation retirement or Parcel fallback in the representative
   corpus.
2. No missed or duplicate relevant invalidation through daemon restart.
3. At least a 2x reduction in recursive crawl/watch setup, or at least 20% lower
   system CPU under the fixed workload, compared with the generic Parcel
   baseline.
4. A clear material advantage over Parcel's built-in Watchman path.
5. No more than a 5% regression in p95 Location and skill readiness.
6. Irrelevant subtree and synchronization-cookie changes cause zero skill
   rescans in all three candidates.

Set the thresholds before collecting results. If the custom backend does not
pass, remove it rather than starting another resilience wave. If it passes,
the measurements provide the missing justification for the maintenance cost.

## Bottom line

Watchman is technically capable and the branch contains thoughtful recovery
work. That is not the disputed point. The custom backend has not demonstrated
that it solves a current measured OpenCode bottleneck better than generic source
ownership, reconciliation, filtering, retention, or Parcel's existing support.

The first independent live smoke instead reproduced the backend's severe FIFO
failure on cold activation and produced a complete fallback cohort. `rec0` is
right about how to harden that cohort; it is wrong to infer from the existence
of a repair plan that the backend should remain accepted.

Archive the implementation, land the generic survivor architecture, and require
the falsification experiment before restoring the custom transport to the
working patch stack.

## Cross-references

- [`rec0.gpt56s.md`](/.design/watchman/rec0.gpt56s.md) is the retained-backend
  recommendation this reassessment disputes. Its FIFO and failure-scope analysis
  remains useful if the custom backend returns to experimentation.
- [`README.md`](/.design/watchman/README.md) records the exact feature stack,
  configuration, rebases, focused test results, and the still-missing committed
  live-daemon and diagnostic coverage.
- [`draft0.ds4p.md`](/.design/watchman/draft0.ds4p.md) contains the original
  motivation and the important observation that steady-state per-process watch
  counts were small.
- [`../watch/draft1.gpt56t.md`](/.design/watch/draft1.gpt56t.md) defines the
  retained architecture and its unfulfilled measurement and acceptance gates.
- [`timeout0.gpt56s.md`](/.design/watchman/timeout0.gpt56s.md) provides the
  detailed command-FIFO and attribution analysis; this reassessment differs by
  asking whether that complexity should be retained at all.
- `config-source-watches@origin` commit `a1dc8662732e` is upstream prior art for
  reconciled, ignored, domain-filtered source-root watches.
- `skill-source-observer@origin` commit `9e3f6e7da50f` provides the domain seam
  where stable reconciliation and relevant-path filtering can replace churn.
