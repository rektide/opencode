---
type: Index
title: jj-vcs known follow-ups — consolidated ledger
description: One place listing every known follow-up concern for the jj-vcs line with status, severity, what acting on it looks like, and the doc that owns the detail; supersedes scattered follow-up mentions in batch reports and corrections sections.
resource: design/jj-vcs/followups.glm53.md
tags: [vcs, jujutsu, follow-ups, ledger]
status: stable
generated: { by: agent:glm53, at: 2026-09-04T00:00:00Z }
verified: { by: unassigned, at: never }
stale_after: 2026-10-02
sources:
  - id: corrections
    resource: design/jj-vcs/rewrite1.glm53.md
    title: Rewrite outcome + 2026-09-04 corrections section (batch findings, deviations of record)
  - id: stance
    resource: design/jj-vcs/jj-vcs2.glm53.md
    title: Danger catalog and ID-space analysis
  - id: watch
    resource: design/jj-vcs/upstream-check-20260902.glm53.md
    title: Upstream movement probes and the orphaned jj-vcs-plugin finding
---

# jj-vcs known follow-ups

The ledger of concerns. Status is `open`, `resolved` (work landed), or
`dissolved` (was never true of this line). Each entry names the doc that
owns the detail; this file only routes.

## Resolved / dissolved — for the record

| Concern | Status | Where |
| --- | --- | --- |
| Provider `branches` stub returned empty (branch pickers blind for jj) | **resolved 2026-09-04** — `e68b5847` `feat(core): list Jujutsu bookmarks in the VCS provider` (sorted listing, metadata discipline, search/limit per git semantics; `--sort name` verified on jj 0.40) | rewrite1 corrections |
| `model.ts` `noGit` memo incoherent with review-mode offering | **dissolved 2026-09-04** — the `vcs !== "git"` shape was the *composed reference*'s; our line inherited upstream's coherent `!project()?.vcs` form and the branch-mode gate excludes jj naturally (empty `branch.current`) | rewrite1 corrections #2 |
| C4 (review Jujutsu working-copy changes) missing from refreshed line | **dissolved 2026-09-03** — upstream `7ba5f3e5` absorbed the any-VCS review gates; the drop at refresh was correct | rewrite1 corrections #3 |
| Compose port dropped `--ignore-working-copy` from workspace listing | **resolved 2026-09-02** — `ab33f473`, subject designates it `(optional hardening)`; probe evidence recorded | rewrite1 corrections #1 |
| Latent `VcsState.workingCopy` typecheck failure carried by the composed reference | **resolved 2026-09-02** — `bc4f4896` (then `02815374` after refresh) persisted-schema fix | rewrite1 corrections #1–2 |

## Open

### 1. Trunk-less review diff — low, edge

Review-mode diffs base on `trunk()`; repos where it resolves to nothing
get an empty review view. Mitigations already in place: we shell jj's
own `trunk()` revset, so `main`/`master`/`trunk` aliasing is jj's
problem, not a hardcoded list. A future `base` surfacing in
`info.workingCopy` (change-id when trunk-less) could soften the edge.
Detail: `vcs/jj.ts` `trunk()`/`diff`.

### 2. `worktree.test.ts` `stored()` asserts metadata only implicitly — low

The upstream worktree test helper selects `directory`+`strategy`, so
git-side metadata persistence is proven only through quiet-refresh
semantics. Explicit assertions live in `worktree-jj.test.ts` (the
feature surface). An explicit git-side metadata assertion would close
it; cosmetic.

### 3. Inert `store:` fabrication in the vcs-jj test harness — low

`vcs-jj.test.ts` fabricates `store: …/.jj/repo/store/git` while
discovery yields `.jj/repo`. Functionally inert (jj skips the branch
watcher; the adapter ignores `store`) but it surfaces in parity diffs
and could mislead. Fix is a one-line fixture change; never urgent
enough yet.

### 4. jj on-disk layout coupling — standing caution, high impact when it fires

Canonical root is `dirname²(store)`; standalone jj 0.40 writes
`store/git_target` → root `.git` (invalidating any "standalone jj has
no `.git`" assumption). A future jj layout change breaks detection
*silently* — the live fabricated-layout tests in `project.test.ts` are
the designed tripwire. Re-probe on every jj upgrade
(`.test-agent/jj-flow-probe/` methodology, preserved on the pre-rewrite
line). Detail: jj-vcs2 danger table.

### 5. Schema `Project.Vcs` is an open pattern — informational

Any lowercase string validates; unknown VCS names won't be
schema-rejected, and `store` exists only on the core struct. Upstream's
shape, subsumes `jj`, nothing to do locally.

### 6. Identity-layer stance for upstream PRs — decision, deferred

The unified git/jj ID space (cache-first, one `git remote get-url`
probe on miss) is our deliberate divergence from upstream's own
orphaned line. If a recognition/provider PR goes upstream, this is the
debate point; the fallback (jj-store hash, no probe) is an
intra-commit change. Detail: jj-vcs2 §"ID spaces, precisely".

### 7. Upstream watch — recurring, pre-freshen

The three upstream jj commits remain unmerged and `jj-vcs-plugin` is
orphaned (built on marker machinery v2 deleted 2026-08-31). Run the
five probes before any freshen; a `jj.ts` appearing in
`origin/v2`'s `plugin/vcs/` — or the branch being rewritten — reopens
the substrate question. Detail: upstream-check-20260902 §"What to
re-check next time".

### 8. `worktree.metadata` migrate-away — resolved 2026-09-05

The rebuild removed `metadata` from the declared core `worktree` schema and
established `rektide_jj_worktree` as JJ-owned storage. The idempotent migration
creates that table empty for either historical lineage and copies no metadata.
Runtime discovery fills rows on demand, preferring owned data while retaining
a guarded legacy read to preserve the creation base of an observed old
workspace. The legacy column is deliberately left inert where it already
exists. Detail:
[`way-forward1.glm53.md`](way-forward1.glm53.md#outcome--implemented-2026-09-05)
and [`table-ownership0.glm53max.md`](table-ownership0.glm53max.md).

### 9. Optional internal project discovery pass — open, trigger-driven

The rebuild intentionally retains upstream's location-native refresh. Add a
separate internal `refreshProject(projectID)` pass only when a real consumer
needs boot/sweeper freshness, same-project sibling-clone coverage, or a
multi-project orchestrator. Do not add a wire parameter or dual-policy config
without such a consumer. Detail:
[`discovery-counter0.glm53.md`](discovery-counter0.glm53.md#the-menu-priced).

## Adjacent, owned elsewhere

- **cache-ttl TTL pin port** (compose rider `174bd670` → feature
  workspace) belongs to `~/src/opencode-cache-time`'s next freshen —
  never to this line. Detail: compose-20260902 §1.

## Cross-references

- [`rewrite1.glm53.md`](rewrite1.glm53.md) — outcome + corrections
  section; most rows above point into it.
- [`jj-vcs2.glm53.md`](jj-vcs2.glm53.md) — danger catalog (layout
  coupling) and ID-space analysis (stance).
- [`upstream-check-20260902.glm53.md`](upstream-check-20260902.glm53.md) —
  probe definitions for the standing watch.
- `~/ado/patches.md` (*Native Jujutsu VCS support*) — manifest entry
  tracking the line itself.
