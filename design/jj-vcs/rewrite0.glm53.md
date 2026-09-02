---
type: Design
title: jj-vcs branch rewrite — assessment and commit ladder (rewrite0)
description: Assessment of the compose-20260902 port map, the verdict that the rewrite is a re-sequencing of tested composed content rather than a code rewrite, the proposed 8-commit ladder with old-to-new mapping and rider fold map, a seam-by-seam carryability analysis, and the mechanics to produce the line in this workspace.
resource: design/jj-vcs/rewrite0.glm53.md
tags: [vcs, jujutsu, rewrite, carryability, commit-ladder]
status: draft
generated: { by: agent:glm53, at: 2026-09-02T18:30:00-04:00 }
verified: { by: unassigned, at: never }
stale_after: 2026-09-16
sources:
  - id: compose-report
    resource: file:///home/rektide/src/opencode-working/.design/compose-20260902/compose-20260902.glm53.md
    title: Compose friction 2026-09-02 — port map and rewrite brief being assessed
    author: agent:glm53 + human:rektide
  - id: upstream-check
    resource: design/jj-vcs/upstream-check-20260902.glm53.md
    title: Upstream jj-vcs movement check — v2 @ 33dd4e3ba8, provider seams intact, upstream jj line orphaned
    author: agent:flash-max
  - id: stance
    resource: design/jj-vcs/jj-vcs2.glm53.md
    title: Revision-2 comparison with stance column and carry tiers
    author: agent:glm53 + human:rektide
  - id: composed-line
    resource: "working-20260902 commits 1a7f1941..7e6345ea + rider 3c02b4b4 (verified addressable from this workspace)"
    title: The composed provider-era jj-vcs slice — the tested reference implementation
    author: rektide + agents
  - id: manifest
    resource: file:///home/rektide/ado/patches.md
    title: Native Jujutsu VCS support manifest entry (bookmark, base, verification counts)
    author: rektide + agents
---

# jj-vcs branch rewrite — assessment and commit ladder

## What this is

The compose report's §"Port map & rewrite brief" proposes rebuilding the
feature line. This doc assesses that brief, answers "what is the logical
commit sequence", and turns the answer into a concrete ladder with a
carryability rationale. It is a plan for human review, not a landed
rewrite.

## Assessment of the compose brief

The brief is accurate where it counts — every claim in its port-map table
was re-verified against the composed tree on 2026-09-02
(`plugin/vcs/jj.ts` registers a provider beside git/hg; `worktree/jj.ts`
is the jj_workspace strategy; selection defaults from the project's VCS
via a DB lookup in `Worktree.create`; metadata lands through generated
migration `20260902065751_jj-workspace-metadata`; `Vcs.info` reads jj
live; the closed `Vcs` enum is gone — `schema` `Project.Vcs` is a
patterned string and the `jj` typing lives only in core `project.ts`'s
discriminated union; tests are `vcs-jj.test.ts` (5) + `worktree-jj.test.ts`
(6)). Three sharpenings:

1. **"Rewrite from scratch" should mean re-sequencing, not re-coding.**
   The composed shapes are tested and typechecked against a current base;
   re-deriving ~1,100 lines by hand buys nothing and risks regressing the
   snapshot-discipline and identity layers that took two same-day fix
   rounds to get right. What is actually wrong with the feature line is
   its *history shape*: 14 commits whose middle is fix-commits against
   seams that no longer exist, targeting a 3-week-old base, with the port
   living outside the line in compose riders. That is a commit-graph
   problem. Fix the graph; lift the content.
2. **Work-list item 4 is misfiled.** "While there: absorb the cache-ttl
   TTL-pin ease into its workspace" belongs to the cache-ttl feature's
   next freshen, not to this rewrite. Carrying it here re-creates exactly
   the cross-feature rider contamination this rewrite exists to end.
3. **The brief underspecifies the ladder.** Item 1 says "rebase/rebuild
   taking the composed shapes as target" and item 2 says "fold the rider
   into proper feature commits", but the valuable question — which
   *units*, in which *order*, sized how — is unanswered. That is the rest
   of this doc.

## The verdict on sequence

**Eight code commits** (plus trailing docs commits), ordered by dependency
and by decreasing mergeability. Every original commit and every rider
hunk maps into exactly one of them; nothing is re-derived.

| # | New commit | Absorbs (composed SHAs) | Size | Seam touched | Upstream PR candidacy |
| - | --- | --- | --- | --- | --- |
| 1 | `feat(core): recognize Jujutsu repositories` | `1a7f1941` + `17b902c` (boundary edges) + `21716f8` (fs-only roots) + rider's `project.ts` marker-order hunk | ~250 | `project.ts` detection+identity, ignore/ripgrep targets, `project.test.ts` | **PR-1 headliner** — fixes invisible jj repos |
| 2 | `feat(core): reclassify VCS on project open` | `5519727` | ~60 | `schema/project.ts`, `server/handlers/project.ts`, `builtins.ts`, app bootstrap | rides PR-1 (same user story) |
| 3 | `feat(core): add Jujutsu VCS provider` | `926b1b7` + `7e6345e` (snapshot discipline) + rider hunks: `vcs.ts` live-info, provider `branches` stub, adapter return-type, test-harness nodes | ~370 | two **new files** + ~15 lines in `vcs.ts`/`plugin/internal.ts` | **PR-2** — the lean provider |
| 4 | `feat(app): review Jujutsu working-copy changes` | `557f133` | ~10 | `session/review/model.ts`, `global-sync/utils.ts` | rides PR-2 |
| 5 | `feat(core): record worktree metadata` | schema/migration/git-emission half of `a5b0e88` + rider's `worktree.ts` upsert/optional hunks + `worktree/git.ts` restyle | ~200 | `schema/worktree.ts`, generated migration, `worktree.ts` ops, protocol, client regen | **PR-3 part A** — DB substrate, useful without jj |
| 6 | `feat(core): manage Jujutsu workspaces` | jj-strategy half of `a5b0e88` + `8c839c1` (canonical preserve) + `ca1d2bb5` (strategy-from-VCS) + `4e2287bd` (regen, regenerated not ported) + rider's selection/filter hunks + `move.tsx` line | ~450 | `worktree/jj.ts` (**new**), `worktree.ts` create/refresh | **PR-3 part B** |
| 7 | `feat(core): describe Jujutsu working copies` | `04b2b30` | ~80 | `schema/vcs.ts`, `vcs/jj.ts` info | local (thin verdict); PR-2 rider if wanted |
| 8 | `feat(tui): show working-copy labels` | `26cb7bf` + `172e87a4` | ~40 | TUI footer/prompt, `new-session/workspace/controller.ts`, `workspaces/create.ts` | local only; **droppable tip** |

Design docs stay as trailing `docs(design):` commits on the line, never
interleaved — they must not widen any code commit's conflict surface, and
an upstream PR would exclude them entirely.

### Why eight is the right granularity

- The original 14 commits contain five fix-commits (`17b902c`,
  `5519727`-as-fix, `8c839c1`, `172e87a4`, plus the two same-day fixes
  `21716f8`/`7e6345e`) and one generated-output commit. In a fresh line a
  fix-commit is incoherent — it describes a delta against history that no
  longer exists. Folding them into the feature they fix is not history
  vandalism; it is what the feature always should have said.
- Going below eight (folding 2→1, 4→3, 7→8) is possible but starts
  blending seams: reclassification touches the server handler seam,
  review-mode touches the app seam, labels cross schema+adapter+TUI. A
  seam per commit is what makes every commit an independent revert unit
  and an independent freshen-conflict unit — that is the carryability
  currency.
- Going above eight (splitting detection from identity, or provider
  registration from adapter) re-creates the too-small pathology: commits
  that cannot stand alone, rebase stops that buy nothing, and a review
  that reads like a diff of a diff.

### One genuine upstream-posture decision lives inside commit 1

The identity layer (cache-first, unified git/jj ID space, one
`git remote get-url` probe on cache miss) is the deliberate divergence
from upstream's own orphaned line, and the load-bearing reason ours is
the substrate ([jj-vcs2 §ID spaces]). Do **not** split it out of commit 1
— detection without an identity policy cannot resolve a project at all.
Carry it as a flagged decision in the commit body and any PR
description; if upstream pushes back, the fallback (jj-store hash, no
probe) is an intra-commit change, not a restructure.

## Rider fold map

Every hunk of rider `3c02b4b4` lands in exactly one ladder commit (the
other rider, `09d86c86`, is subagent-recovery's — excluded; `174bd670` is
cache-ttl's — excluded):

| Rider hunk | Lands in |
| --- | --- |
| `project.ts` marker order `.git`-before-`.jj` + comment | 1 |
| `plugin/vcs/jj.ts` `branches: () => Effect.succeed([])` | 3 |
| `vcs/jj.ts` dropped return annotation | 3 |
| `vcs.ts` live-info read for jj + stray-line cleanup | 3 |
| `vcs-jj.test.ts` plugin-host harness | 3 |
| `worktree/git.ts` `ListEntry` construction style | 5 |
| `worktree.ts` `Schema.optional` style + upsert pre-metadata-row semantics | 5 |
| `worktree/jj.ts` `ListEntry` construction style | 6 |
| `worktree.ts` refresh filter by project VCS (null-safe probe-everything) | 6 |
| `worktree-jj.test.ts` tweak | 6 |
| `handlers/project.ts` dropped line | 2 |
| all `packages/client` generated diffs | **none — regenerate** |

The client-surface rule: never port generated diffs by hand. Each ladder
commit that changes protocol or `HttpApi` regenerates from
`packages/client` (`bun run generate`) so the generated content always
matches its own commit's sources, instead of inheriting the rider's
end-state blob.

## Carryability analysis

Carry cost is per-file churn exposure times how often we freshen. The
ladder concentrates risk where it is unavoidable and buys zero-risk
wherever possible:

| Seam | Churn exposure | Ladder treatment |
| --- | --- | --- |
| `core/project.ts` (root resolution) | **high** — upstream's most-reworked detection file (marker add/remove saga) | only commit 1 touches it; the `jjDiscover` block is one self-contained function inside `resolve`'s scope; behavior pinned by fs-fabricated tests |
| `vcs.ts` | medium, stabilizing post-provider-refactor | 15 lines in commit 3 |
| `plugin/internal.ts` registry | medium (grazed by `429387d158`) | 3 lines in commit 3 |
| **new files**: `vcs/jj.ts`, `plugin/vcs/jj.ts`, `worktree/jj.ts`, both tests, migration | **zero** | ~850 of ~1,500 lines live here — the rewrite's biggest carry win over the old core-adapter form |
| `schema/vcs.ts`, `schema/worktree.ts` | medium | small struct additions, commits 5/7 |
| `worktree.ts` | medium-high — subsystem renamed days ago, young | commits 5/6 only |
| app/TUI homes (review model, workspace controller, `workspaces/create.ts`, global-sync, TUI footer/prompt) | medium-high UI churn | quarantined in commits 4 and 8 — the droppable tip |
| client generated | regenerate-on-conflict | mechanical, no human merge |

Standing tactics that ride along:

- Detection and adapter tests stay binary-hermetic where achieved:
  detection tests fabricate `.jj/repo` layouts on disk (no `jj` needed),
  adapter/strategy tests keep the `Bun.which("jj")` skip guard. A freshen
  that breaks layout coupling fails in the suite, not in a session.
- Freshen the line **before** the next promote (the compose report's own
  lesson: stale lines are where compose cost concentrates).
- Keep the five-probe upstream watch as pre-flight on every freshen; a
  `jj.ts` appearing in `origin/v2`'s `plugin/vcs/` reopens the substrate
  question before we pay another port.

## Mechanics (this workspace, shared repo)

The composed slice is addressable from `~/src/opencode-jj-vcs` — both are
workspaces of the same jj repo — so no patch-file round trip is needed.

1. **Pre-flight**: re-run the upstream probes against `origin/v2`
   (last verified `33dd4e3ba8e9`, zero jj/vcs/worktree content in the
   delta). Base the rewrite on the tip found, not on a remembered SHA.
2. **Snapshot**: `3cf3bf20` is the floating `jj-vcs` tip and is not yet
   snapshotted (`jj-vcs-20260902` sits at the older `a5542af3`). Create
   the immutable snapshot before moving anything.
3. **Lift**: `jj duplicate` the composed slice `1a7f1941..7e6345ea` plus
   rider `3c02b4b4`, rebased onto the fresh v2 base. Expected conflicts:
   none or near-none — the slice already carries provider-era shapes and
   the base delta is jj-free.
4. **Fold and re-word** per the ladder. Two acceptable methods:
   - *squash-based*: `jj squash` the fix/rider commits into their ladder
     parents — fastest, but repo policy requires explicit human approval
     for squash, so it is off the table until given;
   - *restore-based* (default): build each ladder commit fresh — `jj new`
     on the running tip, `jj restore --from <composed-rev>` the files it
     owns, hand-place the few shared-file hunks (`project.ts`,
     `worktree.ts`, `vcs.ts`) via `jj split -p`/jj-hunk, regenerate
     clients, commit. Slower, but every commit is authored, reviewed,
     and verified in its own right — which is the point of a rewrite.
5. **Verify per commit**: `bun typecheck` from the touched package dirs;
   `project.test.ts`, `vcs-jj.test.ts`, `worktree-jj.test.ts` from
   `packages/core`; `bun run generate` from `packages/client` where
   protocol changed.
6. **Parity check**: the new tip's tree should diff ~empty against the
   composed jj-vcs slice's content (modulo the folds being invisible in
   end-state). If the parity diff shows anything but style-level noise,
   the rewrite drifted — stop and reconcile before promoting.
7. **Bookkeeping**: move floating `jj-vcs` to the new tip; update the
   `patches.md` manifest entry (base, count, refresh note); refresh the
   `jj-vcs2` stance table with the orphaned-upstream finding (work-list
   item 3); leave cache-ttl's TTL pin to cache-ttl.

## Open decisions

1. **Commit 2 (reclassify-on-open)**: keep separate (recommended — server
   seam, own tests, independently revertable) or fold into commit 1.
2. **Commits 7–8 (labels)**: keep (recommended — thin but honest, and the
   droppable tip is what makes the line's tail cheap to carry) or drop
   entirely per the deferred verdict.
3. **Squash approval**: whether the fold step may use `jj squash` on the
   duplicated slice, or stays restore-based.
4. **Execution scope**: whole ladder in one pass, or land commits 1–3
   (the mergeable core / PR-1+PR-2 surface) first and treat the worktree
   and labels rungs as a second pass.

## Cross-references

- [`compose-20260902.glm53.md`](file:///home/rektide/src/opencode-working/.design/compose-20260902/compose-20260902.glm53.md) —
  the port map and rewrite brief this doc assesses; its §3 upstream-watch
  findings gate the base choice here.
- [`jj-vcs2.glm53.md`](jj-vcs2.glm53.md) — carry tiers (§"What our
  patches cost to carry") that this ladder operationalizes; the ID-space
  analysis is the flagged decision inside commit 1.
- [`upstream-check-20260902.glm53.md`](upstream-check-20260902.glm53.md) —
  the five probes step 1 re-runs; provider seams intact as of
  `33dd4e3ba8e9`.
- [`jj-vcs-user-impact.glm53.md`](jj-vcs-user-impact.glm53.md) — the
  copies-keep/labels-thin verdicts behind ladder ranks 5–6 and the
  droppable tip.
- `~/ado/patches.md` (*Native Jujutsu VCS support*) — manifest entry the
  bookkeeping step updates.
