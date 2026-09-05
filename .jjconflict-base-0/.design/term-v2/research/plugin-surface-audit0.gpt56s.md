# CLI plugin surface audit for retained epilogues

Date: 2026-08-30

Model: OpenAI GPT-5.6 Sol max (`gpt56s`)

Status: independent source and documentation audit; no interface is proposed as accepted

## Executive finding

A CLI plugin can do nearly all of the live-state work needed by an epilogue
contribution today:

- discover the displayed Session from the router;
- synchronously read its cached `SessionInfo`;
- react to route and Solid-store changes;
- subscribe to typed server events;
- retain copied state across plugin hot reloads in `storage.memory`;
- mount an owner-bearing component that returns `null` and creates no OpenTUI
  renderable;
- expose a preview through an ordinary slot or plugin route.

It cannot, through a supported OpenCode API, add a row to the full TUI's
post-teardown epilogue. There is no `exit`, `shutdown`, or `epilogue` member in
the public CLI plugin context. The host has an internal singleton epilogue
setter and a post-`Effect.scoped` write, but neither is a plugin registry.

The practical boundary is therefore:

> Live derivation and retention are already plugin-capable. Final composition
> into the restored terminal still requires a host seam.

The smallest credible host seam is push-retained: plugins publish copied rows
while alive, the host freezes the current ordered rows on the existing renderer
destroy edge before Solid disposal, normal teardown continues, and the host
writes only the frozen string after the scope closes. No plugin callback or
Session lookup is needed during shutdown.

## Version and documentation boundary

This audit inspected the carried checkout based on upstream commit
`e70d667a9fe3` and also checked the newer `v2@origin` tip
`6a2c3e91c780`. The refresh record identifies `e70d667a9fe3` as the upstream
base ([refresh record lines 9-17](/.design/term-v2/refresh-20260829.model-unspecified.md#L9-L17)).

The relevant Session schema, generated `SessionInfo`, Solid data cache, public
CLI plugin context, and CLI plugin capability guide have no changes in the
carried signal/Active stack. `SessionInfo.time.updated` is therefore upstream,
not a field introduced by this carry. It remains present at the newer
`v2@origin` tip as well.

The hosted V2 guides are slightly newer than this checkout in plugin packaging:

- The hosted [CLI plugin guide](https://opencode.ai/v2/docs/build/plugins/cli)
  says a package exports `./tui` beside its main plugin.
- The checkout's guide still says to set `tui: true`
  ([local guide lines 416-451](/packages/www/src/docs/content/build/plugins/cli.mdx#L416-L451)).
- The hosted [CLI plugin loading guide](https://opencode.ai/v2/docs/cli/plugins)
  uses colocated `plugins/<name>/index.ts` and `plugins/<name>/tui.ts` files.
- This checkout discovers direct files under `plugins/tui`
  ([local guide lines 50-59](/packages/www/src/docs/content/cli/plugins.mdx#L50-L59),
  [implementation lines 8-38](/packages/tui/src/plugin/discovery.ts#L8-L38)).

That packaging drift does not change the runtime capabilities audited below.
Use the hosted layout for an installed current V2 client and the checkout layout
when prototyping directly against this worktree.

## Session access

### `time.updated` is already public upstream

`Session.Info.time.updated` is a required public timestamp alongside
`created`, optional `idle`, `viewed`, and `archived`
([schema lines 31-58](/packages/schema/src/session.ts#L31-L58)). Code generation
publishes it unchanged in `SessionInfo`
([generated type lines 1644-1660](/packages/client/src/promise/generated/types.ts#L1644-L1660)).
The public CLI plugin context imports that generated `SessionInfo` and exposes
it through `data.session.get`
([context lines 1-25](/packages/plugin/src/tui/context.ts#L1-L25),
[lines 61-99](/packages/plugin/src/tui/context.ts#L61-L99)).

No schema, protocol, client generation, or server API patch is needed for a
plugin to read this field. The downstream Active change only starts consuming
the existing field.

`time.updated` should not be described as the last execution completion time.
Inbox admission advances `time_updated`
([projector lines 623-638](/packages/core/src/session/projector.ts#L623-L638)),
while a terminal execution advances `time_idle` and deliberately preserves
`time_updated`
([projector lines 402-429](/packages/core/src/session/projector.ts#L402-L429)).
The read model maps both columns into public Session time
([Session info lines 54-61](/packages/core/src/session/info.ts#L54-L61)).

For a label named `Active`, a more faithful cached value is normally based on
the running status plus `max(time.updated, time.idle)`. If the plugin displays
only `time.updated`, `Updated` is the exact label.

### Cached access is synchronous; synchronization is not

The Solid client owns one `createStore` for Session and related state and a memo
for its sorted Session list
([data lines 190-216](/packages/client/src/solid/data.ts#L190-L216)). The public
lookup is only:

```ts
get(sessionID: string) {
  return store.session.info[sessionID]
}
```

([data lines 1244-1261](/packages/client/src/solid/data.ts#L1244-L1261)). It
does not issue a request. By contrast, `session.sync(sessionID)` calls the
server and writes the response into the store
([data lines 1471-1497](/packages/client/src/solid/data.ts#L1471-L1497)). The
official/local guide presents `get` and `sync` as distinct operations
([guide lines 74-87](/packages/www/src/docs/content/build/plugins/cli.mdx#L74-L87)).

Consequences for an epilogue plugin:

- `get` is cheap and shutdown-safe as a read operation, but may return
  `undefined` before hydration.
- A value returned from the store is a Solid store proxy. Property reads are
  reactive only when performed inside a Solid computation.
- Calling `get` once in plugin `setup` does not establish a subscription.
- `sync` is appropriate during ordinary live operation, never as an epilogue
  shutdown fallback.

The cache is intentionally eventually synchronized in some paths. For example,
`session.inbox.enqueued` materializes local pending input but does not patch the
cached Session timestamp
([data lines 700-714](/packages/client/src/solid/data.ts#L700-L714)). Terminal
execution events mark status idle, then invalidate and asynchronously sync the
Session
([data lines 997-1028](/packages/client/src/solid/data.ts#L997-L1028)). A
retained plugin snapshot is lookup-free, but it is only as current as the
cache/events it observed.

## Discovering the active Session

The current displayed route is the primary source of truth:

```ts
const route = context.ui.router.current()
const sessionID = route.type === "session" ? route.sessionID : undefined
```

The public route union and router methods are explicit
([context lines 140-155](/packages/plugin/src/tui/context.ts#L140-L155),
[lines 436-467](/packages/plugin/src/tui/context.ts#L436-L467)). The adapter
returns the live Solid route store directly
([plugin API lines 157-176](/packages/tui/src/plugin/api.tsx#L157-L176)); the
route provider updates that store with `reconcile`
([route lines 29-44](/packages/tui/src/context/route.tsx#L29-L44)). Reading
`current().type` and `current().sessionID` inside `createEffect`, `createMemo`,
or dynamic JSX therefore tracks navigation. Reading it once in `setup` does
not.

Other discovery mechanisms are narrower:

| Source | What it identifies | Limitation |
| --- | --- | --- |
| `ui.router.current()` | The route currently displayed by this TUI | Home and plugin routes intentionally have no active Session |
| `ui.tabs.list()` | Open root-Session tabs plus an `active` flag | Intended only when tabs are enabled; it is not authoritative on home/plugin routes |
| Session-scoped slot input | The Session instance owning that mounted slot | Only `session.composer.top` and sidebar slots require a Session ID |
| Prompt slot input | Optional Session ID and prompt mode | The home prompt has no Session ID |
| `data.session.list()` | Every Session currently cached | Recency order is not UI selection |
| Session events | The Session affected by one server fact | Events do not state which Session this TUI is displaying |

Tab reads are documented as reactive in a Solid computation
([context lines 447-465](/packages/plugin/src/tui/context.ts#L447-L465)). The
adapter derives `active` from the current routed root Session and enriches each
tab with status
([plugin API lines 177-207](/packages/tui/src/plugin/api.tsx#L177-L207)). This
is useful for multi-Session monitoring, but the router remains the simpler and
more general active-Session source.

The slot map publishes exact host-local identity where needed
([context lines 157-180](/packages/plugin/src/tui/context.ts#L157-L180)). The
host mounts those inputs at the Session composer
([Session route lines 1437-1445](/packages/tui/src/routes/session/index.tsx#L1437-L1445)),
sidebar
([sidebar lines 50-76](/packages/tui/src/routes/session/sidebar.tsx#L50-L76)),
and prompt footer
([prompt lines 1951-2034](/packages/tui/src/component/prompt/index.tsx#L1951-L2034)).

## Events, routes, tabs, renderer, storage, and cleanup

### Events

`data.on(type, handler)` and `data.listen(handler)` are typed public APIs and
return unsubscribe functions
([context lines 61-67](/packages/plugin/src/tui/context.ts#L61-L67),
[guide lines 58-72](/packages/www/src/docs/content/build/plugins/cli.mdx#L58-L72)).
They are live event subscriptions, not history or replay. A tracker should read
initial state from the cache, then use events as incremental hints.

Current public events include `session.execution.started`, `succeeded`,
`failed`, and `interrupted`
([Session event lines 219-239](/packages/schema/src/session-event.ts#L219-L239)),
plus `session.inbox.enqueued`
([lines 183-203](/packages/schema/src/session-event.ts#L183-L203)). There is no
current generic `session.updated` event carrying a fresh `SessionInfo`. A plugin
can use event timestamps/status to reduce cache lag, but reproducing every
projector update would couple it to domain details. Cache synchronization should
remain the normal source for the complete Session record.

Event subscriptions are not automatically owned by `data.on`; the documented
pattern returns or calls the unsubscribe function during plugin cleanup.

### `storage.memory`

`storage.memory` returns a Solid store and synchronous producer update. Its
contract explicitly says that old and new hot-reload generations share the
same live store, non-JSON values are allowed, and all memory disappears when
the TUI exits
([context lines 31-53](/packages/plugin/src/tui/context.ts#L31-L53)). The adapter
prefixes keys with the plugin ID
([plugin API lines 147-150](/packages/tui/src/plugin/api.tsx#L147-L150)). The
host memoizes those entries above plugin lifecycles and never deletes them
during a reload
([storage lines 47-55](/packages/tui/src/context/storage.tsx#L47-L55),
[lines 94-100](/packages/tui/src/context/storage.tsx#L94-L100)).

This is almost exactly the retention behavior an experimental epilogue cell
needs. It is not itself an epilogue registry:

- the host cannot enumerate semantically named plugin memory rows;
- no active/inactive plugin ordering is attached to a memory entry;
- values are not normalized or copied away from plugin-owned objects;
- the store is disposed with the TUI and is not available to the post-scope
  writer through a supported API.

It is excellent prototype storage and a useful implementation precedent, not a
magic key convention the final host should inspect.

### Routes and tabs

A plugin can register an error-contained JSX route, inspect/navigate the current
route, and unregister it
([guide lines 358-372](/packages/www/src/docs/content/build/plugins/cli.mdx#L358-L372)).
Plugin route navigation and hot reload key the render boundary so a previous
render crash does not latch future generations
([render lines 48-69](/packages/tui/src/plugin/render.tsx#L48-L69)). A route is
useful for an epilogue snapshot inspector or configuration UI, but it does not
participate in shutdown output.

Tabs can be listed, opened, focused, and closed when enabled
([guide lines 374-383](/packages/www/src/docs/content/build/plugins/cli.mdx#L374-L383)).
They add multi-Session visibility, not a new lifecycle seam.

### Renderer

The context exposes the full OpenTUI `CliRenderer`, not a narrowed wrapper
([context lines 470-485](/packages/plugin/src/tui/context.ts#L470-L485)). The
guide only promises it for OpenTUI elements and renderer-specific helpers
([guide lines 212-219](/packages/www/src/docs/content/build/plugins/cli.mdx#L212-L219)).

The installed OpenTUI 0.5.9 type includes `isDestroyed`, `requestRender()`,
`destroy()`, and a `DESTROY = "destroy"` EventEmitter event
([renderer type lines 187-213](/packages/tui/node_modules/@opentui/core/renderer.d.ts#L187-L213),
[lines 382-405](/packages/tui/node_modules/@opentui/core/renderer.d.ts#L382-L405),
[lines 555-575](/packages/tui/node_modules/@opentui/core/renderer.d.ts#L555-L575)).
Those methods make renderer lifecycle experiments possible, but OpenCode does
not document `destroy` listener ordering as a CLI plugin contract.

Critically, OpenTUI emits `destroy` before it destroys the render tree and
native renderer. In the installed implementation, the event is emitted, then
the root, parser, console, output plumbing, and native renderer are torn down
([installed renderer lines 9734-9824](/packages/tui/node_modules/@opentui/core/chunk-node-dcyj0dm5.js#L9734-L9824)).
OpenTUI Solid installs a listener on that event which disposes the Solid root
([installed Solid lines 1490-1535](/packages/tui/node_modules/@opentui/solid/index.js#L1490-L1535)).

Therefore `renderer.once("destroy", ...)` is a valid place to copy plain
in-memory data, but it is not a post-teardown output hook. Writing stdout from
that callback can race terminal restoration and Solid/plugin cleanup.

### Cleanup

A CLI plugin `setup` may return a synchronous or asynchronous cleanup
([plugin definition lines 5-10](/packages/plugin/src/tui/plugin.ts#L5-L10)).
Route, slot, and Markdown registrations are also added to an internal owned
cleanup list automatically
([plugin API lines 98-109](/packages/tui/src/plugin/api.tsx#L98-L109)). The
plugin's returned cleanup is appended after setup, and disposal runs all owned
cleanups in reverse order
([plugin context lines 169-183](/packages/tui/src/plugin/context.tsx#L169-L183),
[lines 552-565](/packages/tui/src/plugin/context.tsx#L552-L565)). Thus the
plugin's own returned cleanup normally runs before automatic unregisters.

Cleanup is an unload hook, not an exit hook. The same serialized lifecycle is
used for hot reload, manual deactivation, structural plugin-order changes, and
TUI shutdown
([plugin context lines 193-224](/packages/tui/src/plugin/context.tsx#L193-L224),
[lines 342-399](/packages/tui/src/plugin/context.tsx#L342-L399)). Printing an
epilogue from cleanup would also print on reload/disable unless it used
renderer-state heuristics.

The provider has a TUI lifecycle disposer that waits for active deactivations,
but its Solid `onCleanup` unregisters that finalizer and starts the same dispose
operation with `void`
([plugin context lines 503-525](/packages/tui/src/plugin/context.tsx#L503-L525)).
No public promise exposes an "all CLI plugin cleanup has completed" barrier.
Strict ordering of asynchronous plugin cleanup versus final epilogue output
should be established by a gated integration test before a new interface
claims that guarantee. The existing signal test verifies epilogue content and
zero prompt requests, but does not gate an asynchronous plugin cleanup
([test lines 264-349](/packages/tui/test/app-lifecycle.test.tsx#L264-L349)).

## Exact Solid slot behavior

The visual slot system is suitable for hosting a live tracker, but its current
`render` contract is not a tracked structured-data projection.

### Registration and ordering

1. `context.ui.slot` validates exactly one placement, assigns a per-plugin
   registration-order key, stores the claim, and returns an idempotent
   unregister function
   ([plugin API lines 208-222](/packages/tui/src/plugin/api.tsx#L208-L222)).
2. Active claims are flattened in plugin enable order, then in registration
   order within each plugin. Stable render functions reuse stable claim objects
   across unrelated plugin reloads
   ([plugin context lines 430-464](/packages/tui/src/plugin/context.tsx#L430-L464)).
3. Mounted slot paths are reference-counted. Resolution reruns when the mounted
   path set or active claims change, but adding a second instance of an already
   mounted path does not change the key set and does not rerun resolution
   ([plugin context lines 431-467](/packages/tui/src/plugin/context.tsx#L431-L467)).
4. `resolveSlots` is a pure ordered transform. Additive claims coexist in enable
   order; replacement conflict and missing-target behavior are handled before
   rendering
   ([slot resolver lines 57-146](/packages/tui/src/plugin/structure.ts#L57-L146)).

### Setup and recomputation

For each resolved claim, `<Slot>` calls `createComponent(claim.render,
mergeProps(input))` inside an error boundary
([slot render lines 85-121](/packages/tui/src/plugin/render.tsx#L85-L121)). The
important Solid semantics are:

- The claim's component function is setup. It runs once for that mounted claim
  and runs untracked. Solid's `createComponent` explicitly invokes a component
  through `untrack`
  ([Solid lines 1280-1291](/packages/tui/node_modules/solid-js/dist/solid.js#L1280-L1291)).
- The input props object remains reactive. `mergeProps` wraps its accessor in a
  memo and resolves fields through a proxy
  ([Solid lines 1321-1356](/packages/tui/node_modules/solid-js/dist/solid.js#L1321-L1356)).
- Reactive computations created during setup, including dynamic JSX children,
  `createMemo`, and `createEffect`, rerun only when the signals/store fields
  they read change.
- An eagerly computed local string in the setup body is static. The component
  function itself is not rerun merely because a Session field changed.
- Destructuring reactive props into scalar locals during setup does not itself
  preserve prop reactivity. The official example is still reactive for
  `session.title` because that store field is read in dynamic JSX; its captured
  `sessionID` is normally stable for that slot mount.
- Ordinary terminal frames and the configured 60 FPS target do not rerun
  component setup or Solid computations. A reactive update may request a new
  render; a render frame is not a reactive source.

A contribution is recreated when its slot instance remounts, the claim is
added/replaced/removed, or its plugin generation is replaced. Bucketwise shallow
equality prevents a claim change elsewhere in the tree from remounting this
slot
([slot render lines 98-113](/packages/tui/src/plugin/render.tsx#L98-L113)).

This has one direct implication for a proposed headless slot: changing
`render` to return `{ label, value }` would evaluate that return once and
untracked under the current adapter. A headless path needs an explicit
`createMemo`, `createEffect`, or equivalent tracked adapter which copies each
new result into host storage. It cannot rely on current visual component setup
to track a plain returned object.

## Capability matrix

| Capability | Easy through supported API today | Reactive/retained behavior | Can feed post-teardown epilogue today | Assessment |
| --- | --- | --- | --- | --- |
| Read `SessionInfo.time.updated` | Yes | Reactive when read in Solid computation | No host consumer | Fully supported, upstream |
| Read cached Session synchronously | Yes, `data.session.get` | Solid store proxy; may be absent/stale | No host consumer | Fully supported |
| Force Session refresh | Yes, `data.session.sync` | Async server request | Must not run at shutdown | Supported live only |
| Discover displayed Session | Yes, `ui.router.current()` | Reactive in Solid computation | No host consumer | Fully supported |
| Inspect active/open tabs | Yes when tabs enabled | `list()` is documented reactive | No host consumer | Fully supported, secondary source |
| Observe Session events | Yes, `data.on`/`listen` | Live-only callbacks; manual unsubscribe | No host consumer | Fully supported |
| Retain latest copied state across hot reload | Yes, `storage.memory` | Shared live store until TUI exit | Not enumerable after scope | Fully supported for prototypes |
| Mount a live tracker without visible content | Yes, an `app` slot component returning `null` | Solid owner and effects; no OpenTUI element | No host consumer | Supported composition of existing APIs |
| Show a preview/configurator | Yes, route or visual slot | Ordinary JSX lifecycle | Not final output | Fully supported |
| Listen for renderer destruction | Technically yes via raw `CliRenderer` | Event fires before full teardown | Can only copy safely | OpenTUI surface, not an OpenCode epilogue contract |
| Run plugin cleanup | Yes | Also runs on reload and deactivation | Not exit-specific; async barrier not public | Fully supported for resource release |
| Add/append a final epilogue row | No | No registry/cell/slot exists | No | Missing public seam |
| Write stdout during cleanup/destroy | Node code can do it | Ordering and duplication hazards | Output may appear | Fragile hack |
| Import internal epilogue context | Package is private; setter is singleton | Overwrites core value | Could suppress Session/Continue | Unsupported hack |
| Monkeypatch `renderer.destroy` | JavaScript permits it | Fails when destroy is deferred during a frame; wrappers conflict | Unordered output | Unsupported hack |

## No-core-patch prototypes possible now

### Supported: live push retention

An external plugin can prove active-Session discovery, reactive cache reads,
hot-reload retention, and zero-renderable tracking with existing APIs:

```tsx
import { Plugin } from "@opencode-ai/plugin/tui"
import { createEffect } from "solid-js"

type Snapshot = {
  sessionID?: string
  updated?: number
}

export default Plugin.define({
  id: "acme.epilogue-prototype",
  setup(context) {
    const [, updateSnapshot] = context.storage.memory<Snapshot>("snapshot", {
      initial: {},
    })

    const Tracker = () => {
      createEffect(() => {
        const route = context.ui.router.current()
        const session = route.type === "session" ? context.data.session.get(route.sessionID) : undefined
        updateSnapshot((draft) => {
          draft.sessionID = session?.id
          draft.updated = session?.time.updated
        })
      })
      return null
    }

    return context.ui.slot({
      append: "app",
      render: () => <Tracker />,
    })
  },
})
```

The root `app` slot is mounted after plugins become ready
([app lines 1289-1319](/packages/tui/src/app.tsx#L1289-L1319)). `Tracker` owns a
real Solid effect but returns no `<box>`, `<text>`, or other OpenTUI renderable.
It preserves the timestamp rather than a preformatted relative-time string, so
the retained value does not become semantically stale.

This prototype can add a plugin route or visible slot which reads the memory
cell for inspection. It can also combine typed execution events with the cache
to track running/idle state. All of that is supported. It still cannot publish
the snapshot in the built-in exit epilogue.

### Possible but fragile: process output experiments

A no-core-patch experiment can produce terminal text by doing one of the
following, but none satisfies a production epilogue contract:

| Experiment | Why it can appear to work | Why it is not shippable |
| --- | --- | --- |
| `renderer.once("destroy", copy)` plus deferred stdout write | The callback observes the destroy edge and a microtask runs after synchronous renderer work | Ordering against host epilogue, scope finalizers, and async plugin cleanup is unspecified |
| Cleanup guarded by `renderer.isDestroyed` | Distinguishes many shutdowns from hot reload | Cleanup begins from the pre-teardown destroy event; not every unload is an exit and async timing is unowned |
| Wrap `renderer.destroy` and write after the original returns | Normal non-rendering destruction is synchronous | Destruction during a frame returns before finalization; multiple wrappers and host calls conflict |
| Import `@opencode-ai/tui/context/epilogue` | The checkout exports that internal subpath | `@opencode-ai/tui` is private ([package lines 3-20](/packages/tui/package.json#L3-L20)); the setter stores one value, so a plugin overwrites core output |
| Register process signal/exit listeners | Node exposes them | Misses non-signal TUI exits, races terminal ownership, bypasses host cleanup, and composes with nothing |

These experiments are useful only to demonstrate why the missing seam matters.
They should not be characterized as supported plugin solutions.

## Why no post-teardown plugin seam exists

The public `UI` ends at dialog, toast, formatting, router, tabs, and visual slot
operations
([context lines 436-468](/packages/plugin/src/tui/context.ts#L436-L468)). The
complete `Context` adds renderer, client, data, attention, theme, Markdown,
keymap, and storage, but no lifecycle contribution API
([lines 470-486](/packages/plugin/src/tui/context.ts#L470-L486)). The hosted and
local guides likewise contain no epilogue or exit registration.

The host's existing path is private and singleton:

1. `EpilogueProvider` exposes one setter accepting one current thunk
   ([epilogue context lines 1-6](/packages/tui/src/context/epilogue.tsx#L1-L6)).
2. The active Session route replaces that thunk whenever its cached title/ID/
   timestamp changes and clears it on unmount
   ([Session route lines 164-205](/packages/tui/src/routes/session/index.tsx#L164-L205)).
3. `Tui.run` stores the escaped thunk outside the scoped renderer tree, waits
   for renderer destruction, closes the Effect scope, then invokes/writes the
   thunk
   ([app lines 226-284](/packages/tui/src/app.tsx#L226-L284),
   [lines 449-457](/packages/tui/src/app.tsx#L449-L457)).

There is no additive row collection, plugin identity, registration ordering,
normalization, error isolation, or retained plugin snapshot in that path.

## Reusing current machinery for push-retained rows

The current code already contains every difficult lifecycle edge except the
public contribution registry.

### Recommended mechanical shape

1. Add an append-only row publisher to the public CLI context. Registration
   should return an idempotent disposer and a synchronous `set(rows)` operation.
2. Store normalized copies of `label` and `value` in host-owned memory at each
   `set`. Never retain a Solid proxy, JSX node, Promise, or plugin callback.
3. Add epilogue registrations to the same per-plugin `Registration` record used
   for routes, slots, and Markdown. The existing owned-cleanup mechanism then
   supplies plugin identity, disablement, hot reload, and registration order
   without a second plugin lifecycle.
4. Flatten active epilogue publishers using the same plugin and within-plugin
   order used by slot claims
   ([plugin context lines 446-464](/packages/tui/src/plugin/context.tsx#L446-L464)).
5. On renderer `destroy`, synchronously freeze the core Session rows plus the
   latest copied plugin rows before Solid's destroy listener disposes the tree.
   The host already installs its destroy listener before calling Solid `render`
   ([app lines 277-291](/packages/tui/src/app.tsx#L277-L291)).
6. Open the existing shutdown latch and let renderer, Solid, plugins, storage,
   and Effect resources tear down normally.
7. After `Effect.scoped` returns, write only the frozen host-formatted string at
   the existing stdout site
   ([app lines 449-457](/packages/tui/src/app.tsx#L449-L457)).

The conceptual flow is:

```text
router + cached Session + events
  -> plugin Solid effect
  -> synchronous row publisher
  -> host-owned copied rows
  -> freeze on destroy before Solid disposal
  -> ordinary teardown
  -> host writes frozen string after scope
```

### What can be reused directly

| Existing machinery | Reuse |
| --- | --- |
| `storage.memory` semantics | Model a process-local cell shared across hot-reload generations |
| Registration `owned` list | Automatic disposal on disable, reload, setup failure, and shutdown |
| Registration-store insertion order | Deterministic plugin and within-plugin row ordering |
| Router and Session cache | Live active-Session derivation with no new request |
| Slot-mounted Solid component | First prototype's reactive owner without a visible renderable |
| Renderer destroy listener | Synchronous pre-Solid freeze point |
| Escaped `exit.epilogue` state | Retain the frozen result beyond render scope |
| Existing post-scope stdout write | Restored-terminal output ownership |

### What must not be reused blindly

- The visual `SlotClaim` output is fixed to `JSX.Element`
  ([context lines 201-239](/packages/plugin/src/tui/context.ts#L201-L239)); the
  internal `SlotRender` also erases every path to one JSX return type
  ([plugin API lines 25-35](/packages/tui/src/plugin/api.tsx#L25-L35)). A
  structured epilogue path needs a separate tracked adapter or a dedicated
  publisher.
- Visual replacement, before/after, missing-target degradation, and renderer
  error boundaries are not useful semantics for mandatory core epilogue rows.
- `storage.memory` should not become an undocumented shared-key protocol.
- Plugin cleanup must not perform the final publish or final write.
- A relative value such as `"now"` must not be retained indefinitely. Retain a
  timestamp/semantic value, run a deliberate live timer, or keep Active as a
  host-formatted core row.

The strongest first prototype is therefore an ordinary null-rendering `app`
slot tracker feeding a private host-owned row collector. It proves the reactive
and retention path without changing `SlotMap`. If that works, the public API can
be a small publisher rather than a path-specific JSX/data conditional type.

## Supported API versus contract strength

The phrase "possible today" needs three levels:

1. **OpenCode-supported:** router, cached data, typed events, tabs, memory,
   Solid components, routes, visual slots, and cleanup. These are in the public
   types and V2 guide.
2. **Dependency-exposed but not an OpenCode lifecycle promise:** raw renderer
   event methods. They are useful for host implementation and experiments, but
   plugin correctness should not depend on listener order around terminal
   teardown.
3. **Incidental implementation access:** private TUI contexts, stdout from
   cleanup, process listeners, and monkeypatching `renderer.destroy`. These are
   fragile hacks even if a local prototype prints the desired text.

Only level 1 should be used by the external Active plugin after a host
epilogue-publisher seam lands.

## Carryability implications

The current fixed Active carry is small and isolated. Relative to upstream
`e70d667a9fe3`, it changes four production files and two tests:

- [`app.tsx`](/packages/tui/src/app.tsx)
- [`context/epilogue.tsx`](/packages/tui/src/context/epilogue.tsx)
- [`routes/session/index.tsx`](/packages/tui/src/routes/session/index.tsx)
- [`util/presentation.ts`](/packages/tui/src/util/presentation.ts)
- [`app-lifecycle.test.tsx`](/packages/tui/test/app-lifecycle.test.tsx)
- [`presentation.test.ts`](/packages/tui/test/util/presentation.test.ts)

It requires no carried Session schema, generated client, Solid cache, or plugin
API change. That is the cheapest downstream answer while Active is the only
supplemental field.

A public push-retained seam necessarily adds surface in:

- `packages/plugin/src/tui/context.ts` for row/publisher types;
- `packages/tui/src/plugin/api.tsx` for plugin-owned registration;
- `packages/tui/src/plugin/context.tsx` or a focused epilogue registry for
  active ordering and cleanup;
- `packages/tui/src/context/epilogue.tsx` and `app.tsx` for freeze/composition;
- TUI plugin tests and the CLI plugin guide.

That is more expensive to carry than one fixed row. It improves carryability
only if upstream accepts it or several downstream plugins need it. The hosted
documentation and plugin discovery layout have already moved beyond this
checkout, demonstrating that plugin loader/API files are active upstream
surfaces.

Among generic designs, push retention avoids broadening the full visual slot
algebra and keeps shutdown free of plugin calls. It is likely a smaller and
more stable upstream proposal than making one `SlotPath` return structured data
while every other path returns JSX. Until such a proposal is accepted, keep the
fixed Active carry and use no-core plugins only for live prototypes/previews.

## Conclusions

1. `SessionInfo.time.updated` is upstream, generated, public, and already
   available to CLI plugins.
2. `context.data.session.get` is a synchronous cached read. It becomes reactive
   only when its fields are read in a Solid computation.
3. `context.ui.router.current()` is the authoritative displayed-Session source;
   tab state and slot input are useful secondary views.
4. `storage.memory` plus a null-rendering `app` slot can implement a complete
   live retained-snapshot prototype with no core patch and no OpenTUI element.
5. Current visual slot setup runs once and untracked. Dynamic JSX/effects rerun
   on dependencies; terminal frames do not. A structured headless output needs
   an explicit tracked adapter.
6. Raw renderer and cleanup APIs permit demonstrations, not a reliable final
   epilogue. The destroy event precedes full renderer/Solid teardown, and
   cleanup is not exit-specific.
7. No supported API lets a plugin append to the post-scope epilogue today.
8. Existing registration order, owned cleanup, memory semantics, destroy edge,
   escaped exit state, and post-scope writer can support a small push-retained
   seam without keeping plugins alive after teardown.
9. A strict "after asynchronous plugin cleanup" guarantee needs a focused
   gated lifecycle test; it should not be assumed from the current public API.
10. Downstream carryability still favors the fixed Active row unless the generic
    seam is upstreamed.

## Cross-references

- [Pluggable TUI epilogues: possibility space](/.design/term-v2/epilogue-plugins0.gpt56s.md): shared problem statement, invariants, and broad option comparison for which this is the independent current-surface audit.
- [Term-v2 refresh record](/.design/term-v2/refresh-20260829.model-unspecified.md): identifies the upstream base and carried graceful-signal change.
- [Official V2 CLI plugin guide](https://opencode.ai/v2/docs/build/plugins/cli): current supported plugin capabilities and packaging guidance.
- [Official V2 CLI plugin loading guide](https://opencode.ai/v2/docs/cli/plugins): current package and local-discovery layouts.
- [Public CLI plugin context](/packages/plugin/src/tui/context.ts): canonical API surface audited here.
- [CLI plugin adapter](/packages/tui/src/plugin/api.tsx): maps public operations onto host route, storage, tab, and registration machinery.
- [Plugin generation lifecycle](/packages/tui/src/plugin/context.tsx): ordering, hot reload, deactivation, last-good restoration, and cleanup ownership.
- [Solid data cache](/packages/client/src/solid/data.ts): synchronous Session reads, reactive storage, event projection, and explicit synchronization.
- [Slot renderer](/packages/tui/src/plugin/render.tsx): exact visual claim mount and error-boundary behavior.
- [Current post-scope epilogue path](/packages/tui/src/app.tsx#L226-L457): private retained value, renderer destroy edge, scope closure, and final stdout write.
- [Historical catalog/plugin lifecycle decision](/specs/v2/catalog-config-plugin-lifecycle.md#L191-L209): prior art for ordered, replayable plugin contributions and rematerialized visible state; it is historical rather than current API reference.
