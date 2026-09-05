---
type: Design
title: PluginRuntime provider production wiring fix
description: Root cause and fix for subagent_list dying with "Plugin runtime is unavailable" on built servers despite passing tests.
resource: /.design/subagent/runtime-provider-20260905.glm53.md
tags: [opencode, v2, plugin, runtime, layer-graph, regression]
status: stable
generated: { by: llm:glm53, at: 2026-09-05T10:45:00-04:00 }
verified: { by: llm:glm53, at: 2026-09-05T10:45:00-04:00 }
sources:
  - id: upstream-provider-wiring
    resource: https://github.com/anomalyco/opencode/pull/34619
    title: "feat(plugin): support plugin-provided tools"
    author: github:anomalyco
    last_modified: 2026-08-13
  - id: final-record
    resource: /.design/subagent/final0.gpt56s.md
    title: Subagent recovery through generic plugin session reads
    author: llm:gpt56s
    last_modified: 2026-08-30
---

# PluginRuntime provider production wiring fix

## Symptom

After the 2026-09-05 build, the `subagent_list` tool from
`opencode-subagent-control` loaded and registered on the elected
`opencode2` server, logged "session read surface available", and then
failed on every execution with:

```
{"error":{"type":"unknown","message":"Plugin runtime is unavailable"}}
```

## Root cause

The session read capability added `PluginRuntime` — a replaceable-cell
indirection ported from upstream
([anomalyco/opencode#34619](https://github.com/anomalyco/opencode/pull/34619))
— and routed the host's `list`, `children`, `messages`, `inbox.list`,
and `active` reads through `runtime.session.*`. The cell is populated
only by `PluginRuntime.providerNode`'s layer.

That provider was wired in exactly one place:
`packages/core/test/plugin/fixture.ts`. The feature line's base
(`23f3f8b6ca61`) never contained the provider wiring (upstream's
`routes.ts` entries came from a different lineage that later moved them
into `core/src/application.ts`), and the carried commits added
`PluginRuntime.node` to `PluginHost.requirements` without also carrying
the production provider wiring. Result:

- tests pass (the fixture builds `PluginRuntime.providerNode`),
- production resolves `PluginRuntime.Service` against an unpopulated
  cell, and every host session read dies at
  `runtime.ts`'s `require`.

The plugin's capability probe (`typeof fn === "function"`) cannot catch
this: the host functions exist; they only die when invoked.

## Fix

Mirror the upstream production wiring in `packages/server/src/routes.ts`:

- build `PluginRuntime.providerNode` in `applicationServiceNodes`;
- create a per-server `pluginRuntimeCell = PluginRuntime.makeCell()` in
  `makeRoutes`;
- replace both `PluginRuntime.node` and `PluginRuntime.providerNode`
  with cell-scoped variants, so embedded servers in one process never
  share populated-cell lifetimes.

Applied on both `opencode-subagent-recovery`
(`fix(server): wire PluginRuntime provider into production routes`) and
the `opencode-working` composition line, followed by an
`opencode2-linux-x64` rebuild.

## Regression test

`packages/server/test/plugin-runtime.test.ts` boots the real
`createRoutes` graph (not the plugin fixture), registers an SDK plugin
that captures its `ctx`, and exercises `session.list`, `children`,
`messages`, `inbox.list`, and `active` against created sessions.
Verified red on the unfixed wiring (dies at `runtime.ts:62`) and green
with the fix.

## Live verification

Against a private server built from the fixed tree (`serve --port`,
Basic auth, real model roundtrip):

1. `subagent_list` with no children → `completed`, `count: 0`.
2. `subagent` spawn of agent `explore` → `completed`.
3. `subagent_list` → `completed`, `count: 1` with the child's
   sessionID, agent, status `completed`, prompts, and `lastOutput`.

## Carry note

When refreshing this line onto a newer upstream base, check whether the
base already wires the provider (either `routes.ts` cell replacements
or `core/src/application.ts` after "centralize application
construction"). Semantic adoption means dropping the local wiring in
favor of the upstream one; never keep both cells.

## Cross-references

- [`final0.gpt56s.md`](/.design/subagent/final0.gpt56s.md) — the
  capability record whose commit table this fix amends.
- [`tsgo-inference-cliff.glm53.md`](/.design/subagent/tsgo-inference-cliff.glm53.md)
  — the same line's earlier plugin session read test constraints.
