# Retained reactive epilogue cells

Date: 2026-08-30

Model: OpenAI GPT-5.6 Sol max (`gpt56s`)

Status: independent Possibility D research; no interface has been accepted or implemented

Source question: design a third, radically different interface for plugin-contributed OpenCode V2 TUI epilogue information. Explore a reactive snapshot/cell model in which plugins update retained plain data while alive and shutdown reads only frozen cells. Preserve current plugin cleanup, avoid renderer output, and define lookup-free shutdown, additive rows, cached `SessionInfo`, cleanup survival, hot reload, and deactivation behavior.

## Conclusion

Use host-owned, reactively computed epilogue cells. A plugin registers one synchronous derivation while it is active. The host runs that derivation in an explicitly owned Solid computation, immediately copies its structured rows, and retains only plain data. At shutdown the host freezes the cached `SessionInfo` and committed rows before renderer destruction. Plugin cleanup then runs unchanged, and final output formats only the frozen snapshot.

The defining invariant is:

```text
live Solid and cached data -> synchronous derivation -> retained plain cell
                                                     |
shutdown ----------------------------------------> freeze
                                                     |
                                          ordinary cleanup
                                                     |
                                           pure final format
```

There is no plugin callback, cache lookup, Promise, renderer read, server request, database access, or filesystem access in final epilogue production.

## Recommended interface

The recommended spelling is top-level `context.epilogue`, not `context.ui.epilogue`. The output is terminal UI policy, but the contribution itself is deliberately not a renderer or visual-slot operation.

```ts
export interface EpilogueRow {
  /** Single-line, unstyled label. */
  readonly label: string
  /** Single-line, unstyled value. */
  readonly value: string
}

export interface EpilogueCellInput {
  /**
   * An immutable host-owned clone for the currently routed Session.
   * Undefined off a Session route or before that Session has loaded.
   */
  readonly session: Readonly<SessionInfo> | undefined
}

export interface Epilogue {
  /**
   * Registers one plugin-scoped reactive output cell.
   *
   * The derivation runs only while the TUI is alive and must be synchronous.
   * Undefined or an empty array publishes no rows.
   */
  cell(
    key: string,
    derive: (input: EpilogueCellInput) => readonly EpilogueRow[] | undefined,
  ): () => void
}

export interface Context {
  // Existing members...
  readonly epilogue: Epilogue
}
```

The `key` is scoped by plugin ID. Effective cell identity is `(pluginID, key)`, which supports several cells per plugin and gives a replacement generation a stable identity to adopt.

The callback return type intentionally excludes:

- `Promise` or `Effect`;
- JSX or OpenTUI renderables;
- preformatted ANSI;
- a shutdown callback;
- replacement, suppression, or layout control;
- an arbitrary object whose serialization rules the host would need to infer.

One small interface hides reactive ownership, registration cleanup, copying, normalization, ordering, generation fencing, freeze timing, error isolation, and final host formatting. In the codebase-design vocabulary, this is intended to be a deep module at a dedicated seam rather than a shallow mirror of the renderer.

## Plugin usage

```ts
import { Plugin } from "@opencode-ai/plugin/tui"

export default Plugin.define({
  id: "acme.accounting",
  setup(context) {
    return context.epilogue.cell("session-usage", ({ session }) => {
      if (!session) return

      return [
        {
          label: "Cost",
          value: `$${context.data.session.cost(session.id).toFixed(2)}`,
        },
        {
          label: "Output",
          value: `${session.tokens.output} tokens`,
        },
      ]
    })
  },
})
```

The derivation may read Solid-backed `context.data`, `context.ui.router.current()`, or plugin signals and stores. Those reads become dependencies of the host-owned computation. The plugin does not need to create or dispose its own Solid root.

Async source data remains possible, but async work finishes during ordinary live operation and updates a signal or store:

```ts
import { Plugin } from "@opencode-ai/plugin/tui"
import { createSignal } from "solid-js"

export default Plugin.define({
  id: "acme.quota",
  setup(context) {
    const [quota, setQuota] = createSignal<string>()
    const controller = new AbortController()

    void refreshQuota(controller.signal).then(setQuota)

    const remove = context.epilogue.cell("quota", ({ session }) => {
      const value = quota()
      if (!session || !value) return
      return [{ label: "Quota", value }]
    })

    return () => {
      controller.abort()
      remove()
    }
  },
})
```

An in-flight refresh at exit does not delay output. Its result simply did not become part of the frozen snapshot.

## Output composition

The host owns the full presentation. One proposed order is:

```text
logo

Session    <title>
Active     <relative time>
<plugin row 1>
<plugin row 2>
Continue   opencode2 -s <session ID>
```

`Continue` remains last so supplemental information cannot displace the resume action. Core rows are not claims and cannot be replaced or suppressed.

Plugin rows compose in:

1. plugin enable order;
2. cell declaration order within the plugin;
3. row array order within the cell.

Duplicate labels are additive, not last-wins. If uniqueness later proves important, namespacing or reserved labels should be an explicit interface revision rather than an accidental map overwrite.

The host validates or normalizes all labels and values. At minimum it should define behavior for empty strings, newlines, carriage returns, C0/C1 control characters, ANSI escape sequences, and oversized values. Plugins provide semantic strings; the host owns alignment, colors, truncation, terminal width, and ANSI reset discipline.

## Cached SessionInfo

The cell input is a copied `SessionInfo`, not a live Solid proxy retained through teardown. While the TUI is alive, a stable host computation tracks the current route and cached Session:

```ts
createComputed(() => {
  const current = route.data
  if (current.type !== "session") {
    epilogue.selectSession(undefined)
    return
  }

  epilogue.selectSession(current.sessionID)
  const session = data.session.get(current.sessionID)
  if (session) epilogue.rememberSession(session)
})
```

`rememberSession` traverses and copies the JSON-compatible public Session object while the computation is tracked. The registry stores an immutable plain clone and exposes that clone through an internal signal to every cell derivation.

The selection and data are separate:

- changing from Session A to Session B clears A before B is available;
- leaving a Session route clears the Session epilogue;
- a Session route with no hydrated `SessionInfo` produces no final epilogue;
- a cache update replaces the clone and synchronously invalidates dependent cells;
- deleting the selected Session clears its clone rather than printing stale identity.

This is stronger than the current epilogue closure, which captures only a truncated title, Session ID, and update time. It also means final formatting can use `time.updated`, `time.idle`, `agent`, `model`, `cost`, tokens, or metadata without a shutdown lookup. Which fields core presentation should display remains separate policy.

## Lifecycle

| Transition | Retained-cell behavior |
| --- | --- |
| Initial setup | Open a generation lease and stage cells created by setup. |
| Initial derivation | Run synchronously under a host-created Solid owner and copy valid rows. |
| Live reactive update | Replace the cell's copied rows; retain no Solid proxy or JSX. |
| Successful hot reload | Atomically commit the replacement generation's staged cells. |
| Failed import | Keep the running generation and its committed cells unchanged. |
| Failed replacement setup | Discard staging and keep the previous committed cells while current keep-last-good restoration runs. |
| Manual deactivation | Exclude the plugin's live cells immediately. |
| Re-enable | Commit a fresh generation; hidden stale rows are not resurrected implicitly. |
| Shutdown while active | Freeze selected Session plus committed active cells before renderer destruction. |
| Plugin cleanup | Revoke leases and dispose computations normally; frozen data is unaffected. |
| Late async completion | Ignore every write after freeze. |
| Final output | Purely format the frozen Session and rows after scoped cleanup. |

### Cleanup survival

"Survives plugin cleanup" does not mean keeping plugin code or its reactive owner alive. It means:

1. the live derivation has already published copied strings;
2. the shutdown edge freezes those strings before cleanup;
3. cleanup disposes the derivation and releases every plugin reference;
4. the frozen copy remains owned by `Tui.run` outside the renderer scope;
5. final output reads only that copy.

This avoids changing setup cleanup signatures, cleanup ordering, cleanup awaiting, or the shutdown finalizer chain.

### Hot reload transaction

The robust form uses a small generation transaction around cells:

```text
committed generation N
        |
        +---- replacement setup N+1 writes staging cells
                         |
                         +---- success: atomically publish N+1
                         |
                         +---- failure: discard N+1, retain N
```

Old generation leases are revoked before cleanup-era signal mutation can update retained values. The registry must not retain old callbacks after detachment.

Shutdown during a hot reload sees either generation N or fully committed N+1, never partial setup output. Manual disable differs from replacement: disable removes visibility, while replacement retains the last committed generation until the new one commits.

This transaction is the most ambitious part of the design. The final addendum distinguishes it from the smaller prototype needed to prove the seam.

## Hidden implementation

### TUI-owned registry

Create a plain registry next to the current escaped exit state, outside renderer and plugin ownership:

```ts
type FrozenEpilogue = {
  readonly session: Readonly<SessionInfo> | undefined
  readonly cells: readonly {
    readonly pluginID: string
    readonly key: string
    readonly rows: readonly EpilogueRow[]
  }[]
}

const epilogue = createEpilogueCells()
```

The live registry can use Solid signals internally so derivations observe current copied Session state, but its durable values are plain arrays and strings. A `Map` is sufficient; `storage.memory` is not required for the registry.

### Activation-owned computation

`createPluginContext` already has the plugin ID, an `owned` cleanup list, and access to host facilities. The adapter can establish an owner even when plugin setup resumes after an `await`:

```ts
const lease = epilogue.stage(pluginID, generation, key)

const dispose = createRoot((dispose) => {
  createComputed(() => {
    lease.publish(derive({ session: epilogue.session() }))
  })
  return dispose
})

owned.push(async () => {
  lease.detach()
  dispose()
})
```

The lease is detached before disposing the root so cleanup-era mutations cannot publish. Disposal remains in the same existing activation-owned list used by routes, slots, Markdown renderers, and other plugin registrations.

`createComputed` is preferable to a deferred initial effect for this adapter because the latest data should be captured synchronously before a same-tick exit. A normal `createEffect` may still be sufficient if tests prove the scheduling invariant. This is an implementation choice hidden behind `cell`.

### Error containment

Each computation needs non-JSX containment. Proposed behavior:

- a thrown derivation reports one plugin error and keeps the previous valid cell value;
- an initial throw leaves the cell empty;
- a returned thenable is rejected as an invalid synchronous contribution;
- invalid rows are omitted or normalized without affecting later cells;
- a later successful derivation clears the error state and replaces the value.

Keeping last valid output matches current keep-last-good plugin behavior, but it can expose stale data. Clearing on runtime error is a defensible alternative and should be decided with tests.

### Freeze edge

Every host-owned exit path should converge on an idempotent synchronous freeze before renderer destruction:

```ts
const shutdownRenderer = () => {
  epilogue.freeze()
  destroyRenderer(renderer)
}
```

The `ExitProvider` callback and process signal handlers should use that function. The renderer's early `destroy` listener should also call `freeze()` as a fallback before opening the shutdown latch.

The registry is retained outside the scoped render tree, so a fallback freeze still has copied values even if Solid disposal has detached producers. Explicit pre-destroy freeze remains the primary invariant.

### Final format

After `Effect.scoped` has completed its finalizers:

```ts
const snapshot = epilogue.frozen()
if (snapshot?.session) process.stdout.write(sessionEpilogue(snapshot) + "\n")
```

`sessionEpilogue` becomes a pure host formatter over `FrozenEpilogue`. Calling `Date.now()` to render relative recency is not a lookup; accepting an explicit clock remains useful for deterministic presentation tests.

## State model

One possible internal record shape is:

```ts
type CellRecord = {
  readonly pluginID: string
  readonly key: string
  readonly pluginOrder: number
  readonly cellOrder: number
  generation: number
  state: "staged" | "committed" | "hidden"
  rows: readonly EpilogueRow[]
}
```

The public interface does not expose this state model. It exists only to make ordering and transitions explicit and testable.

Freeze copies only committed cells belonging to plugins that are logically active at the freeze edge. It does not infer activity from cleanup having run: final shutdown cleanup makes every registration inactive after the snapshot has already been selected.

## Tradeoffs

Strengths:

- no plugin code or cache access runs during shutdown;
- ordinary Solid reactivity keeps values current while the application is healthy;
- full cached `SessionInfo` is available without retaining a proxy;
- rows are structured and additive, while host output remains safe and consistent;
- plugin cleanup is unchanged and can release all plugin code;
- generation leases can make reload and failed replacement behavior precise;
- the public interface is one operation with strong implementation depth.

Costs:

- output is the last successful synchronous snapshot and may trail async work;
- the robust generation transaction adds internal lifecycle policy;
- full `SessionInfo` copying costs more than capturing three primitives, though it is small relative to message history;
- cell ordering and disablement become public compatibility commitments;
- reactive derivation failures need containment independent of JSX `ErrorBoundary`;
- custom colors, multiline layout, links, and arbitrary terminal rendering are intentionally unavailable;
- a broad downstream-only plugin interface is harder to carry than the fixed Active row unless it is upstreamed.

## Experiments already run

The following read-only experiments were run from `packages/tui`; no repository files were changed.

### Current shutdown behavior

```text
bun test test/app-lifecycle.test.tsx --filter \
  'SIGINT prints the session epilogue after cleanup'
```

The file's 20 tests passed, including the target that proves current output occurs after cleanup and performs no prompt request during exit.

### Current memory and reload behavior

```text
bun test test/plugin-hot-reload.test.tsx --filter \
  'memory storage survives hot reload'
```

The file's 9 tests passed, including the target that demonstrates `storage.memory` state is shared by old and replacement plugin generations.

### Plain cell after Solid disposal

A standalone `createRoot` experiment drove a plain object cell from signal value `1` to `2`, disposed the root, then drove the source to `3`:

```json
{"before":2,"after":2}
```

The root stopped updating, while the copied value remained. This is the central producer-detaches, value-survives behavior required by the design.

Further renderer-specific experiments appear in the final implementability addendum.

## Acceptance experiments

1. A plugin row updates from cached Session state and prints after plugin cleanup without a shutdown client call.
2. Two plugins and several cells remain additive and deterministic.
3. Cleanup mutates the source signal, but the already-frozen row remains unchanged.
4. Successful reload atomically replaces old rows.
5. Failed setup retains previous rows.
6. Manual deactivation excludes rows, while shutdown cleanup does not erase them.
7. Shutdown during pending replacement setup prints the prior committed generation.
8. Session switching never prints the prior Session or its plugin rows.
9. Leaving the Session route suppresses the complete Session epilogue.
10. Throw, Promise, JSX, newline, ANSI, control characters, empty strings, duplicate labels, and oversized values are contained.
11. Every graceful renderer-destruction path freezes exactly once.
12. Real subprocess `SIGINT`, `SIGTERM`, and `SIGHUP` runs print only after terminal restoration and cleanup.

## References

- [Current escaped epilogue and post-scope output](/packages/tui/src/app.tsx#L226-L457)
- [Current internal epilogue singleton](/packages/tui/src/context/epilogue.tsx)
- [Current Session epilogue derivation](/packages/tui/src/routes/session/index.tsx#L198-L205)
- [Current pure presentation function](/packages/tui/src/util/presentation.ts#L26-L48)
- [Public TUI plugin context](/packages/plugin/src/tui/context.ts#L31-L53)
- [Public cached Session data interface](/packages/plugin/src/tui/context.ts#L61-L99)
- [Full public `SessionInfo` shape](/packages/client/src/promise/generated/types.ts#L1644-L1660)
- [Synchronous Solid Session lookup](/packages/client/src/solid/data.ts#L1244-L1261)
- [Plugin context ownership adapter](/packages/tui/src/plugin/api.tsx#L74-L109)
- [Plugin activation and deactivation](/packages/tui/src/plugin/context.tsx#L137-L224)
- [Serialized hot reload and keep-last-good restoration](/packages/tui/src/plugin/context.tsx#L223-L245)
- [Generation comparison and swap](/packages/tui/src/plugin/context.tsx#L342-L399)
- [Awaited TUI plugin finalizer](/packages/tui/src/plugin/context.tsx#L503-L525)
- [In-memory storage implementation](/packages/tui/src/context/storage.tsx#L23-L30)
- [Memory entry memoization](/packages/tui/src/context/storage.tsx#L47-L100)
- [App slot mount](/packages/tui/src/app.tsx#L1289-L1319)
- [Visual Slot component semantics](/packages/tui/src/plugin/render.tsx#L80-L144)
- [Slot claim ordering](/packages/tui/src/plugin/context.tsx#L430-L467)
- [Current shutdown regression test](/packages/tui/test/app-lifecycle.test.tsx#L264-L343)
- [Current memory hot-reload test](/packages/tui/test/plugin-hot-reload.test.tsx#L398-L426)

## Cross-references

- [Pluggable TUI epilogues: possibility space](/.design/term-v2/epilogue-plugins0.gpt56s.md): establishes the requirements and compares the fixed carry, shutdown-time registry, headless logical slot, and retained cells. This note independently deepens Possibility D.
- [CLI plugin guide](https://opencode.ai/v2/docs/build/plugins/cli): documents cached data, memory storage, visual slots, and public TUI plugin lifecycle.
- [General plugin guide](https://opencode.ai/v2/docs/build/plugins): establishes setup, cleanup, and registration ownership semantics.
- [Catalog/config/plugin lifecycle options](/specs/v2/catalog-config-plugin-lifecycle.md): prior work on ordered contributions, disablement, replacement, and rematerialized state in another plugin domain.
- [Slot resolver](/packages/tui/src/plugin/structure.ts): existing pure ordering and placement implementation, useful for comparing reuse against a dedicated cell seam.
- [Plugin generation lifecycle](/packages/tui/src/plugin/context.tsx#L137-L224): the current lifecycle this design must adapt to rather than replace.

# Addendum: Implementability and mechanical sympathy

## Direct answer to the challenge

The statement that retained cells have the "largest implementation and conceptual surface" was overstated as a blanket conclusion.

It is accurate only for the fully transactional version described above if that version independently implements cell generations, staging, atomic commit, last-good retention, ordering, and deactivation policy on its first iteration. It is not accurate for the public interface, which is one small operation, and it is not accurate for a minimal implementation that delegates ownership and reactivity to machinery already present in Solid and `PluginProvider`.

A more precise assessment is:

- the public conceptual surface is smaller and more honest than teaching `SlotClaim.render` to return either JSX or data;
- a minimal retained cell has medium implementation surface, not the largest;
- a robust atomic cell transaction has the widest lifecycle-policy surface;
- generalizing the existing Slot implementation to path-specific non-JSX output may require more TypeScript and renderer-adapter change than a dedicated cell;
- the fixed Active carry remains much smaller than every generic plugin interface.

The original critique conflated three things: interface size, implementation policy, and perfection on the shutdown-during-hot-reload edge. Those should be evaluated separately.

## Native reuse inventory

| Existing mechanism | Native capability | Retained-cell reuse | Missing policy |
| --- | --- | --- | --- |
| Solid signals | Owner-independent reactive values | Hold current copied `SessionInfo` and invalidate derivations | Snapshot cloning and terminal normalization |
| `createRoot` | Explicit owner plus deterministic disposer | Give setup-time derivations a valid owner even after `await` | Registration identity and error reporting |
| `createComputed` or `createEffect` | Dependency tracking and reruns | Recompute only when Session or plugin state changes | Decide eager versus deferred first run |
| Plain closure or object | Survives producer disposal when retained elsewhere | Hold the latest copied row array | Freeze and active-cell selection |
| `storage.memory` | TUI-lifetime, plugin-keyed Solid store shared across reloads | Optional plugin source state or prototype backing store | Host enumeration, ordering, activation, and freeze semantics |
| `owned` cleanup list | Idempotent activation-owned teardown | Dispose a cell root without changing plugin cleanup | Distinguish manual removal from replacement retention |
| `PluginProvider` serialization | No interleaved reconcile, toggle, or shutdown mutation | Place optional cell transition hooks around existing swaps | Atomic cell generation commit if required |
| registration store order | Stable plugin order and in-plugin registration order | Supply deterministic cell ordering | Cells are not currently a registration kind |
| Slot claims | Existing component mount, owner, ordering, hot reload, and error boundary | Mount a headless component for a prototype | Visual replacement semantics are wrong for mandatory epilogue data |
| current epilogue thunk | Escapes render scope and prints after cleanup | Carry a frozen structured snapshot instead of one string thunk | Additive plugin rows and full Session cache |
| renderer destroy lifecycle | One synchronous edge before shutdown latch and Effect finalizers | Freeze once before cleanup | Converge all destroy entry points on the freeze function |

Most mechanisms therefore exist. The irreducible new module is small:

```text
plugin-scoped identity + copied rows + active ordering + synchronous freeze
```

Solid already supplies the difficult reactive ownership behavior. The renderer lifecycle already supplies the freeze edge. `PluginProvider` already supplies activation cleanup and serialization. A minimal implementation should not recreate any of those.

## What can be reused without adaptation

### Solid roots and effects

`createRoot` can be called directly inside `context.epilogue.cell`. It establishes an owner even though plugin setup is invoked through asynchronous reconcile. The returned disposer fits the existing `owned` list exactly.

The root does not need a renderer or a component. Its computation can update a plain object or `Map`. Disposing the root stops updates but does not erase copied values retained by the host. The standalone experiment in the main note demonstrated this behavior.

This means "reactive ownership" is not new machinery. The new code is an adapter around native Solid ownership.

### Existing activation cleanup

`createPluginContext` already pushes idempotent cleanup functions into `owned`. A cell can follow the same pattern as route, slot, and Markdown registration. Plugin-returned cleanup can call the returned cell disposer early; automatic activation cleanup can call it again safely.

No setup signature, cleanup signature, cleanup order, or finalizer needs to change.

### Existing renderer shutdown

The current `Tui.run` already keeps an epilogue thunk outside `Effect.scoped` and prints it only after the scope closes. The retained-cell implementation can replace the thunk's captured primitives with a frozen structured object. It does not need a new post-shutdown phase.

The primary wiring change is to make every normal exit and signal call an idempotent `freezeAndDestroy` function. The existing early `renderer.once("destroy")` listener remains a fallback.

## What can be reused with care

### `storage.memory`

`storage.memory` proves that a host-owned store above plugin generations is viable. It is memoized for the TUI lifetime, is synchronously mutable, and is explicitly documented to survive hot reload.

It is not, by itself, the epilogue seam:

- plugin keys are scoped and the host has no public scan operation for memory entries;
- a memory entry has no active/inactive contribution status;
- memory insertion order is not documented as plugin contribution order;
- manual deactivation does not erase the store;
- the value is a Solid proxy rather than the desired frozen shutdown snapshot.

There are three mechanically valid uses:

1. Plugins use `storage.memory` for quota, accounting, or other source state, and a cell derives rows from it.
2. A prototype cell adapter calls the host's private `storage.memory` with `(pluginID, key)` and registers an accessor separately.
3. The registry copies the small implementation pattern of a host-lifetime map and synchronous mutation without literally depending on Storage.

The third is smallest and most semantically local. Reusing the concept is better than making epilogue ownership a hidden storage convention.

### Plugin generation machinery

The current reconciler already resolves desired generations before touching running ones, serializes all mutations, keeps import-failed versions active, and restores a previous version after setup failure. Retained cells do not need another plugin loader.

A minimal cell registration can simply participate in `owned` cleanup. On reload it disappears with the old activation and reappears when the replacement registers. Existing setup-failure restoration recreates the old cell.

Only one edge requires extra policy: renderer destruction while the serialized replacement is between old-cell removal and new-cell publication. Solving that edge atomically requires either:

- retaining the old committed row during a `replace` transition;
- delaying logical cell removal until replacement setup commits;
- or freezing after the loading chain settles but before final deactivation, which is less attractive because it adds asynchronous coordination to the snapshot edge.

The first option is a small transition hook in `PluginProvider`, not a parallel generation system. The provider knows whether deactivation is a manual disable, structural reconcile, replacement, or shutdown. That reason need not be exposed to plugin cleanup.

The smallest prototype should omit this refinement, prove the common lifecycle, and add the hook only if the shutdown-during-reload test demonstrates a product-relevant gap.

### Slot claims

Slot claims provide two kinds of reuse:

1. A component mount gives plugin code a valid Solid owner and automatic cleanup.
2. The claim list gives deterministic plugin and within-plugin ordering.

They also carry visual policy that an epilogue should not inherit:

- `replace` can suppress additive claims;
- ancestor replacement can suppress descendants;
- a missing path can degrade an additive claim to an ancestor;
- mounting depends on the visual Slot tree;
- the current stored render type is JSX-specific;
- the JSX `ErrorBoundary` does not contain a non-JSX data derivation.

Reusing an existing `app` claim for a private prototype is mechanically useful. Generalizing public Slot output is not automatically smaller than a dedicated cell adapter.

## Minimal retained-cell variants

### Variant 1: semi-regular writable push cell

Public shape:

```ts
const cell = context.epilogue.cell("activity")

cell.set([{ label: "Active", value: activeAgo(lastUpdated) }])
```

A plugin pushes whenever it already refreshes, or on a modest interval. The host copies rows synchronously. Shutdown freezes the last push.

Reuse:

- no Solid root is required by the host;
- existing plugin timers and cleanup drive updates;
- `owned` can dispose the cell handle;
- the current renderer lifecycle freezes plain data.

Costs:

- the value may lag by the interval;
- every plugin must decide when to push;
- active Session changes can be missed unless the plugin also observes routing;
- timers exist only to keep display data fresh;
- a callback-free writable handle exposes more mutation states (`set`, `clear`, disposed writes) than the computed interface.

Reachability: highest. It is the smallest complete data path.

Carryability: good, because it avoids Solid and Slot changes, but caller burden is higher.

### Variant 2: event-driven writable cell

Public shape is the same writable handle, but plugins update from `context.data.on` or `context.data.listen`:

```ts
const cell = context.epilogue.cell("activity")

const update = () => {
  const route = context.ui.router.current()
  const session = route.type === "session" ? context.data.session.get(route.sessionID) : undefined
  cell.set(session ? [{ label: "Active", value: activeAgo(session.time.updated) }] : [])
}

update()
const stop = context.data.listen(update)
```

Reuse:

- existing typed event subscriptions;
- synchronous cached Session lookup;
- existing cleanup.

Costs:

- route navigation itself is reactive local state, not necessarily a server event;
- known cache projection gaps can leave timestamps stale;
- every plugin duplicates route/session selection;
- broad `data.listen` callbacks run for unrelated events;
- correct initial publication remains imperative.

Reachability: high for event-shaped accounting and status data, incomplete as the sole Session-route mechanism.

Carryability: good in the host, weaker across plugin callers because policy is duplicated.

### Variant 3: headless component in the existing app slot

The plugin reuses a visual claim only to acquire a Solid owner:

```tsx
function Snapshotter(props: { publish: (rows: EpilogueRow[]) => void }) {
  const context = usePlugin()

  createEffect(() => {
    const route = context.ui.router.current()
    const session = route.type === "session" ? context.data.session.get(route.sessionID) : undefined
    props.publish(session ? rowsFor(session) : [])
  })

  return null
}

context.ui.slot({
  append: "app",
  render: () => <Snapshotter publish={cell.set} />,
})
```

Concrete experiment:

```json
{
  "frame":"                    \n                    \n                    \n",
  "cell":"beta",
  "allocated":1,
  "rootChildren":0,
  "requests":0
}
```

The measured allocation delta of one was the test renderer root itself. The null component added no OpenTUI renderable, no root child, and no render request when its source signal changed. Its Solid effect still updated the plain cell from `alpha` to `beta`.

This is mechanically much better than the phrase "renderer output" suggests. It is a real, low-overhead prototype path.

It is still not the recommended public seam because correctness depends on the `app` Slot being mounted and not replaced. A plugin that replaces the `app` boundary can suppress additive claims under current slot resolution. Epilogue collection should not be suppressible by visual layout policy.

Reachability: already available for an internal or private prototype, once a host collector exists.

Carryability: good for a prototype, questionable as a permanent semantic dependency on visual slot behavior.

### Variant 4: host-owned computed cell

This is the original recommendation:

```ts
context.epilogue.cell("activity", ({ session }) => {
  if (!session) return
  return [{ label: "Active", value: activeAgo(session.time.updated) }]
})
```

The adapter internally creates the same Solid root and computation that the headless component would receive, but it does so without the renderer or Slot tree.

Reuse:

- native `createRoot` and `createComputed`;
- existing `owned` cleanup;
- existing cached Solid data;
- current epilogue escape and renderer freeze edge;
- optional small transition hooks in existing plugin serialization.

Costs:

- one new public operation;
- one internal registry;
- non-JSX error containment;
- explicit ordering and deactivation semantics.

Reachability: high. No missing platform primitive was found.

Carryability: better than generalizing Slot output because changes can remain localized to the plugin context adapter and epilogue module.

### Variant 5: truly invisible OpenTUI cell

This variant stores serialized row data in a real hidden renderable, for example:

```tsx
<text visible={false} ref={setCell}>{JSON.stringify(rows())}</text>
```

The host would retain a `TextRenderable` reference and read `plainText` at the freeze edge.

This was tested rather than dismissed. A test renderer mounted one visible text and one `visible=false` text whose `content` was updated by a Solid effect. The result after changing `alpha` to `beta` was:

```json
{
  "frame":"VISIBLE             \n                    \n                    \n",
  "hiddenText":"beta",
  "hiddenVisible":false,
  "hiddenSize":[1,1],
  "containerChildren":2,
  "allocated":4,
  "requests":1
}
```

The hidden text did not appear in the frame and did not consume a visible line. OpenTUI maps `visible=false` to Yoga `Display.None`, and invisible renderables return before layout-list generation. The reactive content remained readable through `plainText`.

The same experiment read `plainText` after renderer destruction:

```json
{"before":"alpha","after":"Error: TextBuffer is destroyed"}
```

This establishes concrete properties:

- the variant is reachable;
- it is genuinely invisible rather than merely painted with transparent colors;
- it still allocates a `TextRenderable` and native text-buffer state;
- changing hidden content still requested a renderer frame;
- the semantic value is unavailable after renderer destruction;
- pre-destroy freeze remains mandatory;
- encoding rows as text adds serialization and parsing without adding capability.

An absolute-positioned node outside the viewport is worse: unlike `visible=false`, it remains in layout/render-list and culling policy. An opacity-zero node also remains in layout. `visible=false` is the only mechanically credible OpenTUI-cell form found.

The hidden renderable is therefore a valid experiment and a poor final module. The null headless component or direct Solid root provides the same reactive ownership without allocation, render requests, text serialization, or renderer-lifetime coupling.

Relevant upstream mechanics:

- [`RenderableOptions.visible`](https://github.com/anomalyco/opentui/blob/main/packages/core/src/Renderable.ts#L97-L110)
- [`visible` maps to Yoga `Display.None`](https://github.com/anomalyco/opentui/blob/main/packages/core/src/Renderable.ts#L337-L365)
- [Invisible renderables skip update-list generation](https://github.com/anomalyco/opentui/blob/main/packages/core/src/Renderable.ts#L1382-L1441)
- [`TextBufferRenderable.plainText`](https://github.com/anomalyco/opentui/blob/main/packages/core/src/renderables/TextBufferRenderable.ts#L199-L201)
- [Solid renderer root disposal on renderer destruction](https://github.com/anomalyco/opentui/blob/main/packages/solid/index.ts#L9-L68)
- [OpenTUI's own invisible Solid Slot renderables](https://github.com/anomalyco/opentui/blob/main/packages/solid/src/elements/slot.ts#L91-L115)

## Comparative surface

| Variant | New public concepts | Renderer objects | Automatic route reactivity | Shutdown plugin call | Hot-reload precision | Relative implementation surface |
| --- | --- | --- | --- | --- | --- | --- |
| Semi-regular push | cell handle plus `set` | none | plugin-owned | none | ordinary cleanup gap | smallest |
| Event-driven push | cell handle plus `set` | none | incomplete | none | ordinary cleanup gap | small host, repeated caller logic |
| Headless app component | collector plus existing Slot | none for null output | yes | none | existing Slot lifecycle | small prototype, semantic coupling |
| Host-owned computed cell | one `cell(key, derive)` operation | none | yes | none | ordinary or transactional | medium |
| Invisible OpenTUI text | hidden-renderable convention plus collector | yes | yes | renderer read at freeze | existing Slot lifecycle | medium and mechanically wasteful |
| Generalized logical Slot | path-dependent Slot output types | none | yes | none | existing claims plus new adapter | medium to large type surface |
| Full transactional cells | one public operation | none | yes | none | strongest | largest internal policy surface |

The minimal host-owned computed cell is plausibly smaller than a generalized logical Slot because it does not alter `SlotMap`, `SlotClaim`, erased render storage, `resolveSlots`, or `PluginBoundary`.

## Exact touch points

The table separates the smallest complete public prototype from optional robust-generation work.

| Touch point | Smallest prototype change | Optional robust change | Kind of change |
| --- | --- | --- | --- |
| `packages/plugin/src/tui/context.ts` | Add `EpilogueRow`, `EpilogueCellInput`, `Epilogue`, and `Context.epilogue` | None | Additive public type/interface |
| `packages/tui/src/context/epilogue.tsx` | Replace singleton setter value with a small registry facade: Session clone, cell map, publish/remove, freeze | Add staged/committed generations and logical plugin activity | Localized module rewrite |
| `packages/tui/src/plugin/api.tsx` | Add `useEpilogue` to host facilities; implement `cell` with `createRoot`/`createComputed`; push disposer to `owned` | Pass a generation/transition lease | Small adapter extension |
| `packages/tui/src/plugin/context.tsx` | No change required for ordinary registration cleanup | Mark `replace`, `disable`, and `shutdown` transitions or commit staged cells after setup success | Optional lifecycle integration; highest semantic risk |
| `packages/tui/src/app.tsx` | Freeze before every renderer destroy path; carry frozen object past `Effect.scoped`; pass it to formatter | None | Thin lifecycle wiring in an existing carry hotspot |
| `packages/tui/src/routes/session/index.tsx` | Publish a full copied current Session instead of one final string thunk, or call a new Session snapshot setter | None | Small reactive snapshot change |
| `packages/tui/src/util/presentation.ts` | Accept structured plugin rows and format them additively before Continue | None | Pure formatter extension |
| `packages/tui/test/app-lifecycle.test.tsx` | Add cleanup gate, no-lookup assertion, and additive row output | Add shutdown-during-reload gate | Integration tests |
| `packages/tui/test/plugin-hot-reload.test.tsx` | Verify recreation and manual disable | Verify atomic old/new generation selection | Lifecycle tests |
| `packages/tui/test/util/presentation.test.ts` | Verify ordering, normalization, and reserved core rows | None | Pure tests |
| `packages/www/src/docs/content/build/plugins/cli.mdx` | Document interface, synchronous derivation, row restrictions, and cleanup | Document exact reload guarantees | Public documentation |

No Protocol, Server `HttpApi`, generated client, Core, Schema, or persistent storage change is required.

A headless logical Slot implementation would additionally touch:

- `packages/plugin/src/tui/context.ts` Slot output typing;
- `packages/tui/src/plugin/api.tsx` erased output storage;
- `packages/tui/src/plugin/context.tsx` claim storage and resolution inputs;
- `packages/tui/src/plugin/render.tsx` or a parallel headless adapter;
- possibly `packages/tui/src/plugin/structure.ts` if append-only semantic claims cannot use the current placement algebra unchanged.

That is why dedicated cells are not obviously the largest option.

## Downstream carry conflict risk

| Area | Risk | Reason |
| --- | --- | --- |
| `packages/tui/src/app.tsx` | high | Central lifecycle file, already touched by the term-v2 signal and epilogue carry; upstream changes frequently converge here. Keep wiring thin. |
| `packages/tui/src/plugin/context.tsx` | high | Active hot-reload, ordering, and keep-last-good implementation. Avoid for the first prototype. |
| `packages/tui/src/plugin/api.tsx` | medium | Central public-context adapter, but a new top-level facility can be localized. |
| `packages/plugin/src/tui/context.ts` | medium | Public beta interface; type additions are mechanically simple but require upstream agreement. |
| `packages/tui/src/context/epilogue.tsx` | low to medium | Small focused module and natural ownership location, though the current carry already changes its contract. |
| `packages/tui/src/routes/session/index.tsx` | medium | Large Session route and common upstream hotspot; keep the change to one existing effect. |
| `packages/tui/src/util/presentation.ts` | low | Small pure module with narrow responsibility. |
| Slot resolver and renderer files | high if touched | Broad visual extension work can collide semantically even when textual merges are clean. Dedicated cells avoid these files. |
| Tests and docs | low | Additive files or localized cases, except fixture setup may follow plugin interface evolution. |

Carryability favors a new deep epilogue module plus thin adapters. It disfavors broadening the visual Slot algebra and disfavors embedding generation policy across several existing lifecycle functions.

If the interface cannot be upstreamed, the fixed Active carry remains cheaper to refresh. A generic downstream-only interface pays for itself only if several local plugins use it.

## Smallest complete prototype plan

The smallest useful prototype should test the public seam without implementing transactional generation staging.

1. Change the internal epilogue module from one setter to a TUI-owned registry containing copied Session data, copied rows, and idempotent `freeze()`.
2. Add the public `context.epilogue.cell(key, derive)` type exactly once; do not add writable and computed variants simultaneously.
3. In `createPluginContext`, implement `cell` with native `createRoot` plus `createComputed`, and append its idempotent disposer to the existing `owned` list.
4. Reuse the current Session route effect to update the registry's selected cached `SessionInfo`; do not add a Session request.
5. Converge process signals and `ExitProvider` on `freeze()` followed by `destroyRenderer()`.
6. Extend the pure presentation function to insert normalized plugin rows before Continue.
7. Add one fixture plugin with two reactive cells, a cleanup mutation, and a setup-failure replacement.
8. Prove no OpenTUI renderable is allocated by the cell adapter and no render is requested on a row-only update.
9. Prove stdout remains empty until cleanup finishes, then contains the pre-cleanup frozen rows exactly once.
10. Document the prototype reload guarantee honestly: ordinary replacement cleanup can create a brief no-cell interval.

This prototype does not modify `packages/tui/src/plugin/context.tsx`, `packages/tui/src/plugin/render.tsx`, or `packages/tui/src/plugin/structure.ts`.

After the prototype, run one gated test that destroys the renderer in the replacement interval. If missing rows are unacceptable in that reachable state, add a single transition-aware lease hook to the existing serialized reconcile. Do not preemptively build a parallel generation manager.

## Recommendation

Retain the original host-owned computed-cell interface as the best final design. It is reachable with primitives already in the repository, gives callers a deep and renderer-independent seam, and is likely smaller than generalizing visual Slot output.

Revise the earlier size judgment as follows:

> Retained cells have a small public conceptual surface and a medium minimal implementation surface. They become the largest option only when full atomic generation retention is included. That refinement should be earned by a failing shutdown-during-reload experiment, not assumed as first-version machinery.

For implementation order and carryability:

1. Keep the fixed Active carry until a generic interface is likely to land upstream.
2. Prototype the dedicated computed cell without touching `PluginProvider` generation logic.
3. Use the already-completed null-component and hidden-renderable experiments as mechanical baselines, not as final interfaces.
4. Add transition-aware generation retention only if the gated reload experiment requires it.
5. Prefer the dedicated cell over a generalized headless Slot because it avoids visual suppression semantics and concentrates changes in the epilogue module plus one plugin adapter.

The most mechanically sympathetic path is therefore neither a new renderer abstraction nor a parallel plugin lifecycle. It is a small retained-data module that borrows Solid ownership, existing activation cleanup, and the current pre-destroy/post-cleanup epilogue lifecycle.
