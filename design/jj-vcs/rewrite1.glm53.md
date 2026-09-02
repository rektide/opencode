---
type: Plan
title: jj-vcs rewrite execution — batch assignments and workspace contract (rewrite1)
description: Execution plan for the rewrite0 ladder — upstream base 318a82f784 verified clean of jj content, four sequential agent batches of two commits each using the recreate-afresh method, per-batch verification gates, and the bookmark/snapshot plan that keeps every stage of the work addressable.
resource: design/jj-vcs/rewrite1.glm53.md
tags: [vcs, jujutsu, rewrite, execution, agents]
status: draft
generated: { by: agent:glm53, at: 2026-09-02T19:10:00-04:00 }
verified: { by: unassigned, at: never }
stale_after: 2026-09-16
sources:
  - id: ladder
    resource: design/jj-vcs/rewrite0.glm53.md
    title: The 8-commit ladder this doc operationalizes (approved with all four decisions resolved)
    author: agent:glm53 + human:rektide
  - id: upstream-fetch
    resource: "git fetch origin --prune @ ~/archive/anomalyco/opencode, 2026-09-02 ~19:05 EDT"
    title: v2 33dd4e3ba8 → 318a82f784 (10 commits); probes re-run clean
  - id: composed-line
    resource: "working-20260902 slice 1a7f1941..7e6345ea + rider 3c02b4b4"
    title: Tested reference content each batch lifts from
    author: rektide + agents
---

# jj-vcs rewrite execution — rewrite1

## Situation

[`rewrite0.glm53.md`](rewrite0.glm53.md) proposed the ladder; the user
approved with all decisions resolved: **recreate afresh** (not
squash-based), **8 commits**, labels kept, reclassify separate. Execution
is four sequential agent batches of two commits each, in this workspace,
each batch verified before the next starts. This doc is the assignment
sheet the agents work from and the record of setup state.

## Upstream base — verified 2026-09-02 evening

- `origin/v2` tip: **`318a82f784`** (*feat(sdk): resolve instance
  configuration from provided services #46875*), advanced 10 commits from
  the morning-check `33dd4e3ba8`.
- Delta scan: only `d4fe3758c4` (*refactor(core): pass the rebuilt value
  to State notify #46837*) touches watched files — a one-line `vcs.ts`
  change (`notify: () => State.reconcile(...)`). **Batch B must take the
  new `notify` shape**, not the composed tree's.
- Probes: `bee852b5`/`46465000`/`cc7d4ebb` all still-unmerged;
  `plugin/vcs/` still only `{git,hg}.ts`; zero `.jj` in v2 `project.ts`.
  Ours remains the only live jj line; the rewrite base is clean.

## Bookmark state (pre-rewrite, verified)

| Bookmark | At | Meaning |
| --- | --- | --- |
| `jj-vcs` (floating) | `3cf3bf20` | feature tip before the two 09-02 evening docs commits |
| `jj-vcs-20260902` | `a5542af3` | morning immutable snapshot (pre same-day fixes) |
| `jj-vcs-custom1` | `a5542af3` | duplicate of the morning snapshot |
| `jj-vcs-20260815` | `ca1d2bb5` (divergent change-id) | old snapshot; known, untouched |

Setup adds: **`jj-vcs-20260902-evening`** — immutable snapshot at the
final pre-rewrite tip (old line including this doc), then fast-forwards
floating `jj-vcs` to the same commit so nothing above `3cf3bf20` is
orphaned. **`jj-vcs-rewrite`** — construction bookmark on the new line,
fast-forwarded by the orchestrator after each verified batch.

## Workspace contract for every batch agent

- Workspace: `~/src/opencode-jj-vcs` (secondary jj workspace of the shared
  repo at `~/archive/anomalyco/opencode`). The working copy sits on a
  child of `v2@origin` `318a82f784`; all authored commits stack there.
- **Method: recreate afresh.** The composed slice
  (`1a7f1941..7e6345ea` + rider `3c02b4b4fb94`, same repo, addressable)
  is the *reference*, not the substrate. Read it with
  `jj diff -r <sha>` / `jj file show -r <sha> <path>`; read end-state
  shapes of jj-owned files in `~/src/opencode-working`; author new
  commits against the current upstream tree in the working copy. Where
  upstream's current shape diverges from the reference (e.g. the new
  `notify` signature), **upstream wins** — adapt and note the deviation.
- Only jj-vcs content. If a reference file mixes foreign feature content,
  lift only the jj hunks. Never modify `design/`, never move or delete
  bookmarks, never push, never squash.
- Style: the repo-root `AGENTS.md` in the working copy (upstream v2's) is
  binding — conventional commits (`type(scope): summary`), no import
  aliases, no `any`, Effect generator binding rules, snake_case drizzle
  fields, regenerate clients (`bun run generate` from `packages/client`)
  in the same commit as any protocol/`HttpApi` change rather than porting
  generated diffs.
- Tests: hermetic where the reference achieved it — detection tests
  fabricate `.jj/repo` layouts on disk (no `jj` binary), live tests use
  the `Bun.which("jj") ? describe : describe.skip` guard. Never run tests
  from the repo root; run from package dirs.
- Commit with `jj commit -m "<title>" -m "<body>" <files...>` — explicit
  file list, no wildcards that could sweep unrelated state.
- Report back: commit SHAs + one-line messages, verification command
  results, every deviation from the reference with a reason, anything
  deferred to a later batch.

## Batches

### Batch A — commits 1–2 (recognition + reclassify)

**C1 `feat(core): recognize Jujutsu repositories`** — reference commits
`1a7f1941`, `17b902c`, `21716f8`, plus the rider's `project.ts`
marker-order hunk from `3c02b4b4`. Content: the core `Vcs` union (`jj`
member with `store`), `jjDiscover` (fs-only: `.jj/repo` dir-or-pointer,
`realPath` store, `dirname²` canonical, `store/git_target` vs
`store/git`, cache-first identity with one `git remote get-url` probe on
miss, jj-first resolve ordering before the native scan), the
`.git`-before-`.jj` fallback order with its damaged-colocated comment,
`.jj` in ignore/ripgrep targets, the `config.ts` bit from `1a7f1941`, and
the jj blocks of `project.test.ts` (fabricated-layout tests +
`itJj`-guarded live tests: reclassification-keeps-id, nested separation,
forgotten-workspace edge, damaged-colocated fallback, workspace
boundaries). Commit body flags the identity-layer decision (unified
git/jj ID space, deliberate divergence from upstream's orphaned line).

**C2 `feat(core): reclassify VCS on project open`** — reference
`5519727`. Content: `ProjectCurrent.vcs` in schema, the server
`project.ts` handler refresh, `Project.Event` export, the
`builtins.ts` env line (`Version control: ${type ?? "none"}`), the app
bootstrap un-seeding, client regen, live colocate test.

Verify: `bun typecheck` in `packages/core` `packages/schema`
`packages/server`; `bun test test/project.test.ts` from `packages/core`.

### Batch B — commits 3–4 (provider + review)

**C3 `feat(core): add Jujutsu VCS provider`** — reference `926b1b7` +
`7e6345e` + rider hunks (provider `branches` stub, adapter return-type,
`vcs.ts` live-info read, `vcs-jj.test.ts` plugin-host harness). Content:
new `packages/core/src/vcs/jj.ts` (adapter: status/diff/info/base,
`--ignore-working-copy` on metadata commands, `main+N` label fallback),
new `packages/core/src/plugin/vcs/jj.ts` (registration mirroring
`plugin/vcs/git.ts`), `plugin/internal.ts` registration (3 lines),
`vcs.ts` live-info special case **on the new `notify` shape**, and
`vcs-jj.test.ts` (5 tests, skip-guarded).

**C4 `feat(app): review Jujutsu working-copy changes`** — reference
`557f133`: `session/review/model.ts` + `global-sync/utils.ts` (~10
lines).

Verify: typecheck `packages/core` `packages/app`; `bun test
test/vcs-jj.test.ts` from `packages/core`.

### Batch C — commits 5–6 (metadata + workspaces)

**C5 `feat(core): record worktree metadata`** — the schema half of
`a5b0e88` + rider `worktree.ts` optional/upsert hunks + `worktree/git.ts`
restyle. Content: `Worktree.GitWorktreeMetadata`/`JjWorkspaceMetadata`/
`Metadata` in `schema/worktree.ts`, `ListEntry.metadata` optional, DB
`worktree.metadata` column via **generated** migration (rerun the
generator; do not copy `20260902065751` byte-for-byte if the tool
disagrees), `sql.ts` mapping, git strategy emitting `git_worktree`,
upsert pre-metadata-row semantics, protocol output types + client regen.

**C6 `feat(core): manage Jujutsu workspaces`** — the jj half of
`a5b0e88` + `8c839c1` (canonical preserve) + `ca1d2bb5`
(strategy-from-VCS) + regen (regenerated). Content: new
`worktree/jj.ts` strategy (`jj_workspace`: create/remove/list, workspace
naming, `JjWorkspaceError`), registration beside `WorktreeGit`,
`Worktree.create` resolving `strategy ?? vcs-default` (DB lookup),
refresh filtering by project VCS with probe-everything for unclassified,
canonical-root guard, `CreateInput.strategy` optional,
`prompt/move.tsx` line, `resolveNewSessionGit` jj-awareness hunk and
`workspaces/create.ts` strategy-drop, `worktree-jj.test.ts` (6 tests).

Verify: typecheck `packages/core` `packages/schema` `packages/server`
`packages/tui` `packages/app`; `bun test test/worktree-jj.test.ts` from
`packages/core`.

### Batch D — commits 7–8 (describe + labels)

**C7 `feat(core): describe Jujutsu working copies`** — reference
`04b2b30`: `Vcs.WorkingCopy` schema, adapter `info().workingCopy`,
vcs-jj test additions.

**C8 `feat(tui): show working-copy labels`** — reference `26cb7bf` +
`62ea9b7`: TUI footer/prompt label display, `global-sync/child-store.ts`
and the controller *label* hunks (the `resolveNewSessionGit` hunk
already landed in C6 — split by hunk, not by file).

Verify: typecheck `packages/core` `packages/schema` `packages/tui`
`packages/app`; vcs-jj tests.

## Orchestrator gates (between batches)

1. Review the batch's commits (`jj diff --stat` per commit, spot-read).
2. Re-run the batch's verification commands independently.
3. Fast-forward `jj-vcs-rewrite` to the batch tip.
4. Only then start the next batch.

## Endgame

- **Parity check**: diff the finished tip's tree against the composed
  slice content for the jj-owned files (`vcs/jj.ts`, `plugin/vcs/jj.ts`,
  `worktree/jj.ts`, both test files should match modulo intentional
  adaptations; shared files match modulo upstream movement such as the
  `notify` change). Drift beyond style-level noise stops the promotion.
- **Bookkeeping**: move floating `jj-vcs` to the finished tip (the
  evening snapshot already preserves the old line), re-create the
  `design/jj-vcs/` docs as trailing `docs(design):` commits on the new
  line, update `~/ado/patches.md` (base `318a82f784`, 8 commits,
  refresh note), refresh the `jj-vcs2` stance table per rewrite0
  work-list item 3. Cache-ttl's TTL pin stays with cache-ttl.
- **Freshen discipline from here**: the line never gets promoted stale
  again; the five upstream probes run before any future freshen.

## Cross-references

- [`rewrite0.glm53.md`](rewrite0.glm53.md) — the ladder, rider fold map,
  and carryability analysis this executes.
- [`upstream-check-20260902.glm53.md`](upstream-check-20260902.md) —
  probe definitions; this doc's evening fetch re-ran them clean.
- [`jj-vcs2.glm53.md`](jj-vcs2.glm53.md) — the ID-space stance C1's body
  text flags; refreshed at endgame.
