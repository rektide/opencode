---
type: ImplementationRecord
title: Core VCS observation implementation WIP
description: Source composition and the first Core VCS observation implementation commit, with verification evidence and an ordered continuation roadmap.
resource: /.design/watchman/vcs-observation-implementation0.gpt56solmax.md
tags: [opencode, watchman, vcs, implementation, wip, git, mercurial, jujutsu]
status: draft
generated: { by: model:openai/gpt-5.6-sol-max, at: 2026-09-04 }
verified: { by: model:openai/gpt-5.6-sol-max, at: 2026-09-04 }
stale_after: 2026-10-04
sources:
  - id: specification
    resource: /.design/watchman/vcs-observation-spec0.gpt56solmax.md
    title: Topology-correct VCS observation
    author: model:openai/gpt-5.6-sol-max
    last_modified: 2026-09-04
    revision: ed74a4d17778b3ba2edebc84382046587a841926
  - id: completion-addendum
    resource: /.design/watchman/vcs-observation-completion0.gpt56solmax.md
    title: Core VCS observation completion audit and correction
    author: model:openai/gpt-5.6-sol-max
    last_modified: 2026-09-04
    revision: 46ef938b8290b2fe3c7df02bebbd46c6012d2c37
  - id: jj-vcs-source
    resource: file:///home/rektide/src/opencode-jj-vcs
    title: Refreshed jj-vcs semantic source line
    author: anomalyco/opencode contributors and local jj-vcs authors
    last_modified: 2026-09-04
    revision: 5b072651df01082a61a9539c22b34534d72e8d09
  - id: watchman-source
    resource: file:///home/rektide/src/opencode-watchman
    title: Accepted Watchman source line
    author: anomalyco/opencode contributors and local Watchman authors
    last_modified: 2026-09-04
    revision: 82079ec56be161c5bd6b5ee875c8721ea1e7ef4b
---

# Core VCS observation implementation WIP

## Status

This is an intentional work-in-progress boundary, not a completion claim for
`opwatch-vcs-signals-core-observation`. The dedicated workspace now contains a
clean source composition and the first of the six specified implementation
commits. Commits 2 through 6, aggregate acceptance, consumers, deployment, and
activation remain undone.

| Result             | Exact revision                             | State                                                          |
| ------------------ | ------------------------------------------ | -------------------------------------------------------------- |
| Source composition | `07df76de3ea85bdd3d6a0632a7bd4a002284ed5d` | Committed, conflict-free, and retained by `vcs-core-20260904`. |
| Ladder commit 1    | `dd090d2327c623be5fde2c35080381482d79311f` | Committed and green; `vcs-core` points here.                   |

The implementation contract is the specification at `ed74a4d1` read together
with the completion addendum at `46ef938b`. In particular, later work must not
lose the addendum's prepared candidate plans, mandatory readiness quorum, or
canonical-main discovery for secondary colocated jj workspaces.

## Composition accomplished

The composition commit has exact parents:

- jj-vcs semantic source: `5b072651df01082a61a9539c22b34534d72e8d09`.
- Watchman plus specification source: `46ef938b8290b2fe3c7df02bebbd46c6012d2c37`, containing the accepted Watchman line through `82079ec56be161c5bd6b5ee875c8721ea1e7ef4b` and spec0 at `ed74a4d17778b3ba2edebc84382046587a841926`.

All five declared conflicts were resolved source-first. No conflict remains.

| Conflict                                    | Resolution                                                                                                                                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`                                 | Retained the active refreshed repository guidance from the jj-vcs parent rather than accepting the documentation parent's deletion.                                                                                                        |
| `packages/core/src/config/plugin/skill.ts`  | Preserved Watchman owner-scoped `WatchInterests` and last-good skill snapshots on the newer skill/discovery shape.                                                                                                                         |
| `packages/core/src/config.ts`               | Kept extracted `ConfigDiscovery` and `ConfigWatch` planning while replacing ad hoc watch fibers with owner reconciliation. Acquisition still occurs before a source load can fail, and reconciliation occurs only after the load succeeds. |
| `packages/core/src/filesystem/watcher.ts`   | Combined grouped `entries`, readiness callbacks, path-filtered test delivery, explicit placement, Watchman failure propagation, and scoped native acquisition.                                                                             |
| `packages/core/test/location-layer.test.ts` | Preserved the refreshed location failure suite and the Watchman line's process-global Watcher sharing proof.                                                                                                                               |

Composition also required narrow glue in `config/watch.ts`, watcher
normalization, the Watchman backend, and their tests. Grouped entry interests
remain Node-owned, directory interests can reach Watchman, and Config directory
plans use the shared full ignore policy. These changes are part of the merge
because neither parent could compile or preserve both behaviors without them.
The resulting composition diff is 10 files, 292 insertions, and 611 deletions.

The immutable dated bookmark was created at the composition commit and was not
moved. Only the floating `vcs-core` bookmark advanced to ladder commit 1.

## Code actually implemented

Commit `dd090d23` implements only ladder commit 1,
`refactor(core): expose owned watcher lifecycle`, as specified at
[`spec0:880-885`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L880-L885).
Its diff is 9 files, 332 insertions, and 105 deletions.

- [`watcher/interests.ts`](/packages/core/src/filesystem/watcher/interests.ts#L10-L135)
  now normalizes explicit or automatic placement into owner keys, retains
  desired demand independently from running fibers, broadcasts attributed
  `ready`, `change`, `invalidation`, and `failure` signals, acquires additions
  before releases, and suppresses unchanged terminal demand without ending
  sibling observation.
- [`watcher/internal.ts`](/packages/core/src/filesystem/watcher/internal.ts)
  carries typed continuity reasons and the private invalidation callback.
- [`watcher.ts`](/packages/core/src/filesystem/watcher.ts#L47-L213) includes
  placement in physical keys and forwards one physical invalidation to each
  logical subscriber without manufacturing a file update.
- [`watchman/root.ts`](/packages/core/src/filesystem/watcher/watchman/root.ts#L197-L260)
  reports incompatible replacement clocks and rejected-cursor retries through
  lifecycle control. Its cancellation and fresh-instance paths do the same at
  [`root.ts:372-395`](/packages/core/src/filesystem/watcher/watchman/root.ts#L372-L395).
- [`watcher-interests.test.ts`](/packages/core/test/filesystem/watcher-interests.test.ts#L10-L199)
  proves normalized lease sharing, acquire-before-release, candidate additions
  retained across failed reads, explicit-exact versus automatic-project keys,
  broadcast delivery, invalidation-before-failure, sibling survival, terminal
  suppression, and reacquisition only after a changed intent.
- [`watchman-root.test.ts`](/packages/core/test/filesystem/watchman-root.test.ts#L150-L270)
  proves compatible cursor resume, rejected-cursor invalidation, and
  incompatible-route invalidation. Cancellation and fresh-instance sibling
  isolation remain covered later in that file.

No VCS provider path, event schema, observation module, consumer, daemon,
Compfuzor, or activation code was added.

## Implementation decisions

1. `WatchInterests.ensure` remains available in addition to `reconcile`. The
   composed Config and Skill owners already need acquire-before-read behavior,
   and the completion addendum requires the future VCS observer to own
   `committed union candidate` before a candidate's strict read.
2. An unchanged terminal key does not retry. The pre-existing test that
   expected `ensure` to restart it was amended to the normative suppression
   contract at
   [`spec0:289-297`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L289-L297).
   A changed normalized intent can replace the suppressed demand; no owner retry
   loop was invented.
3. `incompatible-clock`, `retry`, `canceled`, and `fresh-instance` are control
   reasons, not `Watcher.Update` rows. Exact daemon rows continue unchanged.
4. Explicit exact placement overrides automatic project placement and is part
   of both owner and physical sharing keys. File and grouped-entry interests
   remain exact and Node-owned.
5. The repository declares Bun and rejects `pnpm`; package-local Bun commands
   were therefore used after recording the exact tooling rejection. No package
   manifest or lockfile was changed.

## Verification

All test commands below ran from `packages/core`; no test suite was run from the
repository root.

### Composition baseline

| Command or suite                                                                          | Result                                                                     |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `bun typecheck`                                                                           | Pass.                                                                      |
| `bun test test/filesystem/watcher.test.ts test/filesystem/watcher-interests.test.ts`      | 21 pass, 0 fail.                                                           |
| `bun test test/config/watch.test.ts test/config/config.test.ts test/config/skill.test.ts` | 52 pass, 0 fail.                                                           |
| `bun test test/location-layer.test.ts`                                                    | 25 pass, 0 fail.                                                           |
| Focused `oxlint`                                                                          | 0 errors; 5 existing style warnings in the composed Config/Watcher source. |

### Ladder commit 1

| Command or suite                                                                                                                                                    | Result                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `bun typecheck`                                                                                                                                                     | Pass.                                                                            |
| `bun test test/filesystem/watcher-interests.test.ts test/filesystem/watcher.test.ts test/filesystem/watchman-root.test.ts test/filesystem/watchman-metrics.test.ts` | 38 pass, 0 fail, 129 assertions.                                                 |
| `bun test test/config/config.test.ts test/config/reload.test.ts test/config/skill.test.ts`                                                                          | 62 pass, 0 fail, 198 assertions.                                                 |
| Focused `oxlint` over changed source and tests                                                                                                                      | 0 errors; 3 pre-existing warnings in the native binding loader/backend selector. |

### Failed attempts and repairs

| Attempt                                                | Outcome and disposition                                                                                                                                                                                                       |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec prettier ...`                               | Rejected with `This project is configured to use bun`. The repository-declared Bun toolchain was used; this is not a source blocker.                                                                                          |
| Initial `bun install --frozen-lockfile`                | Host `node-gyp` failed while building `tree-sitter-powershell` with `TypeError: LRU is not a constructor`. A script-free forced frozen install completed the ignored dependency tree without changing manifests or lockfiles. |
| First script-free install                              | Left `drizzle-orm` partially extracted, causing unrelated missing-module errors. `bun install --frozen-lockfile --ignore-scripts --force` restored the complete package; all final focused suites then loaded.                |
| Old owner recovery test                                | Timed out because it expected unchanged terminal demand to restart. The test was corrected to the specified suppression behavior, then passed.                                                                                |
| One Watchman-root test invocation from repository root | The repository guard rejected it before running tests. The same suite was rerun from `packages/core`: 10 pass, 0 fail.                                                                                                        |

There are no unresolved composition conflicts or known failures in the code
unit committed here. Repository-wide aggregate checks were not run as evidence
for a completed stack because five implementation commits are still absent.

## Continuation roadmap

Continue from clean parent `dd090d23`. Keep `vcs-core-20260904` fixed at
`07df76de`; move only `vcs-core` after each coherent committed tip. The nearest
valid code boundary is the original ladder's commit 2. Do not collapse or
reorder the remaining review units.

### Core ticket work

| Order and boundary                                                  | Governing contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Expected seams                                                                                                                                                                                                                                                                                                                                                                                              | Acceptance evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Prerequisites or blockers                                                                                                                                                                                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Commit 2, `feat(plugin): let VCS providers describe observation` | [`spec0:169-216`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L169-L216) and [`spec0:887-891`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L887-L891), replaced where necessary by [`completion:189-263`](/.design/watchman/vcs-observation-completion0.gpt56solmax.md#L189-L263).                                                                                                                                                                                                                                                                                                            | `packages/plugin/src/effect/vcs.ts`, `packages/plugin/src/promise/vcs.ts`, `packages/plugin/src/promise/adapter.ts`, and the current Promise-plugin adapter test location under `packages/core/test`. Add `VcsPreparedObservation`, optional `observe`, and an independently abortable strict `read`.                                                                                                       | Plugin typecheck plus an adapter test proving outer `observe` and inner `read` preserve their receivers and receive distinct live `AbortSignal` values, as amended at [`completion:446-447`](/.design/watchman/vcs-observation-completion0.gpt56solmax.md#L446-L447). Existing providers must remain valid by omission.                                                                                                                                                                                                                                 | Requires commit 1. No concrete source blocker is known. The spec's historical `plugin/promise.test.ts` citation must be mapped to the current test layout rather than recreated blindly.                                                              |
| 2. Commit 3, `refactor(core): share Jujutsu repository topology`    | [`spec0:417-496`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L417-L496), [`spec0:893-898`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L893-L898), and canonical-main correction [`completion:329-359`](/.design/watchman/vcs-observation-completion0.gpt56solmax.md#L329-L359).                                                                                                                                                                                                                                                                                                             | Add `packages/core/src/vcs/topology/jj.ts`; make `packages/core/src/project.ts` consume it without changing identity or fallback; update `packages/core/src/vcs/jj.ts` so every observation-reachable metadata query, including identity, uses `--ignore-working-copy`.                                                                                                                                     | Existing Project/worktree suites stay green; filesystem topology tests prove main and secondary repository/canonical resolution; command-boundary tests prove the metadata flag. Preserve the evidence that secondary Git discovery must start at canonical main, not the active secondary workspace.                                                                                                                                                                                                                                                   | Requires commit 2 only by the ordered ladder. No known blocker; real jj availability may supplement but must not replace deterministic tests.                                                                                                         |
| 3. Commit 4, `feat(schema): publish complete VCS metadata updates`  | [`spec0:635-686`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L635-L686), event tests at [`spec0:813-825`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L813-L825), and boundary [`spec0:900-904`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L900-L904).                                                                                                                                                                                                                                                                                                                          | `packages/schema/src/vcs-event.ts`, `packages/schema/test/contract-hygiene.test.ts`, then canonical generated Protocol/client outputs. Do not hand-edit generated files or create a duplicate event schema.                                                                                                                                                                                                 | Schema typecheck and contract-hygiene test encode complete Git and jj `Vcs.Info` with canonical optional omission; client generation is clean and client typecheck passes. `BranchUpdated` remains in the inventory before later consumer migration.                                                                                                                                                                                                                                                                                                    | Requires commits 2 and 3. Generator dependencies must be installed and the checked-in generated diff must remain in this same commit.                                                                                                                 |
| 4. Commit 5, `feat(core): observe topology-correct VCS metadata`    | Deep-module and refresh contract [`spec0:218-254`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L218-L254), plan/sentinel/state behavior [`spec0:305-633`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L305-L633), deterministic tests [`spec0:767-833`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L767-L833), strict reads and publication ordering [`spec0:1108-1193`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L1108-L1193), plus all three addendum corrections [`completion:189-359`](/.design/watchman/vcs-observation-completion0.gpt56solmax.md#L189-L359). | Add `packages/core/src/vcs/observation.ts` and provider plan logic in `plugin/vcs/git.ts`, `plugin/vcs/hg.ts`, and `plugin/vcs/jj.ts`; use shared jj topology; delegate cache/refresh/mandatory effectful `health()` from `vcs.ts`; remove Core's filesystem-event subscription and live-jj bypass. Add `test/vcs/observation-plan.test.ts`, `test/vcs/observation.test.ts`, and amend Git/Hg/jj VCS tests. | Exact plan matrices, strict failure retention, 250 ms `TestClock` debounce, provider-generation fencing, committed/candidate ownership, A-to-B ordering, startup repair, candidate B-to-C replacement, per-key readiness quorum/epochs, absent-directory sentinel health, shared physical root with two Location rereads, equal-branch full publication, compatibility-before-full ordering, and reentrant FIFO publication. Include every amendment at [`completion:424-449`](/.design/watchman/vcs-observation-completion0.gpt56solmax.md#L424-L449). | Requires commits 2 through 4. This is the largest remaining coherent boundary. It must not silently weaken strict reads, candidate retention, health counts, canonical-main Git agreement, or event ordering to make tests easier.                    |
| 5. Commit 6, `test(core): prove exact VCS root delivery`            | Isolated probe contract [`spec0:688-735`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L688-L735), boundary [`spec0:912-916`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L912-L916), and reproduced raw evidence [`completion:395-422`](/.design/watchman/vcs-observation-completion0.gpt56solmax.md#L395-L422).                                                                                                                                                                                                                                                                              | Add `packages/core/test/filesystem/watchman-vcs-live.test.ts` with an isolated short Unix socket, child-process daemon lifecycle, production `loadFactory` and root registry, and deterministic milestones. Do not mutate ambient daemon state.                                                                                                                                                             | With `OPENCODE_WATCHMAN_LIVE=1`, assert exact watch-list roots for Git `refs/heads` and jj `op_heads/heads`, then observe both create and delete updates through production callbacks. Cleanup must stop the isolated daemon and remove its tree.                                                                                                                                                                                                                                                                                                       | Requires commit 5 and an available compatible Watchwoman executable. Unix socket path length is a known environmental constraint; use an approved short path. Raw protocol probes are prior evidence, not a substitute for this production-path test. |
| 6. Core closure evidence                                            | Acceptance map and exit criteria [`spec0:982-1019`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L982-L1019), completion-state gaps [`completion:452-468`](/.design/watchman/vcs-observation-completion0.gpt56solmax.md#L452-L468), and package commands [`spec0:918-929`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L918-L929).                                                                                                                                                                                                                                                             | Run package-local plugin, schema, client, and Core typechecks/tests plus repository aggregate checks. Run or retain explicit evidence for two live Location observers reacting to a peer secondary-jj workspace through one resolved repository. Write a new final model-suffixed implementation record rather than overwriting this WIP record.                                                            | Every Core acceptance row, including amended health and candidate tests, passes; generated outputs are clean; production-path exact roots pass; no VCS refresh depends on `FileSystem.Event.Changed`; the workspace is clean and `vcs-core` points at the final committed tip.                                                                                                                                                                                                                                                                          | Requires commits 2 through 6. Any real environment failure must be reported as a blocker rather than converted into a completion claim.                                                                                                               |

### Work outside this Core ticket

| Workstream                                | Scope authority                                                                                                                                                                                                              | Expected continuation and evidence                                                                                                                                                                                                                        | Dependency boundary                                                                                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `opwatch-vcs-signals-core-consumers`      | Excluded by [`spec0:108-115`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L108-L115); event migration consequences are at [`spec0:667-686`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L667-L686).    | Replace client caches atomically from complete `vcs.updated`, preserve outer VCS state in the temporary branch-only handler, and prove footer labels, conflict presentation, and move/worktree views converge.                                            | Starts after Core's canonical event and observer behavior exist. It is not part of commits 2 through 6.                                                        |
| Watchwoman daemon filtering and lifecycle | The split is explicit at [`spec0:121-124`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L121-L124) and in [`alignment:56-84`](/.design/watchman/opwatch-vcs-signals-alignment0.gpt56solmax.md#L56-L84).            | Continue the daemon-owned ordered `ViewFilter`, broad-root traversal rules, profiles, root snapshots, and required lifecycle/readiness work in the Watchwoman line with its own tests. Exact Core metadata roots do not wait for broad-root allowlisting. | Independent delivery lane that joins only at activation. Do not move daemon policy into Core providers or commit 5.                                            |
| Compfuzor                                 | Excluded by [`spec0:112-115`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L112-L115) and described in [`alignment:77-84`](/.design/watchman/opwatch-vcs-signals-alignment0.gpt56solmax.md#L77-L84).               | Select the approved daemon revision, generate machine/service configuration, and perform the deliberate restart through Compfuzor-owned state. Preserve reproducible revision and configuration evidence.                                                 | Depends on an accepted daemon artifact and policy. It is not a Core source or test seam.                                                                       |
| Final activation                          | Claim limits are at [`spec0:1141-1163`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L1141-L1163) and the lane join is at [`spec0:1202-1207`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md#L1202-L1207). | Exercise the binaries and configuration actually selected: exact and broad positive signals, negative churn, root-snapshot behavior, peer-workspace metadata refresh, and user-facing cache/UI convergence. Record deployed versions and paths.           | Requires completed Core observation, `core-consumers`, daemon work, and Compfuzor deployment. Neither the raw probe nor commit 6 alone is activation evidence. |

## Untouched work

No source edit for ladder commits 2 through 6 was started. There are no partial
plugin observation types, shared jj topology module, `vcs.updated` schema,
generated client changes, Core VCS observer, provider plans, or isolated
production-path VCS test in the working copy. Beads, other workspaces, other
bookmarks, and remote state were not modified, and nothing was pushed.

## Cross-references

- [`vcs-observation-spec0.gpt56solmax.md`](/.design/watchman/vcs-observation-spec0.gpt56solmax.md)
  is the main topology, event, state-machine, test, and six-commit contract.
- [`vcs-observation-completion0.gpt56solmax.md`](/.design/watchman/vcs-observation-completion0.gpt56solmax.md)
  is normative for candidate-plan recovery, per-interest health quorum, and
  canonical-main secondary colocated Git discovery. Future implementation must
  cite both documents.
- [`opwatch-vcs-signals-alignment0.gpt56solmax.md`](/.design/watchman/opwatch-vcs-signals-alignment0.gpt56solmax.md)
  explains why exact Core observation, broad-root daemon policy, consumers,
  Compfuzor, and activation are separate dependency lanes.
- [`upstream-delta0.glm53h.md`](/.design/watchman/upstream-delta0.glm53h.md)
  explains the `ConfigWatch.plan`, grouped-entry, and readiness seams that the
  composition commit preserved instead of replacing with either parent whole.
- [`carrier1-review0.gpt56sol.md`](/.design/watchman/carrier1-review0.gpt56sol.md)
  is prior failure-path evidence for explicit continuity, terminal attribution,
  and detected-loss claim limits implemented in ladder commit 1.
- [`maintenance.glm53.md`](/.design/watchman/maintenance.glm53.md) records the
  accepted Watchman implementation line through which this workspace was
  composed; this WIP record documents only the Core composition and subsequent
  owner-lifecycle delta.
