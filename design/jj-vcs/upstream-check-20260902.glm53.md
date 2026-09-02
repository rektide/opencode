---
type: Report
title: Upstream jj-vcs movement check — 2026-09-02 (post-compose)
description: Fetch-only re-check of anomalyco/opencode upstream for jj/vcs movement since the morning check — v2 tip moved to 33dd4e3ba8 with nothing jj-relevant; the declarative-marker machinery was landed (4eaf533cd0, already merged before the morning check) and then removed from v2 (5d73a5789f), orphaning the jj-vcs-plugin branch; all three remaining jj commits stay unmerged.
resource: design/jj-vcs/upstream-check-20260902.glm53.md
tags: [vcs, jujutsu, upstream-check, patch-maintenance]
status: draft
generated: { by: agent:glm53, at: 2026-09-02T17:00:00Z }
verified: { by: agent:glm53, at: 2026-09-02T17:00:00Z }
stale_after: 2026-09-09
sources:
  - id: upstream-v2
    resource: https://github.com/anomalyco/opencode/commits/v2
    title: origin/v2 tip 33dd4e3ba8e9 (2026-09-02T12:08:41-04:00); prior morning tip 8d4ef0162181
    last_modified: 2026-09-02
  - id: upstream-jj-line
    resource: https://github.com/anomalyco/opencode/commits/jj-vcs-plugin
    title: origin/jj-vcs-plugin unmoved at cc7d4ebb69 (2026-08-26); bee852b5cf82 + 46465000a0e0 (2026-08-25) still unmerged
    author: Shoubhit Dash
    last_modified: 2026-08-26
  - id: markers-removed
    resource: "5d73a5789f feat(plugin): support live package updates"
    title: v2 commit deleting packages/core/src/project/markers.ts and reverting root detection to [".git", ".hg"]
    author: Dax Raad
    last_modified: 2026-08-31
  - id: provider-seams
    resource: "0ab2d783e8 (#44992) / b71291c05a (#44993)"
    title: git/hg moved into internal plugins — the provider-era seams working-20260902 ported onto; unchanged since
    last_modified: 2026-08-25
  - id: morning-docs
    resource: design/jj-vcs/jj-vcs2.glm53.md
    title: Revision-2 comparison whose merge-status claims this check corrects (4eaf533cd0 was already merged)
    last_modified: 2026-09-02
---

# Upstream jj-vcs movement check — 2026-09-02 (post-compose)

Fetch-only (`git fetch origin --prune`) against
`~/archive/anomalyco/opencode` at ~17:00 UTC, after `working-20260902`
(`09d86c86`, on morning tip `8d4ef0162181`) was composed. No checkout, no
pull, no bookmark touched.

## Current state

| Ref / SHA | State at this check | vs. morning check |
| --- | --- | --- |
| `origin/v2` tip | `33dd4e3ba8e9` — 2026-09-02T12:08:41-04:00 — *feat(cli): apply managed updates when idle and wire up ui (#46485)* | moved `8d4ef01621` → `33dd4e3ba8`, +42 commits |
| `origin/dev` tip | `ffbdee7b17` — 2026-09-02T16:06:24Z — *chore: generate* | moved `69c172e8a7` → `ffbdee7b17` |
| `bee852b5cf82` (feat(core): add jujutsu vcs plugin, 08-25) | **not** ancestor of v2 or dev | unchanged (still out) |
| `46465000a0e0` (fix(core): harden jujutsu repository integration, 08-25T21:13+05:30) | **not** ancestor of v2 or dev | unchanged (still out) |
| `4eaf533cd03c` (feat(plugin): declarative vcs repository markers #45192, 08-26T13:49+05:30) | **is ancestor of v2** — merge-base of `jj-vcs-plugin` and v2 is `4eaf533cd0` itself | **correction**: was *already* merged before the morning tip (see below) |
| `cc7d4ebb69` (refactor(core): adopt declarative jujutsu vcs markers, 08-26T14:03+05:30) | **not** ancestor of v2 or dev; `origin/jj-vcs-plugin` tip, branch unmoved | unchanged |
| `origin/jj-vcs-plugin` | `cc7d4ebb69`, 2026-08-26 — no commits beyond those known | unchanged |
| vcs/jj-named remote branches | `nxl/vcs-plugin-api` @ `ceb5f3554e` (07-06), `vcs-branch-metadata` @ `a6761d4fe0` (07-23), `fix-vcs-diffs` @ `73896b78fc` (08-10); vcs-adjacent `git-head-watch` @ `868a303b31` (08-10), `v2-diff-route` @ `50cb18d770` (07-11) | **no new, no deleted, none moved** (this fetch deleted 7 and added 13 branches, all unrelated) |
| jj provider in v2 tree | `packages/core/src/plugin/vcs/` contains only `git.ts`, `hg.ts`; **zero** `jujutsu`/`.jj` matches anywhere in `packages/core/src` | unchanged |

## What's new since 2026-09-02 morning

1. **v2 advanced 42 commits** (`8d4ef01621..33dd4e3ba8`), all on 2026-09-02,
   none touching jj, VCS providers, `project.ts` root resolution, or the
   worktree subsystem. The only delta commit grazing watched core areas is
   `429387d158` (11:33-04:00, *fix(core): rebuild registry state on read
   (#46825)*) — catalog/integration/location-watcher-policy/plugin registry
   work with no semantic overlap with our jj-vcs seams. The provider-era
   seams our compose ported onto (`0ab2d783e8` git→plugin #44992,
   `b71291c05a` hg→plugin #44993, both 08-25) are intact and untouched.

2. **Correction to the morning record — the declarative markers were already
   merged, and already removed.** `4eaf533cd03c` is an ancestor of the
   morning tip `8d4ef0162181`, so [jj-vcs2.glm53.md](jj-vcs2.glm53.md) and
   the `~/ado/patches.md` claim "*none* of it is merged into v2/dev" was
   wrong for this one piece. More importantly, its lifetime in v2 was brief:
   added 08-26 (`4eaf533cd0`), tweaked 08-28 (`a065ad4ba7`, *vanilla
   instance discovery option #45752*), **deleted 08-31** by `5d73a5789f`
   (*feat(plugin): support live package updates*, Dax Raad), which removed
   `packages/core/src/project/markers.ts` (191 lines) plus its 100 test
   lines, dropped `ProjectMarkers.Service` from `project.ts`, deleted the
   `vcsBackend` field from `Resolved`, and reverted root detection to the
   hardcoded `fs.up({ targets: [".git", ".hg"] })` seen in v2 today. The
   whole marker era (08-26 → 08-31) closed before the morning check; the
   morning analysis of marker machinery described the `jj-vcs-plugin`
   branch shape, which no longer matches anything in v2.

3. **Upstream's jj line is orphaned.** `cc7d4ebb` adopts the declarative
   markers — machinery v2 no longer has. The branch has not moved in the
   7 days since 08-26 while its foundation was ripped out from under it.
   `bee852b5` + `46465000` (the two original, marker-free jj commits)
   remain unmerged and untouched.

## Impact on "ours remains the substrate"

The standing decision (*ours remains the substrate until upstream's
jj-vcs-plugin merges; swap the detection tier for theirs at merge and port
identity/copies onto it*) gets **stronger, and its swap clause needs
revision**:

- **Ours is now the only live jj line anywhere.** Upstream v2 recognizes
  only `.git`/`.hg`, has no jj provider, and no marker machinery. The
  recognition fix our `working-20260902` carries has no upstream
  counterpart to defer to.
- **"Swap the detection tier for theirs at merge" may never be the move.**
  The tier we planned to swap to (`cc7d4ebb`'s marker-based detection) was
  tried in v2 and deleted within five days — upstream itself rejected that
  seam in `Project.resolve`. When jj support is revived upstream it will
  likely land in a different shape (possibly re-landed markers, possibly
  `bee852b5`-style plain fs detection — which our detection tier already
  matches mechanically). Our tier is now the likeliest long-term carrier;
  the realistic future work is porting *their* eventual detection onto
  *our* shape if theirs ever lands, not the reverse.
- **The marker danger catalog is now historical.** The
  npm-in-detection-path, last-wins hijack, and `vcsBackend`-from-marker
  dangers (documented in [jj-vcs2.glm53.md](jj-vcs2.glm53.md)) describe
  machinery that no longer exists in v2 — upstream's removal retroactively
  supports the "cool, not scary, but not ours to depend on" stance.
- **Identity/copies porting remains moot until upstream moves** — nothing
  to port onto. No action needed on `working-20260902`; its next freshen
  rides `33dd4e3ba8` with no jj-relevant conflict surface in the delta.
- patches.md's entry should eventually note the marker rise-and-fall and
  the orphaned branch; not urgent, as no decision hinges on it before
  upstream moves again.

## What to re-check next time

- `git merge-base --is-ancestor <sha> origin/v2` for `bee852b5cf82`,
  `46465000a0e0`, `cc7d4ebb` — the three still-out commits; any one landing
  reopens the substrate question.
- `git rev-parse origin/jj-vcs-plugin` + short log — has the branch moved,
  and has it been **rewritten** (rebase off the deleted markers onto
  post-`5d73a5789f` v2)? A rewritten history is the healthiest signal.
- `git ls-tree origin/v2 packages/core/src/plugin/vcs/` — a `jj.ts`
  provider appearing is the leading indicator of revival.
- `git grep -n '\.jj' origin/v2 -- packages/core/src/project.ts` — `.jj`
  in `Project.root`/resolve targets means recognition returned to v2.
- `git grep -l ProjectMarkers origin/v2` or
  `git ls-tree origin/v2 packages/core/src/project/` — marker machinery
  re-landing (probably in a new shape).
- vcs/jj-named remote branches (`git branch -r | grep -iE 'vcs|jj'`) — new
  names, and whether the three stale siblings (`nxl/vcs-plugin-api`,
  `vcs-branch-metadata`, `fix-vcs-diffs`, all ≥7 days old) ever move.
- dev-vs-v2 divergence for jj content (`git log origin/dev --grep=-i jj`)
  — dev sometimes previews plugin work.
