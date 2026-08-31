---
type: Design
title: Subagent recovery through generic plugin session reads
description: Final implementation record for replacing the monolithic in-core subagent recovery tool with carryable host reads and a standalone plugin.
resource: /.design/subagent/final0.gpt56s.md
tags: [opencode, v2, plugin, session, subagent, pagination, carryability]
status: stable
generated: { by: llm:gpt56s, at: 2026-08-30T21:05:00-04:00 }
verified: { by: llm:gpt56s, at: 2026-08-30T21:05:00-04:00 }
sources:
  - id: implementation-draft
    resource: /.design/subagent/draft0.gpt56s.md
    title: Upstream-aligned session reads for subagent control
    author: llm:gpt56s
    last_modified: 2026-08-30
  - id: upstream-history-reads
    resource: https://github.com/anomalyco/opencode/pull/43556
    title: "feat(plugin): expose session history reads"
    author: github:rekram1-node
    last_modified: 2026-08-21
  - id: upstream-cursor-parity
    resource: https://github.com/anomalyco/opencode/pull/39939
    title: "feat(plugin): expose session list and messages with cursor pagination"
    author: github:kitlangton
    last_modified: 2026-08-21
  - id: companion-plugin
    resource: file:///home/rektide/src/opencode-subagent-control
    title: opencode-subagent-control
    author: human:rektide
    last_modified: 2026-08-30
---

# Subagent recovery through generic plugin session reads

## Outcome

The accepted replacement separates mechanism from policy:

- OpenCode exposes generic `ctx.session.list`, `children`, `messages`,
  read-only `inbox.list`, and `active()` reads in both Effect and Promise
  plugin contexts.
- [`opencode-subagent-control`](file:///home/rektide/src/opencode-subagent-control)
  owns `subagent_list`, direct-child interpretation, fork exclusion, prompt
  reconstruction, status derivation, and continuation guidance.
- The old in-core `subagent_list` implementation and its process-local Job
  coupling are superseded rather than carried forward.

This keeps the source patch broadly useful and makes the subagent behavior
installable, testable, and independently evolvable.

## Upstream alignment

[`anomalyco/opencode#43556`](https://github.com/anomalyco/opencode/pull/43556)
is the primary replacement seam: the carried history commit intentionally
matches its `session.list`, plugin-only `session.children`, retained
`session.messages`, private host cursor adapter, and Promise client alias.

[`anomalyco/opencode#39939`](https://github.com/anomalyco/opencode/pull/39939)
is the alternative shared-codec design. If either proposal lands, drop the
equivalent carried history code rather than preserving a competing interface.
The inbox and active reads remain a small additive commit above either shape.

## Commit shape

The OpenCode line is intentionally replaceable by capability:

| Change ID | Subject | Replacement boundary |
| --- | --- | --- |
| `vyrrvour` | `feat(plugin): expose paginated session history reads` | Drop when upstream history reads land. |
| `uvlkpnnr` | `feat(plugin): expose session inbox and active reads` | Retain unless upstream exposes both reads. |
| `lsyyqtws` | `fix(plugin): preserve session read pagination semantics` | Cursor and cross-flavor parity hardening. |

The companion plugin uses every cursor page, deduplicates children by Session
ID as mutable list ordering moves, reads messages oldest-first, and calls
`active()` once per listing. On an older host it loads successfully and
registers no tool.

## Verification

- Client, Plugin, Core, and website typechecks pass.
- Focused Core plugin-session tests: 4 pass, covering both flavors, cursor
  traversal, malformed cursors, combined filters, inbox, and active reads.
- Website generated-artifact check and production build pass.
- Full Core suite: 3,993 pass, 30 skip, with only the documented pre-existing
  `.hg/branch` watcher timeout.
- Companion plugin: 14 tests and typecheck pass.

## Carry procedure

Maintain this line directly on `v2@origin`, keep the three capability commits
contiguous, and retain dated `subagent-recovery-YYYYMMDD` bookmarks. During a
freshen, check the two upstream PR shapes before resolving conflicts; semantic
adoption means dropping local code, not mechanically preserving it.

## Cross-references

- [`draft0.gpt56s.md`](/.design/subagent/draft0.gpt56s.md) contains the full
  interface, cursor, test, and acceptance design.
- [`subagent.gpt56s.md`](/.design/subagent/subagent.gpt56s.md) records the
  original layer inventory and alternatives.
- [`patches.md`](file:///home/rektide/archive/doc/opencode/patches.md) defines
  feature-line, dated-bookmark, and duplicate-then-rebase maintenance rules.
- [`plugins.md`](file:///home/rektide/archive/doc/opencode/plugins.md) tracks
  the standalone plugin and this source capability as one operational feature.
