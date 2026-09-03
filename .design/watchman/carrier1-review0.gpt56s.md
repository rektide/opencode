---
type: Review
title: Final review of the remade Watchman architecture
description: Bounded review of carrier1 lifecycle consistency, invalidation and retry ownership, replay clocks, VCS observation, and documentation navigation.
resource: /.design/watchman/carrier1-review0.gpt56s.md
tags: [opencode, watchman, review, lifecycle, invalidation, vcs]
status: stable
generated: { by: model:gpt-5.6-sol, at: 2026-09-03 }
verified: { by: model:gpt-5.6-sol, at: 2026-09-03 }
stale_after: 2026-10-03
sources:
  - id: reviewed-carrier
    resource: /.design/watchman/carrier1.gpt56s.md
    title: Watchman remade as continuity-aware filesystem observation
    author: model:gpt-5.6-sol
    last_modified: 2026-09-03
  - id: current-vcs-owner
    resource: /packages/core/src/vcs.ts
    title: Current Core VCS state owner
    author: anomalyco/opencode contributors
  - id: current-project-resolution
    resource: /packages/core/src/project.ts
    title: Current project and VCS store resolution
    author: anomalyco/opencode contributors
  - id: current-git-resolution
    resource: /packages/core/src/git.ts
    title: Current Git worktree and common-directory resolution
    author: anomalyco/opencode contributors
  - id: current-vcs-client
    resource: /packages/client/src/solid/data.ts
    title: Current client VCS event reducer
    author: anomalyco/opencode contributors
  - id: watchwoman-filter-source
    resource: file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/daemon/watcher.rs
    title: Current Watchwoman crawl and event filtering implementation
    author: radiosilence/watchwoman contributors
  - id: historical-maintenance
    resource: /.design/watchman/README.md
    title: Root-scoped Watchman maintenance log
    author: model:gpt-5.6-terra
    last_modified: 2026-09-01
---

# Final review of the remade Watchman architecture

## Scope

This is one bounded final review of
[`carrier1.gpt56s.md`](/.design/watchman/carrier1.gpt56s.md). It checks only
internal lifecycle consistency, initial/logical/physical invalidation ownership,
retry ownership, root replay clocks, VCS exact-root and linked-worktree claims,
VCS event semantics, and reciprocal documentation navigation. Existing source
was consulted only where a carrier claim needed verification.

The review does not repeat concerns already resolved in the current carrier.
In particular, carrier1 now clearly separates initial physical invalidation,
active-entry logical attachment invalidation, and retained-physical-watch replay
invalidation; keeps Watchman retry in the root supervisor and Node/Parcel retry
in the generic Watcher; corrects Git HEAD to the worktree-specific Git directory;
and rejects `BranchUpdated` as a complete metadata event.

## Current substantive findings

### 1. Established continuity loss has no owner-visible invalidation

The system promise says acquisition and continuity transitions emit explicit
invalidation
([`carrier1:297-308`](/.design/watchman/carrier1.gpt56s.md#L297-L308)), and the
completion picture says owners are told when continuity is lost
([`carrier1:1140-1148`](/.design/watchman/carrier1.gpt56s.md#L1140-L1148)). The
delivery matrix, however, includes only successful Watchman replay and generic
Node/Parcel reacquisition invalidations; it has no row for the moment an
established Watchman generation or Node/Parcel physical watch is lost
([`carrier1:754-767`](/.design/watchman/carrier1.gpt56s.md#L754-L767)). The
failure table likewise proceeds directly from runtime loss to retry
([`carrier1:804-815`](/.design/watchman/carrier1.gpt56s.md#L804-L815)).

**Direct edit:** Add two established-runtime-loss rows to the delivery matrix.
The Watchman root supervisor emits immediate invalidation for every live
registration when its generation loses continuity; the generic Watcher emits
immediate invalidation when an established Node/Parcel physical watch loses
continuity. Keep the successful reacquisition invalidation as a second,
independent cause. This preserves convergence for writes made later in the
outage while making the loss itself honest and keeps retry ownership unchanged.

### 2. Logical attachment and physical acknowledgement need a linearization rule

Carrier1 assigns active-entry attachment invalidation to Watcher
([`carrier1:497-501`](/.design/watchman/carrier1.gpt56s.md#L497-L501)) and assigns
first physical acknowledgement fan-out to the same layer
([`carrier1:737-744`](/.design/watchman/carrier1.gpt56s.md#L737-L744)). It does
not classify a logical subscriber that attaches concurrently with the physical
entry becoming active. Without one serialized boundary, that subscriber can be
missed by the acknowledgement snapshot while also being treated as attached to
the pre-active entry, or receive both causes accidentally. The idempotence rule
does not make a missing invalidation safe
([`carrier1:508-520`](/.design/watchman/carrier1.gpt56s.md#L508-L520)).

**Direct edit:** State that Watcher serializes logical attachment with the
physical active/reacquired transition. A racing subscriber is classified
exactly once: it is either in the acknowledgement fan-out or attaches after the
active transition and receives its own attachment invalidation. Its output must
be installed before classification, and exact dispatch must not overtake that
invalidation. Extend the shared-attachment proof obligation at
[`carrier1:1037-1039`](/.design/watchman/carrier1.gpt56s.md#L1037-L1039) with a
barrier at this race.

### 3. Targeted cancellation recovery has no fresh-clock rule

The replay algorithm gives one clock to the replacement-generation cohort and
a separate fresh clock to a registration arriving outside that snapshot
([`carrier1:713-727`](/.design/watchman/carrier1.gpt56s.md#L713-L727)). A
canceled PDU also starts a new registration epoch through targeted
re-establishment
([`carrier1:761-764`](/.design/watchman/carrier1.gpt56s.md#L761-L764)), but that
path is not assigned a clock. With no retained cursor, cancellation recovery
cannot safely inherit an earlier establishment clock.

**Direct edit:** Replace "A registration outside that snapshot" with "Any
registration established individually on a ready generation, including a new
registration and targeted canceled-subscription recovery." Require that path to
obtain a fresh root clock immediately before its subscribe. Retain one shared
clock only for the fixed replacement-generation replay cohort.

### 4. Backend-terminal Node/Parcel failure has no lifecycle owner

The failure model classifies an unsupported Node/Parcel platform or binding as
backend-terminal
([`carrier1:804-809`](/.design/watchman/carrier1.gpt56s.md#L804-L809)), but the
ownership table gives the generic Watcher only physical Node/Parcel
reacquisition
([`carrier1:349-356`](/.design/watchman/carrier1.gpt56s.md#L349-L356)). The later
terminal-lifetime text locates backend-terminal construction above root state
without saying where a lazily discovered Node/Parcel backend condition lives or
how it reaches sibling physical entries
([`carrier1:825-830`](/.design/watchman/carrier1.gpt56s.md#L825-L830)).

**Direct edit:** Require structural adapter incompatibility to fail once during
selected-adapter construction or composition. If an error is discovered only
for one target during acquisition, classify it as subscription-terminal unless
the generic Watcher has an explicit adapter-level terminal state that fans out
once. Do not let separate physical entries independently rediscover, suppress,
or retry a backend-scoped condition.

### 5. VCS topology convergence lacks declared sentinel interests

The source-owner section requires plans to preserve sentinels for a Git
worktree changing administrative directory and a jj workspace resolving to a
different main repository
([`carrier1:436-446`](/.design/watchman/carrier1.gpt56s.md#L436-L446)). The VCS
target matrix lists only already-resolved leaf targets
([`carrier1:871-880`](/.design/watchman/carrier1.gpt56s.md#L871-L880)), while the
acceptance gate claims coverage for missing metadata directories, deletion,
recreation, and changed store pointers
([`carrier1:1048-1051`](/.design/watchman/carrier1.gpt56s.md#L1048-L1051)). Once
an exact directory target disappears and its unchanged interest is terminally
suppressed, none of the listed targets necessarily observes its recreation or a
pointer retarget.

This matters especially for linked Git worktrees. Current project resolution
stores only the common Git directory in `location.vcs.store`
([`project.ts:325-345`](/packages/core/src/project.ts#L325-L345)), while Git
discovery separately resolves the worktree-local `gitDirectory` and shared
`commonDirectory`
([`git.ts:172-188`](/packages/core/src/git.ts#L172-L188)). Watching the resolved
worktree-local `HEAD` fixes ordinary branch switching, but does not itself
observe replacement of the worktree's `.git` pointer.

**Direct edit:** Add topology interests to the provider-owned target model:
the linked-worktree `.git` pointer or marker, the jj `.jj/repo` pointer chain,
and a stable-parent sentinel strategy for absent or recreated `refs/heads`,
`packed-refs`, and `op_heads/heads`. State that a topology signal reruns
repository resolution first and then atomically reconciles the resolved leaf
plan. If exact-file intent itself guarantees observation while absent, say so
explicitly and retain stable-parent coverage for directory roots.

### 6. Full-metadata publication must not retain the branch-only guard

Carrier1 correctly requires a distinct semantic event carrying complete
`Vcs.Info` or directing clients to invalidate and fetch it
([`carrier1:898-915`](/.design/watchman/carrier1.gpt56s.md#L898-L915)). Current
Core, however, publishes only when `branch.current` changes
([`vcs.ts:119-127`](/packages/core/src/vcs.ts#L119-L127)). Merely adding the new
event beside that guard would still hide conflict, label, workspace, distance,
or default-branch changes when the active branch remains unchanged. The current
client's branch reducer also reconstructs a branch-only `vcs` object rather
than preserving future metadata fields
([`data.ts:1211-1220`](/packages/client/src/solid/data.ts#L1211-L1220)), which
supports carrier1's requirement to change that reducer if compatibility remains.

**Direct edit:** Require every successfully handled, debounced VCS metadata
signal to publish the complete current metadata result or a refetch
invalidation independently of branch equality. `BranchUpdated` may be emitted
additionally, and only when the branch changes. Make this condition explicit in
the VCS section and its construction slice
([`carrier1:1213-1219`](/.design/watchman/carrier1.gpt56s.md#L1213-L1219)).

### 7. The versioned exact-root probe has no reproducible citation

The source-backed mechanism is sound: Watchwoman's crawl pruning evaluates
components relative to the selected root, so `.git` and `.jj` ancestors are not
seen when `refs/heads` or `op_heads/heads` is itself the root
([`watcher.rs:190-214`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/daemon/watcher.rs#L190-L214),
[`watcher.rs:282-294`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/daemon/watcher.rs#L282-L294)).
Carrier1 additionally says a query probe against Watchwoman 0.7.0 confirmed
exact-root indexing
([`carrier1:928-941`](/.design/watchman/carrier1.gpt56s.md#L928-L941)), but no
source entry or link identifies its command, root setup, daemon configuration,
or output. The following acceptance gate is stronger because it requires an
actual subscribe plus create/delete delivery, but it does not make the earlier
completed empirical claim reproducible.

**Direct edit:** Link a retained probe record containing daemon binary and
version, effective filter policy, watched root, commands, and result. If no
record exists, replace "confirmed" with the source-derived expectation and
leave empirical confirmation entirely to the acceptance gate.

## Doc-pass and navigation recommendations

- Add a prominent reciprocal pointer near the top of
  [`README.md`](/.design/watchman/README.md) naming carrier1 as the replacement
  architecture and identifying the README's implementation line as historical.
- Change the README frontmatter and "Current stack" framing from `stable`
  current guidance to an explicit historical or superseded posture. Preserve
  its operational evidence rather than rewriting its historical account.
- If README remains a maintenance record rather than the directory entry point,
  add `/.design/watchman/index.md` with short grouped links for current
  architecture, historical implementation, reviews, incidents, and validation
  evidence.
- Link the exact-root live probe or final verification manifest reciprocally
  from carrier1's exact-root section once that evidence exists.

## Review disposition

Carrier1 has resolved the major architectural disagreements recorded in the
preceding review wave. The remaining findings are bounded protocol and
ownership specifications rather than a challenge to its overall
continuity-aware, strict-selection architecture. Findings 1 through 5 should be
resolved before implementation because they determine observable lifecycle
behavior; finding 6 should be pinned before the VCS stack lands; finding 7 and
the navigation work should be completed with the verification record.
