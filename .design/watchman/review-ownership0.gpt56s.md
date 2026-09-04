---
type: Review
title: Watchman downstream ownership and carryability audit
description: Static audit of which Watchman, fallback, watcher-owner, and server integration behavior belongs to downstream versus upstream OpenCode, with extension seams and carry risks.
resource: /.design/watchman/review-ownership0.gpt56s.md
tags: [opencode, watchman, fallback, ownership, upstream, downstream, carryability, patch-stack]
status: draft
generated: { by: model:openai-gpt-5.6-sol, at: 2026-09-01T21:25:17-04:00 }
verified: { by: none, at: never }
stale_after: 2026-10-01
sources:
  - id: branch-point
    resource: https://github.com/anomalyco/opencode/commit/43d09b9d75ad5d74cda5bd29ab72319e724fbbb9
    title: OpenCode branch point
    author: org:anomalyco
    last_modified: 2026-09-01
  - id: current-upstream
    resource: https://github.com/anomalyco/opencode/commit/c80650369432592a0b671691e466327e4f339349
    title: OpenCode v2 upstream tip at audit time
    author: org:anomalyco
    last_modified: 2026-09-01
  - id: maintenance-log
    resource: /.design/watchman/README.md
    title: Root-scoped Watchman maintenance log
  - id: consolidation-vision
    resource: /.design/watchman/vision0.gpt56s.md
    title: Watchman consolidation vision
  - id: patch-policy
    resource: file:///home/rektide/a/doc/opencode/patches.md
    title: OpenCode patches and ideas
---

# Watchman downstream ownership and carryability audit

## Review status

This is an independent static ownership review of the working tree, `jj` DAG,
shared Git object store, remotes, bookmarks, file history, line annotations,
and branch-point diffs. It records repository state at
`2026-09-01T21:25:17-04:00`; the shared repository was active during the audit,
so the exact revision freeze below matters. No runtime tests were run for this
review.

The central result is high confidence:

- all custom Watchman protocol, routing, recovery, fallback, and metrics
  behavior is downstream-owned;
- upstream OpenCode provides the generic watcher service, exact-interest
  `RcMap` lifecycle, Parcel/native directory adapter, Node exact-file adapter,
  and public project ignore configuration;
- both sites that turn a Watchman-selected directory interest into Parcel are
  downstream policy, not inherited compatibility behavior;
- new Watchman files are textually cheap to carry, while the generic watcher,
  Config, Skill, and server assembly edits are the expensive part of the
  carrier.

## Lineage warning: use `jj`, not this workspace's `.git`

The workspace has two unrelated version-control views:

- [`.jj/repo`](/.jj/repo) is a pointer to
  `../../../archive/anomalyco/opencode/.jj/repo`. This shared `jj` repository is
  the source-of-truth DAG for OpenCode and contains the Watchman feature line,
  upstream bookmarks, remotes, and Git-compatible commit IDs.
- The workspace [`.git`](/.git) is a separate beads initialization repository.
  Its `main` points at `26284be4dbe22ccd1d0a01bad0cd86b21a6accc9`
  (`bd init: initialize beads issue tracking`), its config has no remotes, and
  ordinary `git status` treats nearly the entire OpenCode source tree as
  untracked.

Consequently, `git log`, `git diff`, `git branch`, and `git remote` run directly
in this workspace do not describe the OpenCode source line. Use `jj` here, or
run Git object/history queries from
`/home/rektide/archive/anomalyco/opencode`, which shares the relevant source
objects.

Remote naming also needs care. `jj git remote list` reports:

| Remote | URL | Meaning |
| --- | --- | --- |
| `origin` | `https://github.com/anomalyco/opencode` | Actual OpenCode upstream |
| `rektide` | `https://github.com/rektide/opencode` | Downstream fork |
| `upstream` | `github.com:rektide/opencode` | Despite its name, another downstream-fork URL |
| `tngl` | `tngl:jauntywunderkind.bsky.social/opencode` | Tangled remote |

Automation must not infer that the remote named `upstream` is Anomaly's
upstream. For this feature, `v2@origin` is the baseline authority.

## Revision freeze and bookmark debt

The common ancestor was resolved with:

```sh
jj log -r 'heads(::@ & ::v2@origin)'
```

| Role | Change ID | Commit ID | Description |
| --- | --- | --- | --- |
| Declared branch point | `qmmmkxvlsqrnvlmuqvompuowxlopoupl` | `43d09b9d75ad5d74cda5bd29ab72319e724fbbb9` | `fix(server): await plugin activation when checking updates` |
| Current upstream | `qxnqnnkxslvnttxsrqtrltmzuvqpvnxq` | `c80650369432592a0b671691e466327e4f339349` | `fix generated docs (#46678)` |
| Floating and dated Watchman bookmark | `suxltzmoswmytotmwnzpqkrzxkosnrrl` | `4bb2c5d8ec362629d52ae3a3d5d74af2e3d82ca6` | `docs(watchman): record refresh onto 43d09b9d` |
| Working parent at review freeze | `rqmnuxomuwwpszvonqmpmposrowvrnmo` | `61142693d7fc82042279d02f9a57e2972bbef871` | `docs(watchman): capture consolidation vision` |
| Empty working copy at review freeze | `puqkttsnxttz...` | `647cd99169ae...` | no description |

Both `watchman` and `watchman-20260901` point at `4bb2c5d8ec36`. Six real
commits sit above the floating bookmark:

| Commit | Description | Carrier significance |
| --- | --- | --- |
| `9d62e280938e` | `feat(core): widen ignore patterns and wire them into watch owners` | Runtime and tests omitted by the bookmark |
| `ff08b515a676` | `docs(watchman): assess since-query semantics against resume path` | Feature design record |
| `c5a3b1e45af9` | `docs(watchman): record ignore-pattern widening` | Maintenance record |
| `cccaa88e239d` | `docs(watchman): map watchman fallback semantics` | Fallback discovery record |
| `98b4d82fcae6` | `cleanup docs` | Moves one design file, adds beads ignores, and deletes upstream `AGENTS.md` |
| `61142693d7fc` | `docs(watchman): capture consolidation vision` | Current working vision |

The [patch policy](file:///home/rektide/a/doc/opencode/patches.md) says that all
real work above a floating feature bookmark, including documentation, is
feature work and that only the empty working-copy commit belongs above it.
Therefore the floating bookmark currently has six commits of debt, not four.
Before any freshen, advance the floating bookmark over the accepted real work
or explicitly remove work that should not be part of this carrier.

`98b4d82fcae6` deserves a separate decision. Its design-file move belongs to
the documentation corpus, but deleting upstream `AGENTS.md` and adding
beads-specific `.gitignore` entries are not Watchman behavior. They are now on
the feature line and will otherwise compose as part of it.

## Current upstream collision result

At the review freeze, `v2@origin` is ten commits ahead of the branch point. A
raw changed-file intersection was computed with:

```sh
comm -12 \
  <(jj diff --name-only --from 43d09b9d --to @- | sort) \
  <(jj diff --name-only --from 43d09b9d --to v2@origin | sort)
```

The exact output is:

```text
AGENTS.md
bun.lock
```

The two collisions have different meanings:

- `bun.lock` is the only overlap belonging to the Watchman runtime carrier.
  Downstream adds `@superbfowle/fb-watchman-esm`, `@superbfowle/bser-esm`,
  `is-glob`, `micromatch`, and their type packages. Upstream commit
  `818804e18184` refreshes unrelated lock entries. This is lockfile integration,
  not a semantic Watchman collision.
- `AGENTS.md` overlaps only because `98b4d82fcae6` deletes the whole upstream
  file while current upstream changes one branch-targeting instruction. This
  is unrelated carrier contamination and a real conflict if retained.

There is no current upstream semantic collision in
[`filesystem/watcher.ts`](/packages/core/src/filesystem/watcher.ts),
[`config.ts`](/packages/core/src/config.ts),
[`config/plugin/skill.ts`](/packages/core/src/config/plugin/skill.ts), the
Watchman subtree, server watcher options, or the focused Watchman tests.
Upstream changed two other Config test files after the branch point, but the
downstream Watchman stack does not touch those files.

## Ownership map

| Area | Inherited upstream ownership | Downstream ownership | Carryability |
| --- | --- | --- | --- |
| [`watcher/watchman/backend.ts`](/packages/core/src/filesystem/watcher/watchman/backend.ts) | None | `make`, file bypass, root intent selection, initial acquisition fallback, fallback metrics | Very low textual conflict; best adapter-policy seam |
| [`watcher/watchman/client.ts`](/packages/core/src/filesystem/watcher/watchman/client.ts) | None | Transport loading, structural client boundary, generations, serialized command admission, command timeouts | Low textual conflict; medium protocol/async risk |
| [`watcher/watchman/root.ts`](/packages/core/src/filesystem/watcher/watchman/root.ts) | None | Root registry, connection generations, routing, subscriptions, cursors, retry classification, reconnect, PDU delivery, ignore filtering | Low textual conflict; highest downstream semantic complexity |
| [`watcher/watchman/route.ts`](/packages/core/src/filesystem/watcher/watchman/route.ts) | None | Exact/project root intents, route resolution, relative-root validation | Low |
| [`watcher/watchman/schema.ts`](/packages/core/src/filesystem/watcher/watchman/schema.ts) | None | Response codecs, subscription PDU shapes, `WatchmanError`, `GenerationClosed` | Low, unless daemon protocol changes |
| [`watcher/watchman/metrics.ts`](/packages/core/src/filesystem/watcher/watchman/metrics.ts) | None | All counters, gauges, snapshots, render modes, and console emission | Low textual conflict; large downstream surface |
| [`watcher/internal.ts`](/packages/core/src/filesystem/watcher/internal.ts) | None | Private metadata symbol, readiness, placement, normalization | Low file conflict; coupled to generic watcher contract |
| [`watcher/interests.ts`](/packages/core/src/filesystem/watcher/interests.ts) | None | Owner-local desired-interest planning, placement choice, ensure-before-release reconciliation, physical-failure propagation | Low file conflict; adoption changes upstream owners |
| [`filesystem/watcher.ts`](/packages/core/src/filesystem/watcher.ts) | Parcel wrapper/loading, platform backend choice, `WatchInput`, subscription/test services, `RcMap` lifecycle, Node/Parcel adapters | Native placement/failure contract, fallible streams, Watchman options and dynamic selection, readiness metadata, placement-aware keys, configurable Parcel timeout | High-risk shared seam |
| [`config.ts`](/packages/core/src/config.ts) | Config discovery, precedence, parsing, public raw-change feed, event publication | `WatchInterests` plan, stable root/file targets, symlink/missing sentinels, owner recovery, widened ignore source | High carry risk in an active owner module |
| [`config/plugin/skill.ts`](/packages/core/src/config/plugin/skill.ts) | Skill source discovery, URL pulls, parsing, transforms, reload flow | `WatchInterests` plan, stable source snapshots, owner recovery, directory ignore propagation, cookie defense | High carry risk in an active owner module |
| [`filesystem/ignore.ts`](/packages/core/src/filesystem/ignore.ts) | Shared ignore vocabulary and `PATTERNS` construction | `.jj`, virtualenv, tox, mypy-cache, and Watchman-cookie patterns | Low textual conflict; broad cross-backend semantics |
| [`server/src/options.ts`](/packages/server/src/options.ts) | `ServerOptions`, `fs.filewatcher`, `fs.fff` | `watcherBackend`, timeout/backoff, binary, and metrics options | Medium; every knob duplicates an integration hunk |
| [`server/src/routes.ts`](/packages/server/src/routes.ts) | Application service replacement assembly | Passing watcher backend and nested Watchman options to `Watcher.configured` | Proven conflict hotspot |
| [`cli/src/server-process.ts`](/packages/cli/src/server-process.ts) | Server startup environment construction and filewatcher enable/disable aliases | Watchman environment decoding, timeout validation, binary and metrics options | Medium; startup module churn |
| [`packages/core/package.json`](/packages/core/package.json) and `bun.lock` | Parcel and platform-native packages | Direct Watchman transport, glob dependencies, declarations, lock entries | Low source conflict; recurring lock maintenance |
| [`filesystem/watcher-binding.ts`](/packages/core/src/filesystem/watcher-binding.ts) | Entire file: inherited Parcel native binding loading | None | No feature carry cost |
| [`filesystem/location-watcher.ts`](/packages/core/src/filesystem/location-watcher.ts) and [`location-watcher-policy.ts`](/packages/core/src/filesystem/location-watcher-policy.ts) | Entire implementations: VCS metadata file watches and policy state | None; only a downstream global-sharing test depends on their graph placement | Textually free, semantically adjacent |
| [`schema/src/config/watcher.ts`](/packages/schema/src/config/watcher.ts) | Public project `watcher.ignore` contract | None | Do not confuse this with backend selection |
| [`config/plugin/source.ts`](/packages/core/src/config/plugin/source.ts) and [`config/plugin/instruction.ts`](/packages/core/src/config/plugin/instruction.ts) | Inherited direct file-watch consumers | None | They bypass Watchman because files remain Node-only |
| [`app/src/workspaces/files/watcher.ts`](/packages/app/src/workspaces/files/watcher.ts) | Client-side event invalidation | None | Unrelated to physical backend ownership |
| [`patches/`](/patches) | All 15 current patch artifacts | None | No Watchman package patch exists |

### Mixed `watcher.ts` detail

Line history makes the boundary precise:

- Upstream owns the Parcel wrapper and platform selection at
  [`watcher.ts:18-30`](/packages/core/src/filesystem/watcher.ts#L18-L30), public
  inputs and base subscription shape at
  [`watcher.ts:32-43`](/packages/core/src/filesystem/watcher.ts#L32-L43), the
  service/test identities, the `RcMap` acquisition/release scaffold, and the
  test layer.
- Downstream adds `placement` and `fail` to `NativeInterface`, and makes public
  update streams fallible at
  [`watcher.ts:45-65`](/packages/core/src/filesystem/watcher.ts#L45-L65).
- Downstream adds backend and Watchman tuning at
  [`watcher.ts:68-84`](/packages/core/src/filesystem/watcher.ts#L68-L84).
- Downstream owns dynamic Watchman selection and whole-backend substitution at
  [`watcher.ts:104-115`](/packages/core/src/filesystem/watcher.ts#L104-L115).
- Downstream extends the shared physical-interest key and failure/readiness
  behavior at
  [`watcher.ts:117-190`](/packages/core/src/filesystem/watcher.ts#L117-L190).
- The Node/Parcel logic at
  [`watcher.ts:233-320`](/packages/core/src/filesystem/watcher.ts#L233-L320) is
  behaviorally inherited, although the timeout commit rewrote the block and
  therefore owns much of its current line attribution. The actual downstream
  semantics there are error forwarding and timeout injection.

## Fallback-site ownership

| Decision site | Reference | Owner | Current effect |
| --- | --- | --- | --- |
| No Watchman selection | [`watcher.ts:104-115`](/packages/core/src/filesystem/watcher.ts#L104-L115) | Upstream default plus downstream selector | Absent or `parcel` uses inherited native adapter deliberately |
| Watchman backend construction fails | [`watcher.ts:104-115`](/packages/core/src/filesystem/watcher.ts#L104-L115) | Downstream | Substitutes inherited native adapter for the whole process |
| Exact file input under Watchman selection | [`backend.ts:16-23`](/packages/core/src/filesystem/watcher/watchman/backend.ts#L16-L23) | Downstream routing choice over inherited Node adapter | Files never enter Watchman; this is a static split, not runtime failover |
| Initial directory acquisition fails | [`backend.ts:23-31`](/packages/core/src/filesystem/watcher/watchman/backend.ts#L23-L31) | Downstream | Catch-all conversion to Parcel for that physical interest |
| Initial Watchman establishment | [`root.ts:399-437`](/packages/core/src/filesystem/watcher/watchman/root.ts#L399-L437) | Downstream | One attempt; errors escape to the per-interest fallback site |
| Established generation closes | [`root.ts:290-351`](/packages/core/src/filesystem/watcher/watchman/root.ts#L290-L351) | Downstream | Recoverable errors retry Watchman indefinitely with capped jittered backoff |
| Native fallback implementation | [`watcher.ts:233-320`](/packages/core/src/filesystem/watcher.ts#L233-L320) | Predominantly inherited | Node exact-file watch or Parcel platform directory watch |

The asymmetry between one-shot initial acquisition and unbounded post-ack
recovery is entirely downstream. Upstream did not require a transient Watchman
failure to choose Parcel, did not define the acknowledgement boundary as a
policy boundary, and did not require mixed Watchman/Parcel roots.

The inherited `RcMap` makes a fallback sticky in practice. Its physical entry
is keyed by downstream-extended `{ type, target, ignore, placement }`; no
promotion loop revisits the backend after a Parcel subscription succeeds.

## Downstream implementation history

The current root-scoped implementation is carried by these code commits above
the branch point:

| Commit | Scope |
| --- | --- |
| `0ec2359fe72f` | Source-owner watch-interest reconciliation |
| `04d753adef84` | Root-scoped Watchman backend and protocol modules |
| `f63ad64de79d` | Server/CLI backend selector |
| `4d00a833ad55` | Root-owned recovery and placement |
| `4d338ff1268e` | Config/Skill physical-watch recovery |
| `1c2af67c2778` | Watcher-internal cleanup |
| `a7b15cf2ce2e` | Configurable watcher deadlines/backoff |
| `bca61e06becd` | Two-second reconnect cap |
| `6fc4bba444ed` | Watchman binary override |
| `d38bcfe3af2a` | Process-global watcher-sharing test |
| `3a13e52cb542` | Watchman channel metrics |
| `84777a2af874` | Metrics server/CLI options |
| `9d62e280938e` | Shared ignore widening and owner wiring |

The major inherited `watcher.ts` history predates these commits, including
`604a5f781f`, `c9b24ef027`, `713658c07b`, `4333a44e65`, `bd906d468d`,
`7b775c2582`, and `04c9e01dad`. This is why `watcher.ts` should be treated as
an upstream hotspot even though line annotation attributes some rewritten
native-adapter blocks to downstream.

## Clean extension seams

### 1. Adapter policy in `watchman/backend.ts`

[`watchman/backend.ts`](/packages/core/src/filesystem/watcher/watchman/backend.ts)
is the cleanest boundary for static backend policy and initial acquisition
disposition. Removing fallback, classifying acquisition errors, or wrapping a
Watchman registry should stay here or immediately below it rather than adding
backend decisions to Config, Skill, or Location owners.

### 2. Root lifecycle in `makeRegistry`

[`makeRegistry(factory, options)`](/packages/core/src/filesystem/watcher/watchman/root.ts#L65-L93)
and [`RawClientFactory`](/packages/core/src/filesystem/watcher/watchman/client.ts#L21)
are strong downstream-only seams. Initial acquisition, established recovery,
cursor delivery, and root-level failure disposition can be redesigned here
with deterministic fake clients and little textual upstream risk.

### 3. Freeze the generic `Watcher.Native` boundary

[`Watcher.Native`](/packages/core/src/filesystem/watcher.ts#L45-L62) is the
correct conceptual backend injection point, but widening its structural
contract has broad fallout across upstream tests and replacements. Prefer
changing the downstream decorator and registry while keeping the current
generic contract stable.

### 4. Keep routing metadata private

[`WatcherInternal.attach/read`](/packages/core/src/filesystem/watcher/internal.ts#L21-L27)
lets owner-local topology supply placement and readiness without making every
public `WatchInput` caller choose a daemon route. Additional internal hints can
use this seam if they remain generic watcher lifecycle facts, not Watchman
policy knobs.

### 5. Keep future options nested

The existing `fs.watchman` object limits each new option to the established
CLI/options/routes pass-through. New top-level `fs` fields or public project
config fields would widen the collision surface. The project-level
[`Config.Watcher`](/packages/schema/src/config/watcher.ts) should remain about
portable ignore behavior, not host daemon selection.

### 6. Preserve injectable observation

[`WatchmanMetrics`](/packages/core/src/filesystem/watcher/watchman/metrics.ts)
and `metricsLog` are isolated observation seams. Lifecycle work can change
metrics behind this boundary without first changing upstream-owned server
assembly. Public metrics knobs can be reconsidered after policy stabilizes.

One missing seam is worth adding when fallback behavior changes:
`backend.make()` hardcodes `loadFactory()`, so the adapter-level fallback
wrapper cannot currently be unit-tested with an injected registry or factory.
An internal constructor accepting a `Registry` or `RawClientFactory` would
allow direct fallback tests without touching generic `watcher.ts`.

## Test ownership and gaps

The following test files are entirely downstream:

- [`watcher-interests.test.ts`](/packages/core/test/filesystem/watcher-interests.test.ts)
- [`watchman-root.test.ts`](/packages/core/test/filesystem/watchman-root.test.ts)
- [`watchman-metrics.test.ts`](/packages/core/test/filesystem/watchman-metrics.test.ts)
- [`watchman-live.test.ts`](/packages/core/test/filesystem/watchman-live.test.ts)

Downstream additions to inherited test files include:

- placement-sharing and shared-failure cases at
  [`watcher.test.ts:127-174`](/packages/core/test/filesystem/watcher.test.ts#L127-L174);
- process-global watcher sharing at
  [`location-layer.test.ts:87-143`](/packages/core/test/location-layer.test.ts#L87-L143);
- Watchman option validation at
  [`server/test/options.test.ts:28-67`](/packages/server/test/options.test.ts#L28-L67);
- Config, Skill, and ignore expectations for stable plans, failed source
  recovery, symlink/missing sentinels, and widened ignore patterns.

The current gaps are material to fallback redesign:

- no test directly exercises the whole-backend fallback in `Watcher.layer`;
- no test directly exercises the per-interest fallback wrapper in
  `watchman/backend.ts`;
- no test proves that the same transient failure immediately before and after
  subscribe acknowledgement receives the intended disposition;
- no test proves that a Watchman-selected directory never invokes Parcel under
  a strict-selection design;
- no CLI test covers decoding or validation of the
  `OPENCODE_WATCHER_*`/`OPENCODE_WATCHMAN_*` environment variables;
- the opt-in live test covers successful update delivery only, not daemon loss,
  reconnect response delivery, initial unavailability, or fallback;
- the known inherited `.hg/branch` watcher timeout remains load-sensitive and
  should not be attributed to Watchman without a backend-specific reproduction.

## Carry-risk map

| Area | Textual conflict risk | Semantic carry risk | Evidence and action |
| --- | --- | --- | --- |
| `watcher/watchman/**` | Low | High in `root.ts` | No upstream counterpart, but concurrency, command admission, cursors, and recovery need focused tests |
| `watcher/internal.ts`, `watcher/interests.ts` | Low | Medium | New files; owner adoption and generic watcher metadata are the real coupling |
| `filesystem/watcher.ts` | High | High | Active upstream lifecycle module; freeze its contract and keep policy below the adapter seam |
| `config.ts` | High | High | Frequent upstream discovery/config refactors; downstream replaces watch ownership rather than adding a narrow hook |
| `config/plugin/skill.ts` | High | High | Frequent upstream ownership changes; downstream carries source snapshots and recursive recovery |
| `server/src/routes.ts` | High, proven | Medium | The previous 97-commit freshen produced two conflicts here; both required unioning upstream's replacement API with feature options |
| `core/test/location-layer.test.ts` | Medium | High, proven | Prior freshen merged textually but needed a semantic API-drift adaptation after `LayerNode` changed |
| `server/options.ts`, `cli/server-process.ts` | Medium | Medium | Small repeated hunks in active startup/configuration surfaces; avoid knob growth |
| `filesystem/ignore.ts` | Low | Medium | Small hunk, but `Ignore.PATTERNS` affects every consumer and both backends |
| `packages/core/package.json`, `bun.lock` | Low/medium | Low | Current upstream collision is unrelated lock cleanup; regenerate and inspect rather than hand-resolve blindly |
| `AGENTS.md` deletion in `98b4d82fcae6` | High now | High carrier-policy risk | Not Watchman work; decide whether to remove it from the feature line before freshening |
| Global watcher sharing assumption | Low textual | High | Only downstream test pins one hoisted registry; upstream graph changes can duplicate connections without touching Watchman files |
| Six commits above `watchman` | None until maintenance | High operational | Repair floating bookmark before freshen; dated bookmark remains immutable per policy |
| Workspace `.git` versus shared `jj` | High operator risk | High | Git commands in the workspace inspect beads, not source; use `jj` or archive Git |

The previous freshen is useful empirical evidence. Rebasing the line over 97
upstream commits produced two textual conflicts, both in
`packages/server/src/routes.ts`, plus one semantically stale but textually clean
test adaptation in `packages/core/test/location-layer.test.ts`. New downstream
files were not the problem; assembly and graph APIs were.

## Carrier conclusions

1. Watchman fallback behavior can be deleted or redesigned without preserving
   an upstream compatibility promise. Both fallback sites and the pre/post-ack
   asymmetry are downstream choices.
2. Fallback or recovery work should stay in `watchman/backend.ts`, `root.ts`,
   `client.ts`, and their new tests. Do not modify Config or Skill merely to
   change backend policy.
3. Source-owned stable interest reconciliation is independently useful but is
   the most invasive part of this feature after `watcher.ts`. Keep it a
   separately droppable carrier slice.
4. The current upstream delta contains no semantic Watchman collision. The
   immediate integration items are lockfile reconciliation and the unrelated
   `AGENTS.md` deletion now riding on the line.
5. Repair or deliberately trim the six commits of bookmark debt before any
   mechanical freshen. Do not move the immutable `watchman-20260901` snapshot.
6. A final-state replacement carrier should preserve isolated downstream files
   and reduce edits to `watcher.ts`, Config, Skill, and server assembly rather
   than replaying every historical refinement commit unchanged.

## Evidence commands

Key commands used for this review:

```sh
jj git remote list
jj bookmark list --all-remotes
jj log -r 'heads(::@ & ::v2@origin)'
jj log --no-graph -r 'watchman..@-'
jj diff --summary --from 43d09b9d --to @-
jj diff --summary --from 43d09b9d --to @- -- patches
jj file annotate -r @- packages/core/src/filesystem/watcher.ts
jj log -r '43d09b9d..@-' -- packages/core/src/filesystem/watcher.ts packages/core/src/filesystem/watcher
comm -12 <(jj diff --name-only --from 43d09b9d --to @- | sort) <(jj diff --name-only --from 43d09b9d --to v2@origin | sort)
```

Git history for inherited upstream symbols was checked from the shared source
checkout rather than the workspace beads repository:

```sh
git -C /home/rektide/archive/anomalyco/opencode log --follow \
  43d09b9d75ad5d74cda5bd29ab72319e724fbbb9 -- \
  packages/core/src/filesystem/watcher.ts
```

## Cross-references

- [`vision0.gpt56s.md`](/.design/watchman/vision0.gpt56s.md) uses this
  ownership boundary to propose strict backend selection, one downstream root
  supervisor, and a smaller final-state carrier.
- [`README.md`](/.design/watchman/README.md) records the implementation stack,
  runtime configuration, verification history, and prior freshen conflicts.
- [OpenCode patch policy](file:///home/rektide/a/doc/opencode/patches.md)
  governs independent feature lineage, work above floating bookmarks,
  immutable dated snapshots, collision checks, mechanical freshening, and
  bail-out conditions.
- [`fallbacks0.glm53.md`](/.design/watchman/fallbacks0.glm53.md) provides the
  detailed static failure-path analysis behind the two downstream fallback
  sites and acquisition-cliff conclusion.
