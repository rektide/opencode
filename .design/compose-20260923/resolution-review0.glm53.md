---
type: Review # kind of knowledge
title: Resolution review — halted 2026-09-23 compose of jj-vcs-rektide
description: Verdicts on bd3b8561 and 5e102048 conflict resolutions; stale-content and ghost-import findings; friction-report facts.
resource: file:///home/rektide/src/opencode-working/.design/compose-20260923/resolution-review0.glm53.md
tags: [compose, jj, conflict-resolution, review]
status: stable
generated: { by: agent:glm-5.3-high, at: 2026-09-23T23:20:00-04:00 }
verified: { by: unverified, at: 2026-09-23 }
stale_after: 2026-10-23
sources:
  - id: compose-session
    resource: file:///home/rektide/src/opencode-working
    title: Halted Phase-2 compose session workspace, 2026-09-23
  - id: upstream-repo
    resource: file:///home/rektide/archive/anomalyco/opencode
    title: Shared upstream checkout (read-only reference)
---

# Resolution review — halted 2026-09-23 compose of jj-vcs-rektide

Model: glm53 (zai-coding-plan/glm-5.3#high), wave `resolution-review0`.

## Context recap

A direct Phase-2 compose ran 2026-09-23 ~00:24–00:55 EDT in this workspace,
composing 2026-09-22-freshened feature lines onto upstream tip `d5d4461e`
(~50 commits past wave baseline `dcfe1ec7`). pulse-3fps(16), term-v2(30),
subagent-recovery(22), export-qa(8) composed cleanly; jj-vcs-rektide
conflicted (its third halt) and the session stopped ~4-of-35 feature commits
in. The freshened feature line — the trusted reference for feature intent —
survives intact at bookmark `jj-vcs-rektide` = `a3225c9c` (35 own commits on
`dcfe1ec7`).

Landed compose-era chain (oldest→newest):

| landed | maps to fresh-line commit | state |
|---|---|---|
| `12a01844` feat(core): recognize Jujutsu repositories | `4a1f998a` | composed ok |
| `f71da7df` feat(core): reclassify VCS on project open | `91ce24cb` | landed WITH conflict markers |
| `5e102048` fix(server): rehome VCS reclassification in location get | `e3e5a63` | resolution (also a real feature commit) |
| `1809bb1d` feat(core): add Jujutsu VCS provider | `e42fdc68` | landed WITH conflict markers |
| `bd3b8561` "docs(compose): record 2026-09-23 composition friction report" | ≈ intent of `1fc681b4` "register Jujutsu provider with current internal plugins" | resolution, mislabeled message |

Then 4 unrelated "opencode-args" rider commits → candidate tip `fdbd820a`.
A divergent copy `a1d1f26e` (same description as `f71da7df`) heads an
abandoned orphan chain; the conflict markers inside `1809bb1d` reference two
*other* stale copies — `xzyypnul 44518b01` and `sroourus 58b3dc41` — with
change-ids that match neither the landed commits nor the freshened line.

## Headline finding: the compose landed pre-freshen content, not the freshened line

This review's central discovery, from which the per-commit verdicts follow:

- Of the 56 files the freshened feature line touches, **48 differ** between
  `a3225c9c` and `fdbd820a`. Excluding files shared with upstream (where
  `dcfe1ec7..d5d4461e` drift legitimately diverges them), **21 are files the
  feature created** — upstream drift cannot explain those.
- Of those 21: 17 are simply **missing** at the tip (all 14 `design/jj-vcs/`
  docs, migration `20260905043614_rektide-jj-worktree.ts`, `worktree/jj.sql.ts`,
  `worktree/jj.ts`, `test/worktree-jj.test.ts`) — consistent with the halt at
  ~4/35 (the worktree slice is later feature commits).
- The 3 that DID land — `packages/core/src/vcs/jj.ts`,
  `packages/core/src/plugin/vcs/jj.ts`, `packages/core/test/vcs-jj.test.ts` —
  all carry **pre-freshen, earlier-era content**:
  - old `@opencode-ai/*` package scope (workspace packages migrated to
    `@opencode/*` upstream on 2026-09-07 by `a5312e169b`, before the wave
    baseline; the freshened line's versions correctly use `@opencode/*`).
  - `vcs/jj.ts` is missing the entire bookmarks / working-copy-label slice
    (~90 lines: `bookmarks()`, `nearest()` fallback e.g. `main+5`, `info()`
    with change-id/commit-id/conflict/workspace reporting); it returns
    `{ branch: {} }` where the fresh line returns `{ branch: {}, workingCopy }`.
  - `plugin/vcs/jj.ts` has a stub `branches: () => Effect.succeed([])` with an
    apologetic comment, where the fresh line wires
    `adapter.branches({ search, limit })`.
  - `vcs.ts` (shared file, but same pattern) drops
    `provider: provider.id` from the `current.info` assignment the fresh line
    adds.

The conflict markers inside `1809bb1d` corroborate this mechanically: their
sides (`44518b01`, `58b3dc41`) contain `SystemPromptPlugin`/`VariantPlugin`
imports as *context* — plugin modules that existed in an older upstream era
(`720f062` added `plugin/system-prompt.ts` 2026-07-15; `#48943 2226afaea5`
2026-09-14 removed `plugin/system-prompt.ts` and `plugin/variant.ts`, before
the 09-22 baseline). No ancestor of the compose base contains those imports.
The session was rebasing stale copies from an earlier attempt, not the
freshened `a3225c9c` line — that is why the conflicts were non-mechanical
and why the landed content is old.

## Per-commit verdicts

### 1. `bd3b8561` — PRIMARY — resolution in `packages/core/src/plugin/internal.ts` (+5/−15)

**Verdict: UNSOUND as landed — correct union of VcsJjPlugin, but retains two
ghost imports and one ghost registration that break typecheck.**

- What it did: replaced the two jj conflict blocks with a union — kept
  upstream/compose-base imports (`ToolInputRepairPlugin`, `OptimizePlugin`),
  added `VcsJjPlugin` (feature intent), and **kept
  `SystemPromptPlugin`/`VariantPlugin` lines that were only context inside the
  stale conflict sides**.
- (a) upstream structure at `d5d4461e` preserved: yes, modulo the feature's
  own additions. `internal.ts` had **zero upstream drift**
  (`dcfe1ec7` == `d5d4461e` byte-identical for this file), so the only
  legitimate delta on top of upstream was the feature's.
- (b) feature intent preserved: the `VcsJjPlugin` import (`internal.ts:102`)
  and single registration (`internal.ts:228`, placed after `VcsHgPlugin.Plugin`)
  match the freshened line's placement exactly — that part is right.
- The failure: `internal.ts:103`
  `import { SystemPromptPlugin } from "./system-prompt.js"` and `:104`
  `import { VariantPlugin } from "./variant.js"` reference modules that do not
  exist in the tree (only `plugin/system-prompt/*.txt` and
  `packages/core/src/session/system-prompt.ts` / `src/variant.ts` exist — not
  what those specifiers resolve to), and `internal.ts:229`
  `...SystemPromptPlugin.Plugins` registers the ghost. `VariantPlugin` is
  imported but never used at all. Verified: `rg "SystemPromptPlugin|VariantPlugin"`
  over the whole tip tree matches **only** `internal.ts` itself. Typecheck
  confirms (below).
- Correct resolution would have kept exactly the freshened line's delta:
  `VcsJjPlugin` import + `VcsJjPlugin.Plugin` registration, nothing else.

### 2. `5e102048` — rehome of VCS reclassification

**Verdict: SOUND.** Upstream wanted `location.get` returning the stored
project (`project: location.project`); the feature wanted fresh
reclassification on get. The resolution — and the landed file at `fdbd820a` —
is **byte-identical to the freshened line's**
`packages/server/src/handlers/location.ts` (53 lines): resolve the project,
`locations.invalidate(Location.Ref...)` on id/directory/canonical/vcs-type
mismatch, publish `Project.Event.Updated` when a bus is present, and return
the resolved fields. Its other two resolutions are also right:
`bootstrap.ts` matches both upstream `d5d4461e` and the freshened line
(`location.get` → `location.project.id`), and generated `types.ts` cleanly
drops the duplicated `ProjectCurrent`/`initialized?` definitions with zero
remaining references at the tip.

### 3. `f71da7df` / `1809bb1d` — the conflicted commits

Landed with jj conflict markers in their trees (their parent→self diffs
contain `<<<<<<< conflict` blocks). Both were fully neutralized by their
resolutions (`5e102048`, `bd3b8561`) in the marker sense — no markers remain
anywhere at the tip — but their *content* is the pre-freshen era (see headline
finding), which is the real defect.

## Upstream-drift findings for touched files

- `packages/core/src/plugin/internal.ts`: **no drift**
  (`dcfe1ec7` == `d5d4461e`).
- `packages/server/src/handlers/location.ts`: no drift relevant to the
  rehome; landed == fresh line.
- `packages/app/src/runtime/server/global-sync/bootstrap.ts`: drifted
  upstream from `project.current` to `location.get`; resolution matches
  upstream and fresh line.
- Scope migration `a5312e169b` (2026-09-07, in baseline) means anything still
  importing `@opencode-ai/core|util|schema|plugin` is stale.
  `provider.ts:32` and `persistent-pty/pty-binding.ts:2` old-scope references
  are **pre-existing upstream** (external npm package + string shim) — not
  compose damage.

## Typecheck result

`bun typecheck` from `packages/core` (tsgo), working copy at the tip region:

```
src/plugin/internal.ts(103,36): error TS2307: Cannot find module './system-prompt.js' ...
src/plugin/internal.ts(104,31): error TS2307: Cannot find module './variant.js' ...
test/vcs-jj.test.ts(7-11):    error TS2307: Cannot find module '@opencode-ai/core/{bus,location,schema,vcs,plugin/vcs/jj}' (5 errors)
test/vcs-jj.test.ts(133,30):  error TS7006: Parameter 'item' implicitly has an 'any' type. (downstream of the failed Vcs import)
```

8 errors, **all introduced by the compose-era commits** (2 by the `bd3b8561`
resolution; 6 by the stale test file landed by `1809bb1d`). The known
pre-existing upstream error in `process-lock-ffi.bun.ts` did not appear in
this run. Note `src/vcs/jj.ts` and `src/plugin/vcs/jj.ts` old-scope imports
do *not* error — `@opencode-ai/{util,schema,plugin}` still resolve via
installed packages — so they are silently inconsistent rather than loud.

## Message/content mismatch (for the record)

`bd3b8561`'s message says `docs(compose): record 2026-09-23 composition
friction report`, but its entire diff is the 1-file internal.ts conflict
resolution. No `.design/compose-20260923*` path, no friction report, no doc
of any kind exists in the tree (`.design/` holds only export-qa,
pulse-3fps, subagent, term-v2).

## Final-tree hygiene

- `rg '^<<<<<<< conflict'` across the tree (excluding `.jj`): **clean**; the
  single hit `.design/subagent/refresh-20260904.glm53.md` is a Sept-4 design
  doc that quotes marker syntax (added by `c76f506e`, 2026-09-04 — predates
  this compose).
- No duplicated registrations or double imports in `internal.ts` (one
  `VcsJjPlugin` import, one registration).
- Missing-at-tip feature files (worktree slice, migration, tests, docs) are
  an *incomplete landing*, not hygiene damage — expected from a 4/35 halt.

## What the friction report should say

A future compose-friction report for this run must record:

1. **Mislabeled resolution commit**: `bd3b8561` claims to add a friction
   report doc but actually resolves the `internal.ts` conflict; the doc was
   never written. Do not trust its message when archaeologging.
2. **Halt point**: jj-vcs-rektide halted ~4-of-35 commits; landed region =
   `12a01844`, `f71da7df`(markers), `5e102048`, `1809bb1d`(markers),
   `bd3b8561`; the worktree/migration/docs slice (17 created files) never
   landed.
3. **Root cause is stale-source, not marker complexity**: the session
   composed pre-freshen copies (conflict sides `xzyypnul 44518b01`,
   `sroourus 58b3dc41`; content matches the pre-scope-migration,
   pre-`#48943` era) instead of freshened `a3225c9c` — which is why this
   feature's conflicts were non-mechanical the third time running. Compose
   sessions must verify the source bookmark/commit of each feature line
   before rebasing (`jj log -r <feature-bookmark>` and a content spot-check).
4. **Landed damage requiring follow-up** (before any promotion of this
   chain): two ghost imports + ghost registration in
   `packages/core/src/plugin/internal.ts:103-104,229`; stale pre-freshen
   `vcs/jj.ts`, `plugin/vcs/jj.ts`, `test/vcs-jj.test.ts` (old scope,
   missing bookmarks/workingCopy slice, stub `branches`); `vcs.ts` missing
   `provider` tagging; 8 typecheck errors. Recommended remedy: re-compose
   from `a3225c9c` rather than patching forward.
5. **Orphan chain**: divergent `a1d1f26e` heads an abandoned orphan chain
   (same description as `f71da7df`) — to be abandoned, not merged.
6. **Store/environment issues**: CIFS-backed jj store flakiness during the
   run; a missing commit object `ad5e582e` exists in the repo but is not
   reachable from any reviewed commit; conflict-budget pressure on the
   session. All reviewed tips verified fully present at review time.

## Cross-references

- Freshened-line refresh docs: `design/jj-vcs/refresh-20260922.gpt56solx.md`
  (on the feature line) — the freshen whose output was bypassed.
- Subagent-refresh precedent with conflict-marker content:
  `.design/subagent/refresh-20260904.glm53.md`.
- Scope migration upstream: `a5312e169b refactor(packages): migrate to the
  opencode npm scope (#47852)`; plugin removals: `2226afaea5 (#48943)`,
  `2823b886d7 (#47559)`.
