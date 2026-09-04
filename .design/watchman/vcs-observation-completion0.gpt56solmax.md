---
type: Specification
title: Core VCS observation completion audit and correction
description: Candid audit of ed74a4d1, with normative corrections for candidate-plan recovery, observation-health quorum, and secondary colocated Git topology.
resource: /.design/watchman/vcs-observation-completion0.gpt56solmax.md
tags: [opencode, watchman, vcs, audit, completion, git, jujutsu]
status: draft
generated: { by: model:openai/gpt-5.6-sol-max, at: 2026-09-04 }
verified: { by: model:openai/gpt-5.6-sol-max, at: 2026-09-04 }
stale_after: 2026-10-04
sources:
  - id: original-spec
    resource: /.design/watchman/vcs-observation-spec0.gpt56solmax.md
    title: Topology-correct VCS observation
    author: model:openai/gpt-5.6-sol-max
    last_modified: 2026-09-04
    revision: ed74a4d17778b3ba2edebc84382046587a841926
    sha256: cf2f0b5676381fe7d7505c018ac62b74847510c91a80ef40b0b05b4a6e70a4ce
  - id: live-ticket
    resource: file:///home/rektide/src/opencode-watchman/.beads/issues.jsonl
    title: opwatch-vcs-signals-core-observation live Beads record
    author: human:rektide
    last_modified: 2026-09-04
  - id: atomic-review
    resource: /.design/watchman/carrier1-review0.gpt56sol.md
    title: Atomic VCS observation and continuity corrections
    author: model:openai/gpt-5.6-sol
    last_modified: 2026-09-03
  - id: jj-source
    resource: file:///home/rektide/src/opencode-jj-vcs/packages/core/src/project.ts
    title: Filesystem-only jj repository resolution
    author: anomalyco/opencode contributors and local jj-vcs authors
    last_modified: 2026-09-04
---

# Core VCS observation completion audit and correction

## Verdict

The document at `ed74a4d1` contains substantial source-backed work and covers
every topic requested by the ticket. It is not implementation-ready by itself.
Its statement that no implementation-blocking design decision remains
([`spec0:1021-1026`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L1021-L1026))
is overconfident for three reasons:

1. Its provider returns metadata and interests only after both succeed. A newly
   resolved target is therefore not observed when its metadata read fails, so
   an unchanged pointer plus later metadata recovery can remain invisible.
2. Its health text marks aggregate observation ready on the first interest
   acknowledgement and only optionally exposes health through `Vcs.Interface`.
   That neither defines a multi-interest readiness quorum nor satisfies the
   ticket's degraded-health acceptance strongly enough.
3. Its colocated-jj resolver verifies Git from `repo.workspace`. A real
   secondary colocated workspace has no `.git`; discovery must start from the
   resolved canonical main workspace.

This document is a normative addendum. Read it with `ed74a4d1`. It supersedes
the affected decision summaries at lines 64-65 and 78-80, provider result at
lines 169-216, optional health exposure at lines 218-240, colocated discovery at
lines 417-449, refresh sequence at lines 498-531, failure reconciliation at
lines 547-580, and first-ready rule at lines 593-605. All other scope, target,
event, test, and composition decisions remain in force.

With the corrections below, the combined specification is implementation-ready
as a design. The ticket itself remains open because composition, TypeScript,
deterministic tests, and production-path empirical gates have not been done.

## Contribution map

### Decisions actually closed in `ed74a4d1`

| Lines | Contribution | Evidence used | Audit disposition |
| --- | --- | --- | --- |
| [`126-138`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L126-L138) | Resolved linked-worktree store ambiguity, exact placement, lifecycle-as-control, full event choice, jj read discipline, and Git default-branch claim limit. | Current `vcs.ts`, `Git.Repository`, watcher backend/route, jj-vcs source, client reducer. | Sound; retained. |
| [`169-216`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L169-L216) | Chose a provider-owned, backend-neutral optional observation API rather than hardcoded Core paths. | Carrier provider-plan direction and plugin Effect/Promise seams. | Ownership decision sound; return shape corrected below. |
| [`256-351`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L256-L351) | Defined B2 owner signals, explicit placement, retained terminal suppression, Node entry semantics, and lexical/resolved sentinel chains. | `WatchInterests`, `Watcher` RcMap/Node path, continuity review, `files-too0`. | Sound, subject to candidate-plan union below. |
| [`353-496`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L353-L496) | Turned the target list into concrete Git/Hg/jj plans, including `commondir`, missing-tree parents, secondary pointers, and conditional colocated composition. | Git/project source, jj-vcs filesystem resolver, op-head probes. | Mostly sound; secondary colocated discovery corrected below. |
| [`547-633`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L547-L633) | Defined acquire-before-release ownership, last-good failure behavior, B2 lifecycle handling, sibling isolation, and unbounded invalidation-safe delivery. | Direction and carrier-review corrections. | Ownership/lifecycle sound; candidate-failure retention and health aggregation corrected below. |
| [`635-685`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L635-L685), [`1165-1193`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L1165-L1193) | Selected full `vcs.updated`, retained branch-only compatibility, and closed reentrant ordering with one refresh worker and one publication worker. | Schema event, composed Bus ordering safeguard, current client reducer. | Sound and implementation-specific. |
| [`1108-1139`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L1108-L1139) | Found that tolerant Git/Hg/jj command wrappers cannot support last-good observation and required strict metadata outcomes. | Actual provider command wrappers and jj `info()`. | Sound; incorporated into prepared read below. |
| [`737-929`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L737-L929) | Specified deterministic fake tests, exact files, six small commits, and package-local verification. | Existing test seams and repository package rules. | Sound after adding completion cases below. |
| [`931-980`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L931-L980) | Chose whole-line jj-vcs composition before implementation and current-line proof before carrier reconstruction. | DAG/delta inspection, alignment, direction, refreshed jj-vcs report. | Sound; still an unexecuted prerequisite. |

### Requirements restated rather than originated

| Lines | Requirement carried forward | Source authority |
| --- | --- | --- |
| [`46-125`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L46-L125) | Ticket situation, exact-interest lane, scope split from consumers/daemon/Compfuzor/activation. | Live Beads ticket and accepted alignment. |
| [`353-496`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L353-L496) | Core target set: worktree Git HEAD, common refs/packed refs, Hg branch, main-repository operation heads, colocated Git. | `watches.glm53.md`, carrier C5, alignment. |
| [`688-735`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L688-L735) | Need for isolated exact-root create/delete proof and its limits. | Carrier review EG1 and ticket acceptance. The executed result was new; the requirement was not. |
| [`982-1019`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L982-L1019) | Acceptance rows and exclusions from product/deployment completion. | Live ticket and child-ticket split. |

The main original contributions were interface and lifecycle decisions, strict
read analysis, event ordering, implementation slicing, and one exact-root
empirical probe. This audit adds the secondary-colocation probe and reproduces
the exact-root result. The target names and high-level separation were inherited
requirements.

## Ticket coverage review

| Requested coverage | `ed74a4d1` location | Assessment after audit |
| --- | --- | --- |
| Deep module and small interface | [`218-254`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L218-L254) | Present; health exposure changed from MAY to MUST below. |
| Provider-owned atomic plan | [`169-216`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L169-L216) | Present but result shape blocks failed-read recovery; replaced below. |
| Node files versus forced-exact directories | [`305-351`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L305-L351) | Complete and source-consistent. |
| Linked Git/common directory | [`353-396`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L353-L396) | Complete, including `commondir`. |
| Hg | [`398-415`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L398-L415) | Complete. |
| Secondary and colocated jj | [`417-496`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L417-L496) | Main-repository target is correct; secondary colocated Git origin is corrected below. |
| Missing targets and sentinels | [`305-351`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L305-L351), [`547-580`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L547-L580) | Existing/missing exact leaves covered; initial/candidate read failure recovery needed the prepared-plan correction. |
| Acquire new before release old | [`289-303`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L289-L303), [`553-571`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L553-L571) | Logical-demand interpretation and successful replacement ordering are retained; failed candidates now retain their own recovery demand. |
| All invalidation classes and debounce | [`498-540`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L498-L540), [`593-633`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L593-L633) | Covered; readiness aggregation was underspecified. |
| Last good and degraded health | [`547-591`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L547-L591), [`1108-1139`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L1108-L1139) | Strict source failure is strong; mandatory health/quorum correction needed. |
| Full metadata/refetch and BranchUpdated | [`635-685`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L635-L685), [`1165-1193`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L1165-L1193) | Closed to full metadata with safe compatibility ordering. |
| Feedback-loop avoidance | [`484-496`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L484-L496) | Correctly requires metadata flags and isolates status/diff snapshots. |
| Deterministic and isolated tests | [`688-831`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L688-L831) | Test contract complete; tests do not exist yet. Raw-daemon evidence reproduced below. |
| Composition, files, commits, scope split | [`836-980`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L836-L980) | Complete as a plan; composition remains unexecuted. |

## Blocker and gap taxonomy

### Design blockers found in the committed specification

| Gap | Consequence | Disposition |
| --- | --- | --- |
| Combined metadata/plan success at spec0 lines 187-211 | Retarget A to B, fail B metadata once, retain only A watches, and receive no event when B later becomes readable without another pointer write. Initial failure can retain an empty plan. | Closed by prepared-plan and one pending-candidate union below. |
| First acknowledgement marks aggregate ready at spec0 line 600 | One of many Git/jj interests can be live while another is acquiring, unknown, or terminal; the health value lies. | Closed by per-key epochs and all-materialized-interest quorum below. |
| `Vcs.Interface` only MAY expose health at spec0 line 238 | The acceptance test has no mandatory observation point for degraded health. | Closed by requiring a Core-internal `health()` method. |
| `Git.repo.discover(workspace)` at spec0 lines 445-447 | Secondary colocated workspaces have no `.git`, so applicable raw Git targets are silently omitted. | Closed by canonical-main discovery and target agreement below. |

### Carrier and composition prerequisites

- `82079ec5` is still a Watchman-only line and `5b072651` is still the separate
  refreshed jj-vcs line. No composed implementation workspace or green
  cross-line baseline was produced here.
- The spec's two-path intersection result compares only Watchman
  `43d09b9d..82079ec5` with jj-vcs `7ba5f3e5..5b072651`. It does not replace the
  separate nine-current-intersection Watchman/upstream carrier audit
  ([`tools0:171-218`](/.design/watchman/tools0.gpt56s.md#L171-L218)).
- The future clean carrier remains downstream of current-line implementation,
  `core-consumers`, and activation. It is not a blocker to writing current-line
  code but is a blocker to claiming final carrier completion.

### Empirical validation gaps

- The raw Watchwoman exact-root create/delete result now has a second run and a
  durable summary below, but it still bypasses OpenCode `loadFactory`, routing,
  registry sharing, lifecycle callbacks, and VCS reread.
- No isolated production-path Core test exists. The ticket's "tests pass"
  criterion therefore remains unmet.
- No deterministic placement, sentinel, candidate-plan, health-quorum,
  debounce, strict-read, event-order, or shared-root test has run because the
  implementation does not exist.
- No real cross-workspace operation has caused two live Core locations to
  reread and publish. The topology premise is proven; the product behavior is
  not.
- No deployed policy, negative-churn window, reconnect sequence, or final
  activation artifact was tested. Those belong to later tickets but constrain
  epic completion.

### Implementation work still open

- Compose the two source lines and establish a green baseline.
- Implement the watcher lifecycle/owner-set substrate.
- Implement Effect and Promise provider contracts and adapters.
- Extract jj topology and implement Git/Hg/jj prepared plans.
- Implement strict provider reads, candidate-plan ownership, health quorum,
  debounce, cache, and publication.
- Add schema/generated event surfaces and every deterministic/live test named
  in the original six-commit ladder.
- Complete `core-consumers` separately after this ticket.

### Transient execution failures

These delayed the artifact but are not current product blockers:

- Four requested background review launches failed with `Subagent depth limit
  reached (1)`: three during the original document and one during this final
  audit. No independent subagent review was available.
- Multiple large `patch` calls were interrupted by `ECONNRESET` or server
  restart. Later writes were deliberately appended in bounded patches; SHA-256
  confirms the reviewed file is exactly the committed `ed74a4d1` artifact.
- Initial document checks had three command mistakes: `jq` precedence applied
  `length` to a Boolean, a stale hard-coded fence count expected 16 instead of
  24, and a coverage grep searched the wrong ready phrase. Corrected commands
  passed before commit.
- This audit's first isolated-daemon rerun used a Unix socket pathname under the
  deep scratch directory and failed before startup because the path was too
  long. The short approved `/home/rektide/tmp-opencode/cvc-*` socket passed.

## Normative correction 1: prepare plan before metadata read

Replace `VcsObservationSnapshot { info, interests }` with a prepared observation
whose strict read closes over the same resolved topology:

```ts
export interface VcsPreparedObservation {
  readonly interests: readonly VcsObservationInterest[]
  readonly read: () => Effect.Effect<Vcs.Info, unknown>
}

export interface VcsDefinition {
  readonly observe?: (
    input: VcsScope,
  ) => Effect.Effect<VcsPreparedObservation, unknown>
}
```

The Promise mirror returns `read(context): Promise<Vcs.Info>` so interruption
of the later strict read gets its own live `AbortSignal`. The Promise adapter
converts both the outer preparation and inner read; it MUST preserve receiver
for both calls.

Preparation resolves topology once, returns its complete currently knowable
sentinel/metadata plan, and builds `read` against that resolved scope. Ordinary
missing/dangling topology is not an outer fatal shortcut. Built-ins return at
least lexical bootstrap sentinels and a `read` that fails strictly when metadata
cannot yet be established:

| Provider | Minimum bootstrap plan from immutable location scope |
| --- | --- |
| Git | `<scope.worktree>/.git` entry |
| Hg | `<scope.worktree>/.hg` entry |
| jj | `<scope.worktree>/.jj` and `<scope.worktree>/.jj/repo` entry chain |

Unexpected defects and interruption may still fail preparation. A normal
absent marker, dangling pointer, missing exact leaf, or temporarily unreadable
metadata must leave enough lexical demand to observe repair.

If preparation itself fails, Core retains both the committed plan and any
existing pending candidate, publishes nothing, and marks source degraded. At
startup, an unexpected preparation failure has no recoverable plan and leaves
observation degraded until an explicit/provider-change refresh succeeds. This
exception must not absorb the ordinary built-in missing-topology cases above.

Core tracks three states separately:

```text
committed = last plan whose strict read succeeded
candidate = newest prepared plan whose strict read has not succeeded
owned = union(committed, candidate), normalized and deduplicated
```

For candidate B after committed A:

1. Prepare B and validate all interests.
2. Reconcile ownership to `A union B`, acquiring B additions before dropping an
   older pending candidate.
3. Run B's strict `read`.
4. On success, commit B metadata/plan, clear candidate, reconcile to B, release
   A-only interests, and publish.
5. On failure, retain A metadata and committed plan, retain B as the sole
   pending candidate, publish no VCS event, and mark source degraded.
6. Any A or B exact/lifecycle signal prepares again. Candidate C replaces
   pending B only after C additions are owned; committed A remains until a
   strict read succeeds or the provider is deselected.

At startup there may be no A. A failed strict read still leaves the bootstrap
or resolved candidate plan owned, making later repair observable. Keeping at
most one pending candidate bounds leases while preserving recovery.

This correction preserves the accepted atomicity: topology and read closure are
one provider result, no plan is promoted as authoritative before its read, and
the old committed plan survives failure. It additionally prevents the
read-failure blind spot left by `ed74a4d1`.

## Normative correction 2: per-interest health quorum

`Vcs.Interface` MUST expose the effectful Core method below. It remains absent
from Schema, HTTP, SDK, and public events in this ticket. This is the mandatory
deterministic observation point for the ticket's degraded-health criterion, not
an optional diagnostic convenience.

```ts
readonly health: () => Effect.Effect<VcsObservation.Health>
```

Track every normalized physical key in the current owned union with a demand
epoch and phase:

```ts
type InterestHealth =
  | { readonly phase: "acquiring"; readonly epoch: number }
  | { readonly phase: "ready"; readonly epoch: number }
  | { readonly phase: "unknown"; readonly epoch: number; readonly reason: string }
  | { readonly phase: "terminal"; readonly epoch: number; readonly cause: unknown }

export type Health = {
  readonly observation: "idle" | "starting" | "ready" | "degraded"
  readonly source: "empty" | "fresh" | "stale" | "degraded"
  readonly desired: number
  readonly ready: number
  readonly failed: number
}
```

Aggregate observation health is derived, never assigned from one callback:

| Condition | Aggregate observation |
| --- | --- |
| No selected observed provider, or provider intentionally returns no logical interests | `idle` |
| At least one materialized desired key is acquiring, none unknown/terminal | `starting` |
| Every materialized desired key is ready in its current demand epoch, and every nonmaterialized logical interest has a ready sentinel chain | `ready` |
| Preparation failed with no usable plan, any desired key is unknown/terminal, or a logical interest has no acquirable sentinel path | `degraded` |

A `ready` signal updates only its attributed key and epoch. It cannot clear a
different failed key. A continuity signal changes that key to `unknown`; only a
new ready fact for the same retained key/epoch or a replacement epoch clears
it. Terminal stays terminal until a documented suppression-clearing event
replaces the demand.

Keys shared across plan refreshes retain their epoch and phase. An epoch changes
only when physical demand is newly acquired after having been absent, including
a suppression-clearing reacquisition; merely deriving a new logical snapshot
must not turn an already-ready shared key back into `acquiring`. `desired` and
`ready` count materialized keys; `failed` counts `unknown` plus `terminal` keys.

Source health remains independent:

- enqueueing an exact/lifecycle invalidation makes source `stale`;
- strict read success makes source `fresh`;
- strict read failure makes source `degraded` without changing last-good data;
- no successful snapshot makes source `empty` until a failed attempted read,
  after which it is `degraded`.

Plan replacement recomputes counts over `owned = committed union candidate`.
An absent exact directory does not count as failed when its full lexical entry
sentinel chain is ready. This gives tests an exact answer for multi-interest
Git and colocated-jj plans and corrects spec0's first-ack overstatement.

## Normative correction 3: secondary colocated Git origin

In a secondary jj workspace, distinguish:

```text
repo.workspace  = the active secondary workspace
repo.canonical  = the resolved main workspace
repo.repository = <main>/.jj/repo
repo.gitTarget  = the resolved store/git_target, normally <main>/.git
```

When `gitTarget` exists, call `Git.repo.discover(repo.canonical)`, not
`Git.repo.discover(repo.workspace)`. Resolve paths physically and require the
discovered Git topology to agree with `gitTarget` before composing Git targets.
For the ordinary colocated layout, `gitTarget` equals the discovered
`gitDirectory` and `commonDirectory`.

If `gitTarget` exists but canonical Git discovery fails or disagrees, retain the
lexical `git_target` entry, the computed target's entry/sentinel chain, and the
canonical `.git` sentinel; make the prepared strict read fail and preserve any
committed plan. Compare physical paths when both targets exist, while retaining
the normalized lexical target when either is absent so creation remains
observable. Do not silently downgrade a selected colocated-jj observer to
op-head-only coverage. The legacy `repository/store/git` directory remains
non-colocated and does not take this path.

The composed project source already derives canonical from the resolved
repository at
[`project.ts:301-329`](file:///home/rektide/src/opencode-jj-vcs/packages/core/src/project.ts#L301-L329).
`Git.Repository` then supplies the worktree-local/common split at
[`git.ts:176-188`](/packages/core/src/git.ts#L176-L188).

## New empirical evidence

### Real secondary colocated layout

Executed in ignored scratch storage with jj
`0.40.0-cc1aa776f6f0eb1f78da33f690fd5ef869ba3e79` and Git 2.53.0:

```sh
jj git init --colocate <main>
cd <main>
jj commit -m base
jj workspace add --name secondary <secondary>
```

Observed:

```text
secondary_marker_git=absent
repo_pointer=../../main/.jj/repo
resolved_repository=<probe>/main/.jj/repo
git_target=../../../.git
resolved_git_directory=<probe>/main/.git
git_from_secondary_status=128
git_from_secondary_error=fatal: not a git repository (or any of the parent directories): .git
git_from_main=<probe>/main/.git, <probe>/main/.git, <probe>/main
git_explicit=<probe>/main/.git, <probe>/main/.git, <probe>/main
```

This falsifies spec0's `Git.repo.discover(workspace)` rule for a secondary and
supports canonical-main discovery. Existing fabricated jj-vcs tests establish
the same pointer/canonical relationship but did not exercise Git discovery from
the secondary
([`project.test.ts:481-509`](file:///home/rektide/src/opencode-jj-vcs/packages/core/test/project.test.ts#L481-L509)).

### Isolated exact roots reproduced

The raw-daemon probe was rerun against `/usr/local/bin/watchwoman` 0.7.0,
protocol version `2026.03.30.00`, on an isolated short socket under
`/home/rektide/tmp-opencode/cvc-*`. For each root the client issued `watch`,
`clock`, and `subscribe`, then created and deleted `signal`:

```text
watch-list roots:
  repo/.git/refs/heads
  repo/.jj/repo/op_heads/heads

repo/.git/refs/heads:
  create=[{"name":"signal","exists":true,"new":false,"type":"f"}]
  delete=[{"name":"signal","exists":false,"new":false,"type":"f"}]

repo/.jj/repo/op_heads/heads:
  create=[{"name":"signal","exists":true,"new":false,"type":"f"}]
  delete=[{"name":"signal","exists":false,"new":false,"type":"f"}]
```

The daemon was shut down and the temporary tree removed. The first rerun used
a socket under the deep scratch path and failed before startup because the Unix
socket pathname was too long; using the approved short temporary path removed
that environment-only blocker.

This evidence supports only raw exact-root create/delete delivery. It does not
convert the missing production `loadFactory`/registry/VCS test into a pass.

## Required test amendments

Add these cases to the original deterministic test contract:

- Prepare candidate B, make B's strict read fail, keep A plus B leases, emit a B
  event, then succeed and prove B promotion plus A release.
- Fail the first strict read with no committed plan, repair the bootstrap target,
  emit its sentinel event, and prove first successful publication.
- Replace failed candidate B with C and prove C additions precede B-only release
  while committed A remains.
- Fail preparation after A plus pending B and prove both plans remain owned;
  fail it at startup and prove degraded/no-plan state recovers on explicit
  refresh.
- Acknowledge only one of several keys and assert aggregate `starting`, not
  `ready`; fail a sibling and assert `degraded`; recover its epoch and assert
  `ready` only after the complete quorum. A shared ready key must keep its epoch
  across a successful logical-plan refresh.
- Keep an absent exact directory logical interest healthy through its ready
  parent sentinel; make the sentinel parent itself unavailable and assert
  degraded health.
- Build a real/fabricated secondary colocated layout and prove Git discovery is
  invoked at canonical main, never secondary; require Git target agreement.
- Exercise Promise prepared `read` with a distinct abort signal and receiver
  preservation from outer `observe`.

These tests fit commits 2, 3, and 5 of the original ladder. No seventh
implementation phase or new public module is required.

## Defensible completion state

After applying this addendum, the design has no known implementation-blocking
decision gap. "Implementation-ready" means an engineer can create the composed
workspace and implement and test the declared commits without choosing a
missing state transition or topology rule. It does not mean the Beads ticket is
done.

| Layer | State now | What removes the blocker |
| --- | --- | --- |
| Design | Ready only as `ed74a4d1` plus this addendum. | Treat the three normative corrections as part of the implementation contract. |
| Composition | Blocked/unexecuted. | Provide a dedicated writeable workspace containing jj-vcs `5b072651` as semantic base plus the accepted Watchman line through `82079ec5`; rerun overlap and baseline tests if tips moved. |
| Core implementation | Not started. | Execute the six small commits with the amended provider/read and health tests. |
| Raw exact-root evidence | Passed twice; second result recorded here. | No action for the narrow daemon premise. |
| Production-path exact-root test | Missing. | Run the specified opt-in test through OpenCode `loadFactory`, route, registry, and watcher callbacks on an isolated short socket. |
| Cross-workspace Core behavior | Missing. | After implementation, run two live Location observers against one resolved jj repository and mutate the peer workspace. |
| Product/deployment | Deliberately separate. | Complete `core-consumers` and activation/Compfuzor tickets. |

The smallest next code-producing action is not another probe. It is composition
followed by commit 1, the owner lifecycle substrate, because provider code
cannot test exact placement or health until that seam exists. This audit does
not execute it because the user prohibited broad TypeScript work and changes to
other workspaces/bookmarks.

If the parent wants implementation to begin, the needed input is a dedicated
jj workspace whose checked-out parent is the reviewed composition of
`5b072651df01` and `82079ec56be1`, plus permission to create the six TypeScript
commits there. If no composition exists, the parent must first authorize a
non-destructive duplicate/rebase or merge construction; this audit intentionally
does not choose or mutate repository history on its behalf.

## Cross-references

- [`vcs-observation-spec0.gpt56solmax.md`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md)
  remains the main specification. This addendum narrows the cited seams rather
  than duplicating its target matrix, event contract, and implementation ladder.
- [`carrier1-review0.gpt56sol.md` atomic resolution](/.design/watchman/carrier1-review0.gpt56sol.md#L879-L909)
  separates resolved scope/targets from the later metadata read. The prepared
  closure restores that distinction while preserving provider ownership.
- [`direction0.gpt56solmax.md` owner plans](/.design/watchman/direction0.gpt56solmax.md#L143-L224)
  supplies retained demand, acquire-before-release, terminal suppression, and
  sole retry ownership. Candidate ownership extends those rules; it does not
  add an owner retry loop.
- [`files-too0.glm53.md`](/.design/watchman/files-too0.glm53.md#L182-L205)
  explains why absent entry sentinels can remain Node-owned and why ready/failure
  are per physical key rather than aggregate guesses.
- [`opwatch-vcs-signals-alignment0.gpt56solmax.md`](/.design/watchman/opwatch-vcs-signals-alignment0.gpt56solmax.md)
  remains scope authority for exact Core independence, late daemon join, and
  separate consumer/activation work.
- [`watches.glm53.md`](/.design/watchman/watches.glm53.md#L64-L111)
  remains behavioral evidence for operation heads and side-effect-free metadata
  reads. Neither this audit nor spec0 changes its target claims.
- [jj-vcs `project.ts`](file:///home/rektide/src/opencode-jj-vcs/packages/core/src/project.ts#L301-L345)
  and [secondary topology tests](file:///home/rektide/src/opencode-jj-vcs/packages/core/test/project.test.ts#L481-L509)
  are prior source evidence for resolved main-repository/canonical identity; the
  new real probe adds the missing Git-discovery consequence.
- [`tools0.gpt56s.md`](/.design/watchman/tools0.gpt56s.md#L171-L218)
  prevents the narrow jj-vcs intersection result from being misreported as the
  broader current-upstream carrier collision audit.

## Completion conclusion

`ed74a4d1` made real progress: it converted a target list into a provider-owned
module contract, sentinel and lifecycle model, strict-read policy, full event,
test matrix, and composition ladder. Interrupted writes harmed reviewability
and let three seams escape final challenge. The committed statement of zero
design blockers was therefore not defensible.

This addendum closes those seams with a prepared candidate plan, mandatory
quorum health, and canonical-main colocated Git discovery, each backed by
source or a fresh probe. No broader architecture was invented. The remaining
blockers are composition, implementation, tests, and later product/deployment
work, not an unresolved Core VCS observation decision.
