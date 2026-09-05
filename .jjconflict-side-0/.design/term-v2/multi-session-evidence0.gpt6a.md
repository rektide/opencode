# Multi-session exit epilogue: implementation checkpoint

Date: 2026-09-06  
Model: OpenAI GPT-6 Astra xhigh (`gpt6a`; session model selection)  
Status: evidence and proposed slice; **no implementation authorized or changed**

## Situation and recommendation

The user wants an exit summary of multiple Sessions, with last-question and response snippets; a later Cotail bookmarked summary remains unimplemented. The default should concern this window/client, not recent activity everywhere. Selection rules must be individually assembleable and execute in their written order, followed by ordered per-Session output contributors ("lookers"). Preserve the broader chain-of-command idea in Rekon, not as a speculative universal engine here.

**Recommended first slice:** move Session ownership from the mounted Session route to a live host-owned, in-process epilogue inventory; retain an immutable multi-Session batch; execute a small closed vocabulary of ordered selection rules; run existing per-Session plugin projections for the selected Sessions; print one wordmark plus one mandatory envelope per Session. Default to Sessions actually visited in this TUI process. Offer current-Session compatibility and current-client + activity-within-2d presets. Snippet extraction/layout is the next reviewable slice, once the semantics below are accepted.

## Verified boundaries

| Evidence | Consequence |
| --- | --- |
| [Current route ownership](/packages/tui/src/routes/session/index.tsx#L182-L215): one cached Session becomes one candidate; route cleanup clears it. | A batch cannot remain route-owned. Home/plugin navigation currently erases output and must deliberately change under the client-wide preset. |
| [Registry computation](/packages/tui/src/plugin/context.tsx#L146-L166) and [projection tracker](/packages/tui/src/context/epilogue.tsx#L86-L115): current route ID, then plugin order, then registration order. | Keep the existing activation registry and disposers. Change iteration scope, not plugin lifecycle or visual slots. |
| [Epilogue state machine](/packages/tui/src/context/epilogue.tsx#L49-L83): live → frozen → written; supplemental rows match one candidate ID. | Replace the single-ID epoch with one atomically published batch, not separate candidate/row arrays that can mismatch. |
| [First renderer destroy](/packages/tui/src/app.tsx#L282-L293) freezes with one clock; [post-scope writer](/packages/tui/src/app.tsx#L464-L483) awaits stdout. | Preserve this seam and all signal/once-only behavior. Freeze formats retained plain data; it must not invoke registered projections, issue requests, or inspect a renderer that is tearing down. |
| [Public plugin contract](/packages/plugin/src/tui/context.ts#L458-L473): a synchronous `{ sessionID } → row \| undefined`. | Multi-Session selection does **not** require a multi-row return. Run each existing callback for each selected Session. |
| [Validation](/packages/tui/src/context/epilogue.tsx#L117-L175): terminal-control rejection, immutable copies, 24-column labels, 48-column text, eight registrations/plugin. | Preserve strict small-text behavior. Snippets need their own bounded presentation decision, not an unannounced increase of every plugin's text budget. |

The current checked-out production tree has **one** epilogue adapter registration, [sidebar Cost](/packages/tui/src/feature-plugins/sidebar/context.tsx#L44-L55). Some historical README prose also mentions a last-activity adapter; that is not a second registration in this tree. `Active` is host-owned. Do not implement another adapter merely to reconcile that prose.

## What "this client" can actually mean

There is no exclusive-client provenance field on [Session.Info](/packages/schema/src/session.ts#L31-L58). `time.viewed` is a server-global acknowledgement, [explicitly noted by tabs](/packages/tui/src/context/session-tabs.tsx#L221-L238), not a local visit log.

[Session tabs](/packages/tui/src/context/session-tabs.tsx#L69-L105) use `storage.store("tabs")`, with `global` or launch-`cwd` scope. [Storage](/packages/tui/src/context/storage.tsx#L47-L91) locks and rereads the on-disk draft; its [watcher](/packages/tui/src/context/storage.tsx#L113-L119) imports changes from other TUI instances. The tab implementation even [guards shared updates from re-admitting local routes](/packages/tui/src/context/session-tabs.tsx#L183-L219). Therefore shared tab membership is not exclusive window membership.

| Inventory option | Exact meaning | Tradeoff |
| --- | --- | --- |
| **Locally visited (recommended)** | Session route selected in this `run()` instance, with matching cached Session metadata observed while selected. Deduplicate by actual Session ID; remember navigation recency in memory. | Strong, cheap in-process provenance; a restored but never visited tab is absent. Closed tabs remain because this is a work/visit summary, not an open-tab summary. |
| Visible tab strip | Current `useSessionTabs().tabs()` plus the actual selected child Session if desired. | Faithfully summarizes what is displayed, including restored/shared tabs and edits originating in other clients. Must be named "visible tabs", not "owned by this client". |
| Local tabs only | Tabs explicitly opened/promoted/focused here and not locally closed. | Needs new tab ownership semantics and hooks across tab operations; route tracking alone cannot distinguish these actions. Not necessary for the first slice. |

Recommended admission/exclusion rules:

- The inventory exists above Session route and plugin generations, for one TUI process lifetime. No disk persistence or client/server identity addition.
- Home/plugin routes retain the local visit inventory. The current-Session rule selects nothing on those routes.
- Metadata-only cache warming, restored/shared tab arrival, `session.created` elsewhere, and server-global viewing never admit a Session. A Session opened here by a navigation event does count: this renderer actually changed route.
- A route whose Session never hydrates does not produce an envelope. Do not ban the string `dummy` indiscriminately: startup uses it as a sentinel, but existing lifecycle fixtures also hydrate a Session with that ID. Admit only an observed matching Session object.
- Actual Session deletion removes the member. Tab closure alone does not delete its visit record under the recommended interpretation.
- Keep **actual routed IDs**. Do not automatically expand families or replace children with parents. [Root resolution](/packages/client/src/solid/data.ts#L470-L486) walks only loaded ancestry, and [family membership](/packages/client/src/solid/data.ts#L488-L511) is correspondingly incomplete. A root fallback can name a missing ancestor.
- Parent relationships are not fork relationships: [the schema](/packages/schema/src/session.ts#L33-L38) represents them separately. No implicit expansion along either edge.

This default is a concrete proposal for the parent's approval, not an assertion that the user has already chosen "visited since process start" over "currently visible tabs".

## Cache limitations and snippet semantics

The epilogue must make no new history fetches. [The data provider](/packages/tui/src/context/data.tsx#L11-L21) wraps the existing Solid Client cache; [Session listing](/packages/client/src/solid/data.ts#L225-L228) lists known metadata, not a complete server query. Events can populate metadata for Sessions never visited here ([creation handling](/packages/client/src/solid/data.ts#L605-L615)).

History completeness is materially different:

- [Initial message sync](/packages/client/src/solid/data.ts#L1540-L1574) loads the newest **20** messages and reverses them into transcript order. Earlier pages load only on demand.
- `message.list()` returns `[]` both for missing cache and genuinely empty history. `more() === false` is also not proof of a hydrated complete transcript. `loading()` covers load-more work, not initial sync. The public plugin Data interface exposes even less: [only list/get/sync/invalidate](/packages/plugin/src/tui/context.ts#L83-L88).
- [TUI retention](/packages/tui/src/context/session-retention.ts#L14-L39) keeps open tab families plus three recent non-tab families. [Eviction](/packages/client/src/solid/data.ts#L514-L535) deletes heavy message/pending data but preserves metadata and unacknowledged local submissions.
- Events can reconstruct only a suffix after eviction. [Streaming edits](/packages/client/src/solid/data.ts#L411-L419) drop deltas when their target assistant is absent. A nonempty list is not a completeness guarantee either.

**First snippet contract should be "last observed in the loaded transcript", never "complete server history".** Missing data should omit a snippet or show a concise "not in loaded history" hint; it must not claim "no question" or "no response". Do not retain an old excerpt invisibly across cache eviction: that introduces stale-value and revert invalidation semantics. A deliberately labeled last-observed snapshot cache is a possible later choice, not free correctness.

Recommended extraction for the next slice:

1. Respect staged revert. [The route](/packages/tui/src/routes/session/index.tsx#L185-L195) displays a pre-boundary prefix, but falls back to the whole cache if the boundary is absent. **Do not copy that fallback into a summary claiming unreverted text.** If the staged boundary is not loaded, omit snippets as unresolved. [Committed revert](/packages/client/src/solid/data.ts#L1023-L1046) removes the suffix from the cache.
2. Find the newest **delivered user** row in that visible prefix. Ignore synthetic/System/skill/shell/compaction rows. User content is [a text field plus attachments](/packages/schema/src/session-message.ts#L72-L88); an attachment-only prompt may have no textual excerpt.
3. Exclude pending user IDs from the question search. [Pending sync](/packages/client/src/solid/data.ts#L1337-L1359) and [inbox events](/packages/client/src/solid/data.ts#L721-L758) materialize queued/steered and optimistic input into `message.list()` before delivery. Pending input is not yet the question being answered. A separate pending-input looker could be added later if requested.
4. For the response, inspect only assistant rows **after that user boundary**, choosing the latest nonempty text-bearing assistant and joining its `content[type === "text"]` parts. Never substitute an older exchange's answer for a newly unanswered prompt. If the user boundary is outside the cache, an independently labeled cached response is possible, but should not be presented as a verified Q/A pair.
5. Ignore reasoning and tool payloads. [Assistant content](/packages/schema/src/session-message.ts#L175-L235) distinguishes text, reasoning, and tools, but provides no general "final answer" channel or user-message parent pointer. `time.completed` completes a **Step**, not an entire assistant turn. The result is a response excerpt, not necessarily a final answer.
6. Streaming text is useful and should not be hidden. Retain a marker when the source assistant lacks `time.completed`; [step-start processing](/packages/client/src/solid/data.ts#L818-L849) resets these fields on reused logical-step messages. Keep the Session's mandatory `Active` status independent; an idle interrupted Session can still have an unfinished source assistant.

Without adding a cache-status API, omission plus a documented cache-derived contract is honest and requires no Client/Protocol changes. If the parent requires reliable "unloaded/empty/full/stale" distinctions, that is a separately authorized manually maintained Client cache API change—not generated client editing and not an epilogue-specific server read.

## Ordered rules and lookers: narrow proposed interface

Use a **closed epilogue-domain union**, not a rule registry, callback DSL, abstract pipeline package, or shared slot rewrite:

```ts
type EpilogueSelectionRule =
  | { readonly type: "current-client" }
  | { readonly type: "current-session" }
  | { readonly type: "activity-within"; readonly within_ms: number }

type EpilogueSelection =
  | "current-client"
  | "current-client-2d"
  | "current-session"
  | readonly EpilogueSelectionRule[]

// Proposed cli.json shape, not currently supported:
// epilogue: { selection: [
//   { type: "current-client" },
//   { type: "activity-within", within_ms: 172800000 },
// ] }
```

Presets expand to ordinary arrays. Each rule receives the **preceding rule's candidate sequence**; apply in source order without sorting/grouping/deduplicating the rule list. The initial universe is cached Session metadata with local membership/recency annotations, never an all-server query. Omitting a locality filter explicitly selects from that incomplete cache; it does not make a complete "recent everywhere" feature. Preserve candidate order through filters; recommend current Session first, then local navigation recency, with deterministic ID fallback for nonlocal cached entries.

For activity, reuse the existing envelope's `max(time.updated, time.idle ?? time.updated)` and treat currently running as active now. `time.updated` includes metadata actions such as [rename and model/agent selection](/packages/core/src/session/projector.ts#L544-L570), not just chatting; [view acknowledgements preserve it](/packages/core/src/session/projector.ts#L574-L583). Do not silently redefine this as "last message time". Cached timestamps can lag events; no exact server freshness promise.

Run selection and projection while live. An activity rule needs a live clock invalidation or old Sessions remain selected indefinitely without data changes. Recommend **one scoped timer for the next eligibility expiry**, active only while an age rule is configured, with no renderer dependency. Freeze retains the last live selection and uses its own single timestamp for relative-time formatting. This is the same live-snapshot consistency level as cached server events, not a transactional age-cutoff query at shutdown. Exact freeze-time filtering is an alternative requiring an explicit decision; it must remain host-only pure processing of retained data, never extension callbacks.

The next slice can add `lookers: ["last-question", "last-response", "plugins"]` as an ordered, closed output list. The plugin entry expands to today's plugin-enable/registration ordering. Each named looker contributes zero or one semantic row per selected Session. `Session`, `Active`, and `Continue` remain unsuppressible host envelopes. This preserves the user's separation of **which Sessions** from **what to observe about each** without pretending to offer arbitrary control flow.

### Batch and ownership

```ts
type RetainedSessionEpilogue = {
  readonly candidate: SessionEpilogueCandidate
  readonly rows: readonly EpilogueRow[]
}

// Host-internal retained sink, replacing independent set/setRows publication:
// setBatch(sessions: readonly RetainedSessionEpilogue[]): void
// freeze(now: number): void
// take(): string | undefined
```

One live host computation assembles the selected IDs, candidates, and contributions, validates/copies rows, and publishes one frozen array of frozen entries including copied candidate/activity objects. A current-route change cannot pair Session A's rows with Session B's envelope. Read Data and Config at the existing plugin host boundary (already below those providers); keep policy/helpers in the epilogue domain, not in the registration manager. Route `epilogue.set/clear` ownership then disappears. Inventory ownership must survive plugin activation/hot-reload, but not the TUI process.

Initially retain the current aggregate-computation pattern. Do not preemptively build per-Session reactive roots: tests should measure call counts first. Selection must happen **before** expensive snippet/lookers so excluded Sessions are not scanned. Keep eight registrations/plugin **per selected Session**, with the documented existing omission/thenable containment and deactivation-before-cleanup behavior. Multiple Sessions multiply possible output; an optional explicit ordered `limit` rule or envelope cap is a parent decision, not an invisible truncation policy.

### Excerpt layout: do not overload the 48-column text row

Two snippets do not require an array-valued plugin registration: two lookers each return one row. The actual missing capability is a longer, host-formatted **excerpt value**. Options:

- **Recommended next-slice direction:** add a semantic `excerpt` value (public if plugins need it) with bounded retained text, host wrapping, and ellipsis. Keep existing `text` limits unchanged. A concrete initial budget is 256 retained display columns and at most two output lines per excerpt; live terminal columns are copied into retained presentation options and capped at 80 for wrapping. Sanitize controls/ANSI, collapse whitespace, and truncate grapheme-safely while live; [Locale width helpers](/packages/tui/src/util/locale.ts#L55-L80) already exist.
- Core-only excerpt fields avoid changing the plugin API now, but create a second output lane and do not let a future plugin contribute a Cotail summary through the same semantic value. That future is an argument for preserving an option, not for implementing bookmarking.
- Truncating each snippet to the current 48 columns is the smallest patch, but materially weakens the requested last-Q/response usefulness. Raising the global text limit would also loosen every existing plugin row for an unrelated reason.

Text safety applies equally to newly collected Session titles. The existing route uses code-unit `Locale.truncate(..., 50)`, not terminal-safe normalization; do not reproduce that as the boundary for newly expanded output.

## Configuration fit

[TUI Config.Info/resolve](/packages/tui/src/config/index.tsx#L66-L85) owns terminal preferences; [CLI schema](/packages/cli/src/config/schema.ts#L1-L10) spreads its fields. [The CLI service](/packages/cli/src/config/config.ts#L22-L45) reads global `cli.json`, and [updates](/packages/cli/src/config/config.ts#L81-L105) validate JSONC under a file lock. [ConfigProvider](/packages/tui/src/config/index.tsx#L322-L348) reconciles updates and file watches into reactive state. No server config, experimental gate, or new durable store is needed for an accepted feature.

The [settings dialog](/packages/tui/src/component/dialog-config.tsx#L326-L384) cycles scalar choices. A single `epilogue.selection` string-or-rule-array field avoids competing `preset` and `rules` truth. Present known strings as preset labels and an array as "custom rules"; deliberate cycling replaces the custom value with a preset. Do not normalize the displayed field permanently into an array, or every preset will misleadingly display as custom. Compile it in the epilogue domain. Add config/default/round-trip tests. The website's [generation command](/packages/www/package.json#L10) derives `cli.json` from CLI schema; Protocol generation is unnecessary unless the accepted scope later changes Protocol/HttpApi.

The published [V2 CLI config guide](https://opencode.ai/v2/docs/cli/config) and [CLI plugin guide](https://opencode.ai/v2/docs/build/plugins/cli) agree on global config and shared storage. The fetched plugin guide does not yet document this patch stack's epilogue API; [the checked-out epilogue documentation](/packages/www/src/docs/content/build/plugins/cli.mdx#exit-epilogue) is the relevant contract for this feature.

## Authorization gates and concrete next work

**Approve before code:** (1) locally visited vs visible tabs; (2) whether closed tabs remain (yes for visited); (3) actual routed IDs vs automatic family expansion (recommend actual only); (4) client-wide output when currently on Home (recommend yes); (5) no implicit maximum Session count vs a stated limit; (6) live-cache cutoff semantics; (7) whether snippets are paired delivered Q/response or independent latest observations, and whether an excerpt value belongs on the public plugin surface.

After accepting the first six, first code slice:

1. Add epilogue-owned local visit tracking and ordered selection helpers, config presets/custom arrays, and settings preset selection. No Session queries or history-retention changes.
2. Change retained state and presentation to one atomic multi-Session batch with one wordmark. Keep `freeze/take` and stdout/signal lifecycle intact.
3. Widen the existing tracker to selected Sessions, preserving public registration signature, ordering, isolation, reload interval, and reserved envelope. Remove route-only candidate ownership.
4. Add focused tests and update the plugin/config docs for cache scope and per-Session callback semantics. Commit this coherent slice before applying review feedback or starting snippets.

Next architectural checkpoint: inspect emitted batch shape, local-vs-shared-tab isolation, projection call counts, and output size. Then authorize the bounded question/response lookers with the accepted cache, pending-input, revert, streaming, and layout policies. No all-server query, Cotail data model, bookmarking, live dashboard, generic engine, or unrelated slot work.

## Verification plan (located; not run for this checkpoint)

Run from package directories, not repository root:

```sh
# packages/tui
bun test --timeout 30000 test/context/epilogue.test.ts test/util/presentation.test.ts test/config-v2.test.tsx test/config.test.tsx
bun test --timeout 30000 test/app-lifecycle.test.tsx
bun test --timeout 30000 test/app-lifecycle-process.test.ts
bun typecheck

# packages/plugin, if the public excerpt type changes
bun typecheck

# packages/cli, for config boundary checks
bun typecheck
```

Extend [epilogue tests](/packages/tui/test/context/epilogue.test.ts) for ordered candidate batches, session/row isolation, two simultaneous sessions, selection-before-projection, inactive plugin removal, immutable candidate copies, and freeze after route/cache/disposer changes. Preserve render-isolation assertions; add a counter for cross-Session recomputation before choosing optimization.

Extend [lifecycle tests](/packages/tui/test/app-lifecycle.test.tsx#L264-L538): retain existing current-Session behavior under the explicit compatibility preset; add client-wide A→B→Home, closed tab, remote shared-tab addition, unvisited cached Session, routed child, deletion, and late hydration cases. Never weaken the no-new-requests-after-shutdown assertion.

The [process matrix](/packages/tui/test/app-lifecycle-process.test.ts#L6-L40) has nine cases: fixture and actual CLI × `app.exit`/SIGHUP/SIGINT/SIGTERM, plus hot-reload destruction. [Its fixture](/packages/tui/test/fixture/app-lifecycle-process.ts) delays stdout; cleanup is gated by the test, with `shutdown:0` projection assertions. Expand to two locally visited Sessions with unique plugin rows/snippets; assert exactly one envelope per selected Session, one wordmark, complete output only after cleanup, no post-destroy projections, unchanged exit statuses (0 for app.exit/SIGHUP, 130 for SIGINT/SIGTERM), and no epilogue-specific requests. Current tests expect exactly one global `Active`; update this to exactly one **per envelope**, not merely loosen the count.

Snippet fixtures should cover >20-message cache lacking the latest user, eviction and event-only suffixes, empty/attachment-only input, pending queue/steer, user delivery reorder, staged revert boundary present/absent, committed revert, multiple assistant Steps, empty/tool-only latest Step, streaming/interrupt, Unicode widths, terminal controls, and narrow/wide retained column widths. Existing [Client data tests](/packages/client/test/solid-data.test.ts) and [eviction tests](/packages/client/test/solid-eviction.test.ts) are supporting precedents, not suites to run unconditionally for a TUI-only patch.

## Cross-references

- [Current registry implementation](/.design/term-v2/epilogue-registry-implementation0.gpt56s.md): preserved immutable carry, projection isolation, plugin ownership, and writer invariants; this proposal changes single-Session ownership, not those guarantees.
- [Term-v2 README](/.design/term-v2/README.md) and [design index](/.design/term-v2/index.md): patch-stack intent, historical verification and known unrelated flakes. Add this checkpoint to navigation when the parent integrates/accepts the direction.
- [Implementation primer](/.design/term-v2/epilogue-implementation.md): prior implementation entry point, to be supplemented rather than silently replaced when the new scope is accepted.
