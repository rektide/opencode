---
type: Guide
title: Subagent recovery freshen onto 6a2c3e91
description: Refresh record for the plugin session-reads line rebased from 4afd8e81 onto v2@origin 6a2c3e91 (typed RPC/custom events), with conflict resolutions and verification.
resource: /.design/subagent/refresh0.glm53.md
tags: [opencode, v2, subagent, plugin, session, refresh, jj]
status: stable
generated: { by: llm:glm53, at: 2026-08-30T22:30:00-04:00 }
sources:
  - id: patches-manifest
    resource: file:///home/rektide/archive/doc/opencode/patches.md
    title: OpenCode patches and ideas — accepted working stack, refresh procedure, freshen guardrails
    author: human:rektide
    last_modified: 2026-08-30
  - id: patches-apply
    resource: file:///home/rektide/archive/doc/opencode/patches-apply.md
    title: Building the working composition — duplicate-then-rebase mechanics
    author: human:rektide + agent
    last_modified: 2026-08-29
  - id: upstream-typed-rpc
    resource: https://github.com/anomalyco/opencode/commit/6a2c3e91c780
    title: "feat(plugin): add typed rpc and custom events (#46105)"
    author: github:Dax
    last_modified: 2026-08-30
  - id: implementation-record
    resource: /.design/subagent/final0.gpt56s.md
    title: Subagent recovery through generic plugin session reads
    author: llm:gpt56s
    last_modified: 2026-08-30
---

# Subagent recovery freshen onto 6a2c3e91

## What was up

The maintained plugin session-reads line (bookmarks `subagent-recovery` /
`subagent-recovery-20260830`, tip `bae8e75b2be5`) sat on `v2@origin`
`4afd8e81be59`. Upstream advanced by exactly one commit to
`6a2c3e91c780` — `feat(plugin): add typed rpc and custom events (#46105)` —
which reworks several of the same files this feature carries: `host.ts`,
`promise/adapter.ts`, `promise/api.ts`, the plugin test fixtures, and the
plugin docs. The task: audit for semantic collision first, then
duplicate-then-rebase the full nine-commit line (research and docs commits
included) onto `6a2c3e91`, preserving the originals and the same-date
immutable snapshot.

## Collision audit (before touching anything)

- **Gap contents**: `4afd8e81..6a2c3e91` is one commit, #46105. Nothing else.
- **No session-read supersession**: upstream #46105 adds a plugin `rpc` domain
  (portable RPC definitions, custom `rpc.*` events, `Rpc.Service` in the host)
  and does not touch `packages/plugin/src/{effect,promise}/session.ts`,
  `packages/core/src/plugin/runtime.ts`, or the `session` blocks of
  `host.ts`/`adapter.ts`. Neither tracked upstream proposal —
  [#43556](https://github.com/anomalyco/opencode/pull/43556) (history reads)
  nor [#39939](https://github.com/anomalyco/opencode/pull/39939) (shared
  cursor codecs) — landed in this gap. The carried paginated
  `list`/`children`/`messages` plus read-only `inbox.list`/`active()` surface
  has no upstream competitor, so no bail-out applies.
- **Overlap shape**: five shared files, all additive-union geometry (upstream
  inserts an `rpc` member beside the feature's `session` members; nothing
  edits the same lines). Mechanical per the freshen guardrails.

## Rebase

Duplicate-then-rebase per `patches-apply.md`: duplicated
`4afd8e81..bae8e75b` (originals untouched under their change-ids and
`subagent-recovery-20260830`), rebased the duplicate bottom onto
`6a2c3e91c780`.

### Conflicts: 2, both in `packages/core/src/plugin/host.ts`, both unions

1. **`4a6d6eb5`→`a0f9eac5` (history reads) — pre-`make()` insertion point**.
   Upstream inserted `type RpcEvent` + `isRpcEvent` after `const mutable`;
   the feature inserted `SessionListInput`/`SessionListCursor` +
   `MessageCursor` at the same spot. Resolution: kept both blocks, upstream's
   first. Both intents (rpc event filtering; session cursor codec) preserved.
2. **`c6d247b7`→`01bef32e` (pagination semantics) — import line**. Upstream
   added `import { Rpc } from "../rpc.js"` and kept
   `AbsolutePath, type DeepMutable`; the feature version of the same line is
   `AbsolutePath, RelativePath, type DeepMutable`. Resolution: Rpc import +
   the three-name schema import.

Everything else auto-merged as a union: `test/plugin/host.ts` (upstream's
`rpc` stub beside the feature's session-read stubs), the `session` block of
`promise/adapter.ts`, `client/src/promise/api.ts` (upstream's `Rpc*`
re-export beside the feature's `MessageApi` alias), and the plugins
`index.mdx` (feature's Sessions section kept; upstream's RPC docs sections
untouched around it).

### Post-rebase adaptation: 1, folded into the owning commits

Upstream renamed the promise adapter's context type: the
`import type { Context, Plugin } from "./plugin.js"` import lost `Context`,
and a new `type PromiseContext = Parameters<Plugin["setup"]>[0]` alias
replaced its uses. The feature's `adaptApiMethod<Context["session"]["list"]>`
generics still referenced the dropped name and failed
`packages/plugin` typecheck. Renamed to
`adaptApiMethod<PromiseContext["session"]["list"]>` — two lines, same member
type through the new alias — squashed into the commits that own each line
(`a0f9eac5` for `sessionList`, `01bef32e` for `sessionChildren`) so every
commit in the line stays green.

### Diffstat vs the previous version of the feature

Within files the feature owns, old tip → new tip differs only by that
two-line type rename; every other byte of feature content (including all
three `.design/subagent/*.gpt56s.md` docs) is identical. The freshened line
introduces **no file the old feature did not touch**. Feature footprint on
the new base: 13 files, +1574/−9 (was +1623/−22 on the old base; the delta
is the `Context`→`PromiseContext` rename and upstream's landed docs context
absorbing renumbering). No protocol, `HttpApi`, generated-client, or
generated docs changes were made, and no `bun run generate` was needed —
`packages/www` `check:generated` passes against upstream's committed
artifacts.

## Result

- New tip `ae21a8571738` (change `mytzzpnr`), 9 commits directly on
  `6a2c3e91c780`, change-ids `ovtlkxyp..mytzzpnr`.
- Floating bookmark `subagent-recovery` advanced to the freshened tip
  **after** this docs commit. Immutable `subagent-recovery-20260830` was
  **not** moved or recreated (same-date snapshot rule): it still marks
  `bae8e75b2be5`, the pre-freshen tip. The next dated snapshot lands on the
  next later-date refresh.
- Originals preserved: `bae8e75b2be5` and its ancestors are untouched under
  `subagent-recovery-20260830` and earlier snapshots.

## Verification (from package directories)

| Check | Result |
| --- | --- |
| `packages/core` `bun test test/plugin-session-reads.test.ts` | **4 pass**, 0 fail, 18 expect() — pagination through the Effect host, inbox/active facts, Promise history adaptation, Promise inbox/active adaptation |
| `packages/client` `bun typecheck` | clean |
| `packages/plugin` `bun typecheck` (incl. `tsconfig.tests.json`) | clean |
| `packages/core` `bun typecheck` (`-b tsconfig.json tsconfig.tests.json`) | clean |
| `packages/www` `bun typecheck` | clean, 0 hints |
| `packages/www` `bun run check:generated` | passes (no generation run) |
| `packages/www` `bun run build` | passes incl. link validation |

## Confidence

High. The one-commit upstream gap was read in full for every overlapping
file; both conflicts were pure insertion-point unions; the single adaptation
is a type-name rename with an alias proving equivalence. Uncertainty note:
the union in `host.ts` places upstream's `RpcEvent` block ahead of the
feature's cursor codec — ordering is stylistic, both orders compile. The
companion plugin (`~/src/opencode-subagent-control`) was deliberately not
re-verified here; its probe targets the public shapes, which did not change,
but a live `subagent_list` smoke test against the freshened host remains
worth doing at the next `working` rebuild.

## Cross-references

- [`final0.gpt56s.md`](/.design/subagent/final0.gpt56s.md) — the
  implementation record this refresh preserves; its commit-shape table's
  change-ids still identify the same logical commits (duplicated change-ids
  now: `ysmrqzru`, `uvplvqvp`, `lsyyqtws`→`vsmlmmkt`, `rxvpnmzq`→`mytzzpnr`).
- [`draft0.gpt56s.md`](/.design/subagent/draft0.gpt56s.md) — carry procedure
  ("check the two upstream PR shapes before resolving conflicts") followed
  above; neither had landed.
- [`patches.md`](file:///home/rektide/archive/doc/opencode/patches.md) —
  refresh procedure, bookmark convention (same-date snapshot immutability),
  and the reporting checklist this document satisfies.
- [`patches-apply.md`](file:///home/rektide/archive/doc/opencode/patches-apply.md)
  — duplicate-then-rebase mechanics and the rebase-by-duplicate-id lesson
  applied here.
