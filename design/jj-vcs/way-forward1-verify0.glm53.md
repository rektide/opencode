---
type: Review
title: Rebuild gate verification — independent re-run of way-forward1's acceptance checks
description: Coordinator-side verification of the 17-commit rebuild on v2@origin 21adcb4969f3 — tests, typecheck, divergence shape, migration safety, and deviations of record.
resource: design/jj-vcs/way-forward1-verify0.glm53.md
tags: [jj-vcs, rebuild, verification, gate]
status: stable
generated: { by: agent:glm-5.3-high, at: 2026-09-05 }
verified: { by: agent:glm-5.3-high, at: 2026-09-05 }
sources:
  - id: outcome
    resource: design/jj-vcs/way-forward1.glm53.md
    title: Outcome — implemented 2026-09-05 (appended by the implementing session)
  - id: plan
    resource: design/jj-vcs/way-forward1.glm53.md
    title: The execution design note whose gates this records
---

# Rebuild gate verification (way-forward1-verify0)

Independent re-run of every acceptance claim in the Outcome section, from
`packages/core` on the line tip (`ed15965ec1b3`, bookmarks `jj-vcs-rebuild`
+ `jj-vcs-rektide`).

## Results

| Gate | Claim | Verified |
|---|---|---|
| Core suites | project / vcs-jj / worktree-jj / worktree pass | **76 pass, 0 fail** (7.0s) |
| Family suites | ignore / ripgrep / builtins / plugin-worktree pass | **11 pass, 0 fail** |
| Typecheck | only the pre-existing FFI failure | **one error**, `util/process-lock-ffi.bun.ts(49)` `TS2345` — file byte-identical on `v2@origin`, untouched by the line; environmental (Bun 1.4 FFI typings), not ours |
| `worktree.ts` divergence | four designed touchpoints only | **+14/−2, exactly**: jj initial-map registration beside git (`selected` stays git), `Strategy.vcs?` + `create.base?`, VCS-tag default selection via `strategies.find(s => s.vcs === location.vcs?.type)` (tag lookup, no literals — and cleaner than the plan sketched: uses `location.vcs`, no DB query), `base` forwarding. `refresh()` byte-upstream; `Editor` untouched |
| Error channel | `Worktree.OperationError` direct, no public `JjWorkspaceError` | confirmed — strategy throws schema's `OperationError` with `forceRequired`; `JjWorkspaceError` absent from core/schema surface; strategy self-catches its tag during discovery listing |
| Migration safety | guarded, replay-safe, no core DDL | `20260905043614_rektide-jj-worktree`: `sqlite_master` probe before CREATE, `pragma_table_info('worktree')` before backfill, **two** legacy shapes handled (`directory`-keyed and `id`-keyed), `INSERT OR IGNORE` replay safety, zero `worktree` DDL |
| Strategy-owned metadata | jj strategy persists its own table | `worktree/jj.sql.ts` (`JjWorktreeTable`, drizzle, json-typed metadata); persistence inside the strategy, `worktree.ts` refresh uninvolved |
| Docs re-carried | design corpus on the new line | all 12 files incl. `discovery-counter0` and `way-forward1` |

## Deviations of record

1. **Base drifted before implementation** — landed on `21adcb4969f3`
   (5 commits past the planned `23f3f8b6ca61`; Chatwoot/TUI/app fixes,
   none touching the watched seams). Satisfies the plan's freshen clause
   by construction.
2. **Bookmarks listing folded into the provider commit** rather than a
   separate rung-5 commit; content present (`vcs/jj.ts` `jj bookmark list
   --sort name`, search/limit per git semantics).
3. **Hardening fix series** (7 `fix(core)`/`test`/`refactor` commits atop
   the feature commits — sibling discovery before removal, source-workspace
   identity retention, post-cutover fallback preservation, metadata
   validation, out-of-repo discovery skip, ownership scoping, schema
   contract tests, Effect test conventions). These read as gate-driven
   iterations, each named and scoped.

## State

- Line: 17 commits on `21adcb4969f3` (`999b817`..`ed15965`).
- Bookmarks: floating `jj-vcs-rektide` **promoted** to the line tip;
  `jj-vcs-rebuild` at tip; old line preserved by `jj-vcs-rektide-20260905`
  (and the earlier snapshots). Nothing orphaned; nothing pushed.
- The internal project pass (discovery-counter option 1) was correctly
  **not** added; it remains a named follow-up in `followups.glm53.md`.

## Verdict and what remains

Gates pass. Recommend operator acceptance. Open items, none blocking:

- **Compose side**: `working` still carries the morning port (old
  architecture). The defer policy can lift — the next `working` rebuild
  should compose jj-vcs *from this line*.
- **Pre-existing FFI typecheck failure** is upstream's under Bun 1.4;
  expect it to resolve or persist independent of this line.
- **Upstream watch** unchanged: jj PRs dormant; supersession trigger
  stands.

## Cross-references

- [`way-forward1.glm53.md`](way-forward1.glm53.md) — plan + Outcome section.
- [`discovery-counter0.glm53.md`](discovery-counter0.glm53.md) — rung 4's
  decision input; location-native adopted, project pass deferred.
- [`table-ownership0.glm53max.md`](table-ownership0.glm53max.md) — the
  directive rung 2 implements; migration conforms to its idempotency rules.
- [`rewrite1.glm53.md`](rewrite1.glm53.md) — the precedent's gate pattern
  this re-runs.
