---
type: ImplementationReceipt
title: Bounded epilogue collection callbacks
description: Batched pre-teardown plugin collection through retained epilogue handles and a shared four-second window.
resource: /.design/term-v2/callbacks-implementation0.gpt6a.md
tags: [epilogue, callbacks, sessions, lifecycle, retention]
status: draft
generated: { by: "model:openai/gpt-6-astra#xhigh", at: 2026-09-11 }
verified: { by: "model:openai/gpt-6-astra#xhigh", at: 2026-09-11 }
stale_after: 2026-12-11
sources:
  - { resource: /.design/term-v2/callbacks0.gpt6a.md, title: Deferred directional design }
  - { resource: /packages/plugin/src/tui/context.ts, title: Public TUI plugin contract }
  - { resource: /packages/tui/src/context/epilogue.tsx, title: Collection and freeze state }
  - { resource: /packages/tui/src/app.tsx, title: Exit lifecycle }
---

# Bounded epilogue collection callbacks

Plugins can now perform bounded work immediately before TUI teardown and publish
the result through the existing retained epilogue handles:

```ts
context.ui.epilogue.onCollect((event) => {
  const outputs = new Map(
    event.sessionIDs.map((sessionID) => [sessionID, context.ui.epilogue.retainSession(sessionID, "summary")]),
  )
  event.waitUntil(
    readAll(event.sessionIDs, event.signal).then((rows) =>
      rows.forEach((row, sessionID) => outputs.get(sessionID)?.set(row)),
    ),
  )
})
```

## Contract

- Each active registration runs once with the complete, ordered Session selection.
- Normal exit, `SIGHUP`, `SIGINT`, and `SIGTERM` all attempt collection.
- Every callback and Promise shares one four-second window and `AbortSignal`.
- `waitUntil` must be called during synchronous dispatch. Returning a Promise is
  equivalent for one top-level asynchronous operation.
- Existing `retain` and `retainSession` setters are the only result channel.
- Throws and rejected Promises are logged per collector and do not stop others.
- At the deadline the signal aborts, available retained rows freeze, and late
  setters cannot change output. Synchronous blocking work remains unpreemptible.

The selected IDs and current Session scope are fixed before callbacks run. Plugin
reload admission stops at that point, callbacks finish or time out while their
generation remains active, freeze precedes renderer and plugin teardown, and the
existing writer still emits only after cleanup.

## Implementation

[`createEpilogue`](/packages/tui/src/context/epilogue.tsx) owns the shared timer,
abort controller, callback isolation, immutable Session-ID batch, freeze, and
late-publication rejection. [`PluginProvider`](/packages/tui/src/plugin/context.tsx)
supplies active collectors in enable/registration order and locks live selection.
[`Tui.run`](/packages/tui/src/app.tsx) converts supported exits into one shutdown
request, collects in an interruption-safe finalizer, freezes, captures cleanup,
restores the renderer, awaits cleanup, and leaves output to the existing outer
writer. OpenTUI signal handlers are disabled on both direct and preflight renderers
so they cannot destroy the callback environment before collection.

## Verification

- Epilogue unit tests cover batched identity, synchronous and rejected failure
  isolation, shared-window abort, retained fallback, and ignored late publication.
- The twelve-case process matrix passes for fixture and actual CLI normal exits
  and all supported signals, gated cleanup, narrow/wide output, live expiry, and
  the documented hot-reload gap.
- Plugin tests and typecheck pass; CLI typecheck passes.
- The focused TUI lifecycle family reported 33 passes plus its known Ctrl-O
  timeout, which passed immediately when rerun alone. TUI typecheck still reaches
  only the pre-existing Core FFI pointer diagnostic.

## Cross-references

- [Deferred callback design](/.design/term-v2/callbacks0.gpt6a.md) — lifecycle,
  fallback, timeout, and no-post-freeze constraints resolved here.
- [Retained multi-session implementation](/.design/term-v2/multi-session-implementation0.gpt56sx.md)
  — existing output cells, selection, ordering, and immutable batch foundation.
