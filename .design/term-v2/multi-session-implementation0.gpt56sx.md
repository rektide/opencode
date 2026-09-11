---
type: ImplementationReceipt
title: Retained multi-session TUI epilogue
description: Implemented visible-tab inventory, ordered live selection, scoped retained reporters, and atomic exit output.
resource: /.design/term-v2/multi-session-implementation0.gpt56sx.md
tags: [epilogue, sessions, plugins, retention, selection, tui]
status: draft
generated: { by: "model:openai-gpt-5.6-sol-xhigh", at: 2026-09-11 }
verified: { by: "model:openai-gpt-5.6-sol-xhigh", at: 2026-09-11 }
stale_after: 2026-10-11
extensions:
  tickets:
    - rekon-session-mementos-display-inventory
    - rekon-session-mementos-display-batch
    - rekon-session-mementos-display-lookers
    - rekon-session-mementos-display-selection
sources:
  - { resource: /.design/term-v2/selection-checkpoint0.gpt6a.md, title: Accepted ordered selector contract }
  - { resource: /.design/term-v2/selection-review0.gpt6a.md, title: Selector review }
  - { resource: /.design/term-v2/multi-session-evidence0.gpt6a.md, title: Pre-implementation evidence }
  - {
      resource: "file:///home/rektide/src/rekon/design/session-mementos/checkpoint0.gpt6a.md",
      title: Rekon capability split,
    }
---

# Retained multi-session TUI epilogue

## Outcome

The full TUI now prints one exit wordmark, one global contribution lane, and an
ordered envelope for each selected loaded Session. The default inventory is the
actual current Session plus the visible shared tab strip. The existing
`live → frozen → written` lifecycle remains intact: live code selects and copies
rows, the first renderer destruction formats retained primitives, and the outer
writer prints only after teardown.

Implementation commits:

| Commit         | Scope                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ac18714d6176` | Inventory, selection/config wiring, atomic batches, scoped plugin API, retained publication, built-in activity/Cost reporters, and focused/process tests. |
| `b18b4df95308` | CLI configuration and TUI plugin documentation.                                                                                                           |
| `18c7fa19081d` | Explicit 40- and 120-column process verification.                                                                                                         |

No Protocol, Server, generated Client, theme, JSX slot, renderer-destruction, or
output-writer contract changed. [`app.tsx`](/packages/tui/src/app.tsx) retains its
existing signal, freeze, latch, cleanup, and awaited-write sequence.

## Actual public interfaces

[`Epilogue`](/packages/plugin/src/tui/context.ts#L477-L497) now exposes four
retained contribution operations:

```ts
epilogue.register(project)                  // global projection; current route; once
epilogue.registerSession(project)           // projection for every selected Session
epilogue.retain(key, initial?)               // event-driven global row
epilogue.retainSession(sessionID, key, initial?) // event-driven scoped row
```

The two retained operations return `{ set(row | undefined), dispose() }`.
Publication validates and copies immediately, so a rejected/thenable or mutable
value cannot remain hidden behind an unselected Session. A Session-scoped retained
row never admits its Session to the inventory. Disposal and plugin generation
cleanup remove entries; later writes through the disposed handle do nothing.

The live rule-program seam is:

```ts
epilogue.selection.transform((rules) => {
  // Mutate the ordered activity-within / limit array.
})
```

Transforms replay over the current config base in plugin enable order and then
registration order. Config replacement, disablement, and reload rebuild from the
base; runtime transforms never write `cli.json` and need no inverse operation.
Each transform receives a new draft. Throwing, asynchronous, or invalid output
discards only that transform's draft, reports the issue, and lets later transforms
continue. Rules remain a closed serializable vocabulary; there is no arbitrary
predicate or provider registry. A rule's `terminating` field is its explicit host
grant, separate from the rule's ordinary keep/drop result.

## Inventory and selection

[`inventory.ts`](/packages/tui/src/epilogue/inventory.ts) enumerates actual IDs:

- the routed Session, if any;
- visible tab IDs when tabs are enabled;
- current only when tabs are disabled;
- visible loaded tabs on Home, where no current Session is pinned.

The tab store can be shared across TUI windows; “visible” does not mean exclusive
client ownership. IDs are deduplicated without root, parent, child, or fork
expansion, so a routed child and a visible root may coexist. Missing metadata is
omitted until the existing cache supplies it. The epilogue performs no sync,
history request, or all-server discovery.

The stored `epilogue.selection` value is either `visible-tabs` (default),
`visible-tabs-2d`, or an ordered array of `activity-within` and `limit` stages.
The two-day preset grants termination to its activity stage. Custom stages retain
their written order and explicit grants. The current Session remains pinned
outside every stage, including a terminating zero limit.

One live timer targets the next known idle eligibility boundary only while an
activity rule exists. Selection therefore ages without rewriting Session facts or
polling. Running Sessions remain eligible, but their recorded activity timestamps
remain historical.

## Reporter and batch behavior

[`trackEpilogue`](/packages/tui/src/context/epilogue.tsx#L85-L113) uses Solid's
keyed `mapArray` ownership for selected IDs. Each Session has its own memoized
reporter computation; a parent computation publishes the complete global-plus-
sessions value atomically. Measured call-count tests show that changing Session A's
reporter dependency reruns A only—not B or the global projection. Selection still
scans and sorts the small loaded inventory before reporters run.

Contribution identity is scoped as follows:

| Lane                   | Identity and budget                                                                                            | Output                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Global projection      | Plugin + generated registration key; first eight applicable registrations per plugin.                          | Runs for the hydrated current route and prints once before envelopes. |
| Global retained        | Plugin + caller key; same global budget; does not require a current Session.                                   | Prints once before envelopes.                                         |
| Per-Session projection | Session ID + plugin + generated registration key; first eight applicable registrations per plugin and Session. | Runs once for each selected loaded Session.                           |
| Per-Session retained   | Session ID + plugin + caller key; same per-Session budget.                                                     | Prints only if that Session is independently selected.                |

Duplicate labels remain additive. `Session` and `Continue` are the only reserved
envelope labels. The built-in activity plugin uses the same `registerSession`
mechanism as external reporters: `Last active` retains
`max(time.updated, time.idle ?? time.updated)`, while `Status: running` is a
separate row and never substitutes `Date.now()` for historical activity. The
sidebar Cost adapter also migrated to `registerSession`. Existing external
`register` projections remain global/current-route compatible and are never
multiplied across Sessions.

[`createEpilogue`](/packages/tui/src/context/epilogue.tsx#L62-L83) copies the
complete batch again at its state boundary. Freeze reads only this retained batch
and one explicit clock; plugin code, selection transforms, setters, cache access,
and I/O are absent. [`epilogueOutput`](/packages/tui/src/util/presentation.ts)
prints one wordmark, global rows, then one `Session`/reporter/`Continue` section per
selected Session.

## Verification

All commands ran from package directories unless noted.

| Check                                                                                                      | Result                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused inventory, selector, retention, config, presentation, built-in reporters, and in-process lifecycle | 105 passed, 0 failed, 473 assertions across eight files.                                                                                                                                                        |
| Real process matrix                                                                                        | Fixture and actual CLI `app.exit`, `SIGHUP`, `SIGINT`, and `SIGTERM`; reload interval; two visible Sessions; pushed and projected global/scoped rows; no post-freeze request; expected codes 0/130. All passed. |
| Width process checks                                                                                       | Complete two-Session output at 40 and 120 columns; one wordmark and two distinct Continue commands. Both passed.                                                                                                |
| Full TUI suite (`bun run test`)                                                                            | **1,298 passed, 4 skipped, 0 failed** across 143 files; 2 snapshots and 107,848 assertions.                                                                                                                     |
| Plugin package                                                                                             | `bun typecheck` and 9 tests passed.                                                                                                                                                                             |
| CLI package                                                                                                | `bun typecheck` passed.                                                                                                                                                                                         |
| Website                                                                                                    | `bun typecheck`, `bun run check:generated`, and production `bun run build` passed; build regenerated the CLI schema and validated links.                                                                        |
| TUI typecheck                                                                                              | Reaches only the unchanged Core FFI error at [`process-lock-ffi.bun.ts:49`](/packages/core/src/util/process-lock-ffi.bun.ts#L49): `bigint \| Pointer` is not assignable to `Pointer`.                           |

The full suite retained existing non-fatal resize-listener, Mini leader-token, and
caught client-refresh warnings. No failing test or new lifecycle warning appeared.

## Deliberate limits and next work

This is retained-only infrastructure. It does not implement exit-time collection
callbacks, bounded callback deadlines, late-result fallback, process-local visit
records, question/response excerpts, Cotail summaries, bookmarks, a longer text
value, or automatic Session hydration. The parent-owned
`rekon-session-mementos-display-callbacks` document follows this verified runtime
and must not be inferred from the live projection/transform APIs implemented here.

The default has no implicit Session count cap. Operators can select the two-day
preset or add an ordered `limit`; plugins can edit that live program. Global and
per-Session labels are not globally unique, by design—the retained identity tuple,
not display text, prevents leakage or replacement.

## Cross-references

- [Executable selector checkpoint](/.design/term-v2/selection-checkpoint0.gpt6a.md)
  — predecessor contract for current pinning, source order, lazy narrowing, and
  termination grants; this receipt records its production integration.
- [Selector review](/.design/term-v2/selection-review0.gpt6a.md) — accepted the
  pure kernel and explicitly left inventory, batches, and lookers for this slice.
- [Multi-session evidence](/.design/term-v2/multi-session-evidence0.gpt6a.md) —
  prior ownership/cache investigation; its locally-visited recommendation is
  superseded here by the approved visible-tab inventory, while its no-hydration
  and freeze-before-cleanup constraints remain.
- [Original retained registry receipt](/.design/term-v2/epilogue-registry-implementation0.gpt56s.md)
  — predecessor for validation, plugin generation ownership, immutable carry,
  and signal guarantees; this work separates its global lane from the new scoped
  lane instead of multiplying legacy callbacks.
- [Rekon Session checkpoint](file:///home/rektide/src/rekon/design/session-mementos/checkpoint0.gpt6a.md)
  — capability ownership for inventory, batches, lookers, visits, excerpts, and
  summaries; only the first four relevant retained capabilities advance here.
- [Ordered-pipeline memento](file:///home/rektide/src/rekon/design/ordered-pipelines/memento0.gpt6a.md)
  — explains why ordered narrowing and accumulating reporters keep distinct
  algebras; the implementation adds no shared universal runtime.
