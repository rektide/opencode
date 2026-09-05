---
type: Plan
title: jj-vcs way-forward execution — decisions resolved, five rungs, per-rung gates (way-forward1)
description: Execution design note operationalizing way-forward0 — operator decisions from 2026-09-05 folded in, upstream slot check for metadata, the strategy-owned-metadata refinement that keeps worktree.ts refresh byte-upstream, bookmark plan, and gates.
resource: design/jj-vcs/way-forward1.glm53.md
tags: [jj-vcs, worktree, rewrite, execution, plan]
status: draft
generated: { by: agent:glm-5.3-high, at: 2026-09-05 }
sources:
  - id: ladder
    resource: design/jj-vcs/way-forward0.glm53.md
    title: The proposal this note operationalizes
  - id: counter
    resource: design/jj-vcs/discovery-counter0.glm53.md
    title: Discovery counter-position (operator-requested); rung 4's shape pends its blessing
  - id: directive
    resource: design/jj-vcs/table-ownership0.glm53max.md
    title: Table-ownership directive; rung 2 implements its phases 1–3
  - id: precedent
    resource: design/jj-vcs/rewrite1.glm53.md
    title: The 2026-09-02 rewrite whose method and gates this re-runs
  - id: upstream
    resource: jj:v2@origin@23f3f8b6ca61
    title: Rebuild base, probed clean 2026-09-05
---

# Way-forward execution — way-forward1

## Operator decisions, resolved 2026-09-05

1. **Sequencing: design notes first.** This note plus
   [`discovery-counter0.glm53.md`](discovery-counter0.glm53.md) precede any
   implementation; rungs start on blessing.
2. **Discovery (rung 4): location-native**, per the counter-position's
   recommendation — pending the operator reading it. The counter doc prices
   the upgrade path (internal project pass) with concrete triggers; that
   option is **not** in this ladder. Recorded as a named follow-up, never a
   hot-path switch.
3. **Metadata home: `rektide_jj_worktree` own table** — *unless* a clear
   upstream slot exists. Slot check performed: upstream
   `schema/src/worktree.ts` at `23f3f8b6ca61` offers `Directory{directory,
   strategy?}`, `ListEntry{directory, type}`, `OperationError`, and the new
   `ConfigWorktree.Info{directory}` — **no metadata-bearing slot anywhere**.
   The table stands.
4. **Base: current `v2@origin` tip `23f3f8b6ca61`**, probes re-run clean
   (below). Freshen before promotion if origin moves mid-ladder; the ladder
   is per-rung gated.

## Base verification (2026-09-05)

- `plugin/vcs/` at `23f3f8b6ca61`: `{git, hg}.ts` only — no jj. ✓
- Upstream `project.ts`: zero `.jj` references (identity layer is purely
  ours; `7ba5f3e5..23f3f8b6` did not touch `project.ts`). ✓
- Upstream jj PRs (`bee852b5`, `46465000`, `cc7d4ebb`, `jj-vcs-plugin`):
  still dormant — ours remains the only live line. ✓
- Collision surface confirmed 11 files, all worktree-subsystem, generated
  client, and two TUI/app spots. The bottom three commits and the tail
  hardening are outside it.

## The refinement beyond way-forward0: strategy-owned metadata

The halted stack threaded metadata through `worktree.ts` (`ops.create`
pre-check, refresh-time preservation). The rebuild instead makes the **jj
strategy own its persistence**, using its own `Database.Service`
dependency:

- **list-time**: `WorktreeJj.list()` idempotently upserts each entry's
  metadata into `rektide_jj_worktree`, preserving a stored `base` when the
  workspace name matches (the one non-derivable field). Runs inside the
  discovery loop; a crash mid-pass heals on the next refresh. This also
  fixes assessor 1's backfill wart by construction: a row registered by
  `Project.persist` without metadata **acquires** metadata on first
  discovery, because the upsert keys on the strategy's own table, not on
  the worktree row's change-detection.
- **create-time**: after `jj workspace add`, the strategy writes full
  metadata including `base`.
- **remove-time**: the strategy reads its table (dual-read, below) for the
  safety ladder and identity check, then deletes its row.

Then **`worktree.ts` refresh stays byte-identical to upstream**. The entire
core footprint of the feature's worktree half becomes:

1. initial-map registration of the jj strategy beside `WorktreeGit` (plus
   its deps in `makeLocationNode`),
2. `Strategy` gains optional `vcs?: ProjectSchema.Vcs["type"]` and optional
   `create` input `base?: string` (interface extension; `worktree.ts`
   forwards `input.base`),
3. default-strategy selection in `create` via **lookup by `vcs` tag**
   (fixing assessor 0's call-7 wart — no literal `=== "jj"` checks), falling
   back to `state.selected` for unclassified projects,
4. `ListEntry` re-homed to `schema/src/worktree.ts` **with** optional
   `metadata: Worktree.Metadata` (additive; the halted stack's "model call"
   per assessor 0 verdict 6).

Errors: `JjWorkspaceError` **drops from the public core union**. The jj
strategy surfaces `Worktree.OperationError` directly (schema-owned, carries
`forceRequired`); `operationError()` needs no jj special-case. Kills
assessor 1's seam-leakage finding and shrinks the `worktree.ts` error-union
divergence to zero.

Registration shape — **builtin initial-map, not `Editor.add`** — recorded as
a named decision: `Editor.add` sets `selected`, so plugin-registering jj
would flip every project's default strategy; `vcs`-tag lookup gives jj
projects the right default without touching editor semantics (assessor 1's
finding, adopted).

`remove()` under the narrowed upstream `Strategy.remove({directory, force})`:
the strategy self-serves context — a live sibling for `jj workspace forget`
is found from its own table (any other known workspace row; the old line's
"cannot forget the only registered workspace" error preserved), stored
metadata from its table. No interface superset, no `sourceDirectory`
parameter.

## The rungs

Serialized; one rung at a time; coordinator validates before the next.
Method throughout: **recreate afresh** on `23f3f8b6ca61`; the current line
(`jj-vcs-rektide`) and the halted 62-commit stack in `opencode-working` are
*references* (`jj diff -r` / `jj file show`), never substrates.

**Rung 1 — recognition and identity** (salvage, slid clean tonight).
`feat(core): recognize Jujutsu repositories`; `feat(core): reclassify VCS on
project open`; `feat(core): add Jujutsu VCS provider` — the VCS-provider
plugin work is already native (`plugin/vcs/jj.ts`, `ctx.vcs.transform`).
Verify: typecheck core/schema/server; `bun test test/project.test.ts
test/vcs-jj.test.ts` from `packages/core`.

**Rung 2 — metadata migrate-away** (design change per the directive).
`rektide_jj_worktree (id text PRIMARY KEY, metadata text NOT NULL)`, id =
worktree directory. Declared in the drizzle schema (fresh DBs bootstrap it
via `schema.up`) **plus** one hand-written guarded migration for legacy DBs:
`sqlite_master` probe → `CREATE TABLE` if absent → backfill
`INSERT OR IGNORE ... SELECT id, metadata FROM worktree WHERE metadata IS
NOT NULL` guarded by `pragma_table_info('worktree')`. Dual-read: our table
first, legacy column for pre-cutover rows. Never touch `worktree` again;
never drop the legacy column. Verification: the directive's three-worlds
matrix (fresh bootstrap; `20260902065751`-journaled;
`20260902185913`-journaled) + a backfill-wart regression test
(persist-registered row acquires metadata on discovery).

**Rung 3 — jj strategy as native initial-map strategy** (the refinement
above). `feat(core): manage Jujutsu workspaces` re-derived: `worktree/jj.ts`
on the narrowed interface, `rektide_jj_worktree` read/write inside the
strategy, `--ignore-working-copy` discipline carried, errors as
`Worktree.OperationError`. Verify: typecheck core/schema/server/tui/app;
`bun test test/worktree-jj.test.ts test/worktree.test.ts` (upstream's
restructured suite adopted on its own terms — no edited expectations beyond
additive metadata).

**Rung 4 — discovery, location-native** (pending counter blessing).
`worktree.ts` refresh upstream-verbatim; the strategy's list-time upsert
does the metadata work. This rung may be near-empty as a diff — its content
is proving the shape: `worktree-jj.test.ts` re-fitted to upstream's
Location/Global fixture idiom with **per-test roots** (fixing assessor 0's
shared-fixture wart), explicit jj-sibling and fleet-discovery tests.

**Rung 5 — workspace management and small hardening** (salvage). `base`
input end-to-end (schema `CreateInput.base` additive, strategy create,
`--ignore-working-copy` listing already carried), bookmarks
(`e68b5847` content), working-copy labels (TUI, `persistence.ts`), ignores /
ripgrep / builtins env line. Verify: full focused family — vcs-jj 6 +
worktree-jj 6 + worktree (upstream count) + project 30 + ignores 10 — and
typecheck across core/schema/server/tui/app.

## Gates, bookmarks, endgame

- **Gate per rung**: `jj diff --stat` review, independent re-run of the
  rung's verification, then fast-forward the construction bookmark
  `jj-vcs-rebuild` to the rung tip.
- **Pre-rebuild snapshot**: after these docs land, snapshot the old line as
  `jj-vcs-rektide-20260905`; floating `jj-vcs-rektide` stays on the old tip
  until endgame (nothing orphaned, pattern per rewrite1).
- **Endgame**: parity check against the halted stack's behavioral spec (the
  110-test green run) modulo intentional adaptations; promote floating
  `jj-vcs-rektide`; re-carry `design/jj-vcs/` docs as trailing `docs(design)`
  commits; update [`followups.glm53.md`](followups.glm53.md) (add the
  internal-project-pass option with its triggers; resolve the backfill wart
  row); refresh [`jj-vcs2.glm53.md`](jj-vcs2.glm53.md) stance table;
  `~/ado/patches.md` note (base `23f3f8b6ca61`, five rungs).

## Compose policy until the rebuild lands

Defer jj-vcs from `working` rebuilds; `working-20260904`'s morning port
stays the accepted carrier. If a rebuild is needed first, compose without
jj-vcs and record the exclusion.

## Supersession trigger (unchanged)

Upstream jj line merging (`#45009` / `jj-vcs-plugin` revived, or a new jj
line) — then rungs 3–4 re-aim at *their* seams; rungs 1–2 survive either
way.

## Cross-references

- [`discovery-counter0.glm53.md`](discovery-counter0.glm53.md) — rung 4's
  decision input; the operator's read of it is the last open blessing.
- [`way-forward0.glm53.md`](way-forward0.glm53.md) — the diagnosis this
  executes; open questions 1–4 all now answered above.
- [`table-ownership0.glm53max.md`](table-ownership0.glm53max.md) — rung 2's
  directive; idempotency rules bind the hand-written migration.
- [`rewrite1.glm53.md`](rewrite1.glm53.md) — precedent for method, gates,
  bookmark choreography; its outcome table is the lineage history.
- Halted stack (`opencode-working`, unbookmarked, on `23f3f8b6ca61`):
  reference for seam shapes and the behavioral spec. Read, never graft.

# Outcome — implemented 2026-09-05

The rebuild landed from scratch on the freshly fetched `v2@origin`
`21adcb4969f3` (five unrelated upstream commits beyond the planned base
`23f3f8b6ca61`; none touched the watched jj/worktree seams).

The implementation keeps the intended layering:

1. recognition, reclassification, and the VCS provider;
2. `rektide_jj_worktree` ownership and migration cutover;
3. the built-in VCS-tagged JJ workspace strategy on upstream's
   location-scoped Worktree service;
4. location-native fleet discovery, without a project-wide wire surface;
5. working-copy identity, bookmarks, labels, and the existing snapshot
   hardening.

The migration is deliberately replay-safe. It probes `sqlite_master` before
creating the owned table, probes `pragma_table_info('worktree')` before
backfill, supports both historical migration journal lineages, and uses
`INSERT OR IGNORE` so a later replay cannot overwrite newer owned metadata.
Fresh bootstrap declares the owned table and the upstream `worktree` shape
without `metadata`. Existing legacy columns are neither altered nor dropped.
Runtime reads prefer the owned row and retain a guarded legacy fallback for
rows written by an older binary after cutover.

`Worktree.refresh()` retains upstream's location-native algorithm. The only
shared-file changes are built-in JJ registration, strategy `vcs`/`base`
capabilities, VCS-tag default selection, and forwarding `base`. JJ list-time
persistence owns metadata discovery and preserves a matching workspace's
creation base. The optional internal project pass from
[`discovery-counter0.glm53.md`](discovery-counter0.glm53.md) was **not** added;
it remains a clean follow-up with explicit triggers in
[`followups.glm53.md`](followups.glm53.md).

Focused migration, project, provider, JJ-workspace, and upstream Worktree
tests pass. Package typechecking reaches only the pre-existing Bun 1.4
`process-lock-ffi.bun.ts` pointer typing failure; the changed Worktree and JJ
surfaces produce no type errors.
