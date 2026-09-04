---
type: Guide
title: Subagent recovery freshen onto 43d09b9d
description: Refresh record for the plugin session-reads line rebased from 6a2c3e91 onto v2@origin 43d09b9d (97-commit gap), with collision audit, zero-conflict rebase, and verification.
resource: /.design/subagent/refresh1.glm53.md
tags: [opencode, v2, subagent, plugin, session, refresh, jj]
status: stable
generated: { by: llm:glm53, at: 2026-09-01T13:30:00-04:00 }
sources:
  - id: patches-manifest
    resource: file:///home/rektide/archive/doc/opencode/patches.md
    title: OpenCode patches and ideas — accepted working stack, refresh procedure, freshen guardrails
    author: human:rektide
    last_modified: 2026-09-01
  - id: prior-refresh
    resource: /.design/subagent/refresh0.glm53.md
    title: Subagent recovery freshen onto 6a2c3e91
    author: llm:glm53
    last_modified: 2026-08-30
  - id: implementation-record
    resource: /.design/subagent/final0.gpt56s.md
    title: Subagent recovery through generic plugin session reads
    author: llm:gpt56s
    last_modified: 2026-08-30
---

# Subagent recovery freshen onto 43d09b9d

## What was up

The maintained plugin session-reads line (floating bookmark `subagent-recovery`
at `9cd3b260cc52`) sat on `v2@origin` `6a2c3e91c780` with 97 upstream commits
of drift. Task: audit the gap for semantic collision against the tracked
upstream proposals, then duplicate-then-rebase the whole 10-commit line (four
research docs, three capability commits, the final design record, the cursor
alignment fix, and the prior refresh doc) onto the new tip, preserving the
originals and all dated snapshots.

**Baseline discrepancy note**: the freshen mandate named the target as
`ce6247bd2f28` ("fix(core): estimate context growth before compaction
(#46543)"). That commit does not exist anywhere in the shared jj repo — not in
any bookmark, head, or the full `::v2@origin` ancestry, and no commit with that
subject exists. The actual fetched `v2@origin` tip is
`43d09b9d75ad5d74cda5bd29ab72319e724fbbb9` ("fix(server): await plugin
activation when checking updates"), which sits **exactly 97 commits** ahead of
this feature's base — matching the mandate's own counts. The human confirmed
freshening onto `43d09b9d75ad`; the mandate's hash/subject were simply wrong.

## Collision audit (before touching anything)

**No semantic collision.** Neither tracked proposal —
[#43556](https://github.com/anomalyco/opencode/pull/43556) (plugin session
history reads) nor [#39939](https://github.com/anomalyco/opencode/pull/39939)
(cursor pagination) — landed in the 97-commit gap, and no other commit adds
plugin session-read surface:

- `packages/plugin/src/effect/session.ts` and
  `packages/plugin/src/promise/session.ts` are untouched by the gap.
- The gap's plugin-area landings are all on other seams: `5d73a5789ffb` live
  package updates (adds `packages/core/src/plugin/update.ts`, drops the
  plugin `vcs` member), `6a99898ef70f` tool namespaces (#46487), `d4b4dd17cce2`
  rename plugin flush to awaitActivation, `43d09b9d75ad` await plugin
  activation on update checks.
- `3e9b009642ba` (session-aware instance selection, #46442) reworks
  `session.ts` internals (an `Instance.Service` replaces `RcMap` location
  lookups) and restructures `plugin/host.ts`'s return into a named
  `const context: Plugin.Context` — but it does not change the
  `Session.Interface` members (`list`, `messages`, `inbox`, `active`) this
  feature consumes, nor the plugin context's `session` domain.
- File-level intersection of the gap with the feature's 14-file footprint is
  exactly four files (`host.ts`, `plugin/runtime.ts`, `promise/adapter.ts`,
  docs `plugins/index.mdx`), all with disjoint-region or insertion geometry.

## Rebase

Duplicate-then-rebase per the manifest: duplicated
`6a2c3e91c780.."subagent-recovery"` (originals untouched under their
change-ids and snapshots), then rebased the duplicate bottom
(`0b56c6a60ab3`, change `sxpvvkwsykyz`) onto `43d09b9d75ad`.

### Conflicts: 0

The rebase completed with no conflicts and **no post-rebase adaptations**.
Every feature hunk is a pure insertion whose surrounding context upstream did
not modify:

- `host.ts` — the feature's cursor-codec/helpers insert above the return
  statement and its `session` members insert inside the context object;
  upstream's `return {...} satisfies` → `const context: Plugin.Context = {` …
  `return context` refactor changed adjacent-but-not-overlapping lines, and
  the merge adopted upstream's named-context structure with the feature's
  helpers above it (line 113–167) and members inside it (lines 515–524).
- `plugin/runtime.ts` — feature hunks (the `Pick` widening and the
  `list`/`inbox`/`active` service members) are disjoint from upstream's
  `layerWithCell` return-type annotation.
- `promise/adapter.ts` — feature regions (~226–300, ~559–571) are disjoint
  from upstream's `vcs` removal (~214) and `namespace` addition (~465).
- docs `plugins/index.mdx` — feature's Sessions section (~646–698) is disjoint
  from upstream's tool-namespace (~799) and hooks-reorganization (~1010)
  sections.

### Commit mapping (old → freshened)

| Old | New | Subject |
| --- | --- | --- |
| `d6d09fac2e13` | `0b56c6a60ab3` | docs(design): subagent host read surface research |
| `d2bc4020c388` | `0d2d7a7ff109` | docs(design): confirm session reads reuse generated SDK surface |
| `18884ffd387f` | `8db50e505281` | docs(design): carryability rules for the session read patch |
| `6773addaecfa` | `3530bd840b0a` | docs(design): draft upstream-aligned session reads |
| `a0f9eac56985` | `81dbe6302447` | feat(plugin): expose paginated session history reads |
| `3efb5d7e9751` | `aae913c0d3cd` | feat(plugin): expose session inbox and active reads |
| `01bef32e9b3f` | `80f87c269a73` | fix(plugin): preserve session read pagination semantics |
| `5cc20da5ab7e` | `d3724893cb64` | docs(subagent-recovery): record plugin session read replacement |
| `ae21a8571738` | `f82436ed4d80` | fix(plugin): align session cursor with protocol |
| `9cd3b260cc52` | `42f1387f216a` | docs(subagent-recovery): record refresh onto 6a2c3e91 |

### Diffstat vs the previous version of the feature

The freshened line's footprint on the new base is **byte-identical in file
list and per-file line counts** to the previous line's footprint on the old
base: 14 files, +1741/−9 (four `.design/subagent/*.md` docs, `client/src/promise/api.ts`
alias, `core/src/plugin/{host,runtime}.ts`, `core/test/plugin/host.ts`,
`core/test/plugin-session-reads.test.ts` + `plugin-session.types.ts`,
`plugin/src/{effect,promise}/session.ts`, `promise/adapter.ts`, and the docs
`index.mdx`). **The freshened line touches no file the old line did not
touch**, and nothing was dropped or adapted because upstream changed.

## Result

- Freshened code tip `42f1387f216a` (change `uokzstktrnpv`), 10 commits
  directly on `43d09b9d75ad`, verified by explicit template count.
- This docs commit sits above it; floating `subagent-recovery` advanced to the
  docs tip and dated snapshot `subagent-recovery-20260901` created at the same
  commit. Immutable `subagent-recovery-20260830` and earlier untouched.
- Workspace `@` left as an empty commit on the new tip.

## Verification (from package directories)

| Check | Result |
| --- | --- |
| `packages/core` `bun test test/plugin-session-reads.test.ts` | **4 pass**, 0 fail, 18 expect() calls — pagination through the Effect host, inbox/active facts, Promise history adaptation, Promise inbox/active adaptation |
| `packages/core` `bun typecheck` (`tsgo -b tsconfig.json tsconfig.tests.json`) | clean (exit 0) |
| `packages/client` `bun typecheck` | clean (exit 0) |
| `packages/plugin` `bun typecheck` (incl. `tsconfig.tests.json`) | clean (exit 0) |
| `packages/www` `bun typecheck` | clean, 0 hints (feature edits docs `index.mdx`) |

`bun install` at the workspace root ran clean and did not rewrite `bun.lock`.

## Confidence

High. The 97-commit gap was audited at subject level for the whole gap and at
diff level for every file intersecting the feature footprint; the rebase
produced zero conflicts and a byte-identical footprint, so no judgment calls
were made inside feature hunks. Uncertainties worth recording:

- The mandate's stated baseline hash did not exist; the human confirmed
  `43d09b9d75ad` (see above). If the other same-day freshen agents received
  the same bad hash, they need the same correction.
- The `packages/www` production build and `check:generated` were not rerun
  this time (prior refresh ran them). The feature's docs edit is confined to
  hand-written `index.mdx` content and the typecheck is clean, so risk is
  low, but the next `working` rebuild should include them.
- The companion plugin (`~/src/opencode-subagent-control`) was not re-verified;
  the public shapes it targets did not change, but a live `subagent_list`
  smoke test against the freshened host remains worth doing at the next
  `working` rebuild (same note as the prior refresh).
- Upstream `43d09b9d` makes servers await plugin activation before update
  checks (`d4b4dd17cce2`/`43d09b9d`) — adjacent to plugin lifecycle, not to
  session reads; noted for awareness only.

## Cross-references

- [`refresh0.glm53.md`](/.design/subagent/refresh0.glm53.md) — prior freshen
  onto `6a2c3e91`; this refresh's geometry notes carry forward.
- [`final0.gpt56s.md`](/.design/subagent/final0.gpt56s.md) — implementation
  record; the capability commits remain replaceable by upstream #43556/#39939
  as described there.
- [`patches.md`](file:///home/rektide/archive/doc/opencode/patches.md) —
  refresh procedure, bookmark convention, and reporting checklist this
  document satisfies.
