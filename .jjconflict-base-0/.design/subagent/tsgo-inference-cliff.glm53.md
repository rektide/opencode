---
type: Report
title: tsgo inference cliff on large it.effect bodies
description: Effect<_, _, unknown> degradation when a big test body is checked against a large fixture R-union, the bisect that found it, and workarounds.
resource: file:///home/rektide/src/opencode-subagent-recovery/.design/subagent/tsgo-inference-cliff.glm53.md
tags: [opencode, subagent-recovery, tsgo, testing]
status: stable
generated: { by: agent:glm53, at: 2026-09-02T16:40:00-04:00 }
verified: { by: human:rektide, at: 2026-09-02 }
stale_after: 2026-12-01
sources:
  - id: compose-20260902
    resource: file:///home/rektide/ado/patches-apply.md
    title: Building the working composition — 2026-09-02 compose lessons
    author: rektide + agent
  - id: feature-test
    resource: file:///home/rektide/src/opencode-subagent-recovery/packages/core/test/plugin-session-reads.test.ts
    title: The affected test file (split during the 2026-09-02 compose)
    author: rektide + agent
---

# tsgo inference cliff: `Effect<_, _, unknown>` on large `it.effect` bodies

## Problem

During the `working-20260902` compose, the pagination test in
`packages/core/test/plugin-session-reads.test.ts` failed typecheck with:

```
Argument of type '() => Effect.Effect<void, unknown, unknown>' is not
assignable to parameter of type 'Body<void, unknown, HttpClient | Scope | Service | ... >'
```

while every *part* of the body typechecked correctly in isolation. The
compiler was not reporting a real type error — it degraded the whole
generator's inferred type to `Effect<void, unknown, unknown>` and then
(correctly) rejected *that* against `testEffect`'s parameter.

## Trigger conditions (bisected by early-return truncation)

- A `testEffect(AppNodeBuilder.build(...))` fixture whose provided-service
  union R is large (the 2026-09-02 `PluginTestLayer` group provides ~29
  services after adding `PluginRuntime.node` + `providerNode`).
- A test body that both **yields a heavy service** (`Location.Service` —
  `Location.Interface` is a wide type) *and* carries other significant
  content (a `Session.Info.make` construction, host-context destructuring,
  several cursor-paginated calls).
- Neither half alone breaks: the same preamble with an explicit R
  annotation checks clean, and a stripped skeleton of the same shape
  checks clean. Adding a single `yield* Location.Service` to a previously
  passing test tipped it over.

This looks like a cumulative inference budget in `@typescript/native-preview`
(tsgo) rather than a soundness issue: assignability is fine once the
body's type is materialized outside the contextual check.

## Workarounds (in order of preference)

1. **Split the test.** The compose split the pagination test into
   `preserves session list pagination` and `preserves message pagination`
   halves, each comfortably under the cliff. Assertions were preserved
   byte-for-byte; only shared setup (host construction via a `makeHost`
   helper, module-scope session fixtures) was hoisted.
2. **Hoard the body type explicitly.** Annotating the callback's return
   (`(): Effect.Effect<void, unknown, A | B | C> =>`) checks clean in a
   standalone probe, but in-file the contextual inference still degraded
   in our case — annotation alone was not reliable.
3. **A provably-true cast on the callback.** Used once on the list-half
   (`as Effect.Effect<void, unknown, Plugin.Service | PluginRuntime.Service>`).
   Acceptable only because the standalone annotation proved the cast
   target; if the body changes, re-derive the cast from an isolated
   annotation, not from memory.

## Why this hit subagent-recovery specifically

The feature's test overrides `PluginRuntime.Service` per-host
(`Effect.provideService(PluginRuntime.Service, ...)` around
`PluginHost.make(plugins)`), so its fixture must provide the full runtime
graph. Upstream's plugin/config decoupling already grew the fixture union;
adding the two `PluginRuntime` nodes for this feature's contract pushed
the largest test body over the edge.

## Follow-ups worth doing

- Reduce `PluginTestLayer`'s provided union where possible (config tests
  also share it and tolerate it only because their bodies are small).
- Watch tsgo releases for inference-budget fixes; if one lands, un-split
  the test or drop the cast.
- If the pattern recurs elsewhere, consider a lint/doc note in the
  testing guide: "big fixture unions + heavy service yields + long bodies
  — pick two."

## References

- Compose narrative and lessons: `~/ado/patches-apply.md` (2026-09-02).
- The split test: `packages/core/test/plugin-session-reads.test.ts`.
- Bisect probes (early-return truncation, standalone annotations) were
  ephemeral and not retained; the procedure is described above.
