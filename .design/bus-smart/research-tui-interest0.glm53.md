---
type: Research
title: TUI interest policy for the controlled SSE
description: Map every TUI interaction, route, tab, and move lifecycle event to the Location/Session interest changes it requires, with ordering relative to API calls and a concrete removal predicate.
resource: /design/bus-smart/research-tui-interest0
tags: [tui, events, sse, interest, tabs, location, sequencing, move]
status: draft
generated: { by: "agent:glm-5.3#max", at: 2026-08-31 }
verified: { by: unassigned, at: never }
stale_after: 2026-11-30
sources:
  - id: controlled-draft
    resource: /design/bus-smart/controlled-draft0.gpt56s.md
    title: Controlled SSE event feed (client ownership section)
  - id: session-tabs
    resource: /packages/tui/src/context/session-tabs.tsx
    title: TUI multi-session tabs, prefetch, and route admission
  - id: tui-app
    resource: /packages/tui/src/app.tsx
    title: TUI entry, launch Location resolution, provider tree
  - id: location-context
    resource: /packages/tui/src/context/location.tsx
    title: TUI Location context
  - id: client-context
    resource: /packages/tui/src/context/client.tsx
    title: TUI client context and connection ownership
  - id: solid-connection
    resource: /packages/client/src/solid/connection.ts
    title: createClientConnection reconnect loop
  - id: solid-data
    resource: /packages/client/src/solid/data.ts
    title: Solid projection, optimistic outbox, event handlers
  - id: session-route
    resource: /packages/tui/src/routes/session/index.tsx
    title: Session route location following and hydration
  - id: home-route
    resource: /packages/tui/src/routes/home.tsx
    title: Home route location seeding
  - id: dialog-open
    resource: /packages/tui/src/component/dialog-open.tsx
    title: Cross-project session/project open dialog
  - id: prompt
    resource: /packages/tui/src/component/prompt/index.tsx
    title: Prompt submit, optimistic create, /cd command
  - id: prompt-move
    resource: /packages/tui/src/component/prompt/move.tsx
    title: Move menu and worktree creation
  - id: app-workspace-menu
    resource: /packages/app/src/session/timeline/session-workspace-menu.tsx
    title: App-initiated session move (foreign initiator)
  - id: tui-config
    resource: /packages/tui/src/config/index.tsx
    title: TUI config including tabs.scope
  - id: tui-storage
    resource: /packages/tui/src/context/storage.tsx
    title: Synchronous persisted tab storage
  - id: notifications-plugin
    resource: /packages/tui/src/feature-plugins/system/notifications.ts
    title: Global attention notifications driven by feed events
  - id: session-terminals
    resource: /packages/tui/src/context/session-terminals.tsx
    title: Session persistent-PTY tracking
  - id: core-session
    resource: /packages/core/src/session.ts
    title: Session.move admission and directory resolution
  - id: core-bus
    resource: /packages/core/src/bus.ts
    title: Publication-time Session routing snapshots
  - id: schema-session-event
    resource: /packages/schema/src/session-event.ts
    title: SessionEvent manifest (permission/form are not Session events)
---

# TUI interest policy for the controlled SSE

## Situation

The controlled-SSE draft
([`controlled-draft0`](/.design/bus-smart/controlled-draft0.gpt56s.md)) assigns
`SessionTabsProvider` ownership of the TUI's *desired* interest set and lists
five patch rules in prose. This document makes those rules precise and
verifiable against the current V2 TUI: for every interaction, route, tab, and
move lifecycle event, what must be added or removed, in what order relative to
API calls, and what must not touch interest at all. The server-side mechanisms
(revisioned commands, derived move coverage, admission ordering) are assumed as
specified in the draft; this is the client-side policy counterpart.

Non-TUI clients are out of scope and nothing here proposes changing any surface
they use. The web client is future and ignored.

## Reachability facts

These facts answer "can the code that runs at each trigger actually reach the
interest-control surface?" All line numbers verified in this worktree.

1. **The connection is created in `ClientProvider`, outermost of the data
   providers.** The tree is `ClientProvider` → `PermissionProvider` →
   `DataProvider` → `LocationProvider` → `SessionTabsProvider`
   ([`app.tsx`](/packages/tui/src/app.tsx#L376-L424)).
   `createClientConnection` is called inside `ClientProvider` init and its
   `connection` object is returned on the client context value
   ([`client.tsx`](/packages/tui/src/context/client.tsx#L25-L39),
   [L57](/packages/tui/src/context/client.tsx#L57)). An *inner* provider
   reaches the control surface by reading that context: Solid contexts flow
   inward, so `SessionTabsProvider` — which already consumes `useClient()`
   ([`session-tabs.tsx`](/packages/tui/src/context/session-tabs.tsx#L57)) — can
   call `client.interest.patch(...)` with **no provider-tree rearrangement**.
   The draft's `EventInterestControl` belongs on the same context value.

2. **Move/creation call sites run under `SessionTabsProvider`.** The `Prompt`
   component is rendered inside `App`, which is inside `SessionTabsProvider`
   ([`app.tsx`](/packages/tui/src/app.tsx#L380-L408)), and it already consumes
   `useSessionTabs` directly (promote at
   [`prompt/index.tsx`](/packages/tui/src/component/prompt/index.tsx#L1389)).
   `usePromptMove` (move menu, worktree creation) is instantiated only from
   prompt components
   ([`prompt/index.tsx`](/packages/tui/src/component/prompt/index.tsx#L263-L267))
   and `/cd` is a keymap command in the same file
   ([L269-L317](/packages/tui/src/component/prompt/index.tsx#L269-L317)). So
   every initiating-move path can call either the raw `client.interest` surface
   or a `prepare` hook exposed by `SessionTabsProvider`. Routing through the
   provider is preferred so desired-set state stays single-owner.

3. **The launch Location resolves before any provider mounts.** `Tui.run`
   resolves it via `api.file.list({ location: { directory: process.cwd() } })`
   with an `api.location.get()` fallback, before `render()`
   ([`app.tsx`](/packages/tui/src/app.tsx#L208-L212)). The full resolved Ref
   (including `workspaceID`) is in scope there. Today only `location.directory`
   is forwarded, as `DataProvider`'s `directory` prop
   ([L378](/packages/tui/src/app.tsx#L378)), where it seeds the data layer's
   `defaultLocation` signal
   ([`data.ts`](/packages/client/src/solid/data.ts#L213)). The controlled GET's
   initial interest needs a small additive prop on `ClientProvider` carrying the
   full Ref — available at that point, no reordering.

4. **Persisted tab state is available synchronously at provider init.** The
   storage layer loads with `readFileSync` inside `storage.store(...)`
   ([`storage.tsx`](/packages/tui/src/context/storage.tsx#L61-L68)), and
   `SessionTabsProvider` creates its store during init
   ([`session-tabs.tsx`](/packages/tui/src/context/session-tabs.tsx#L70-L76)).
   So the active scope's tab Session IDs are known *before the SSE GET opens*:
   provider init runs outer→inner during the synchronous render pass, while
   `createClientConnection` opens the stream from `onMount`
   ([`connection.ts`](/packages/client/src/solid/connection.ts#L169-L183)),
   which fires only after the whole tree has rendered.

5. **The location context is a single slot that both routes drive.** The
   session route follows the session's Location
   ([`routes/session/index.tsx`](/packages/tui/src/routes/session/index.tsx#L195-L198));
   Home seeds it from `route.location ?? data.location.default()`
   ([`home.tsx`](/packages/tui/src/routes/home.tsx#L31-L42)); `/cd` and the
   open dialog set it directly
   ([`prompt/index.tsx`](/packages/tui/src/component/prompt/index.tsx#L302),
   [`dialog-open.tsx`](/packages/tui/src/component/dialog-open.tsx#L131)). The
   interest *set* is the union of this slot plus every tab's resolved Location —
   never just the slot.

## Interest vocabulary

Two requested dimensions, per the draft:

- **Location add** — patch-add a `Location.Ref` (keyed by
  `locationKey(ref)`, the existing client-side canonicalization
  ([`data.ts`](/packages/client/src/solid/data.ts#L123), re-exported at
  [`context/data.tsx`](/packages/tui/src/context/data.tsx#L7)).
- **Session add** — patch-add a `SessionID` (exact-Session admission; needs no
  Location metadata).
- **Either remove** — patch-remove, always debounced (see
  [Removal hysteresis](#removal-hysteresis)).

Adds are correctness-bearing and cheap; removes are pure optimization. Bounded
overdelivery after a remove is safe
([`research-controlled-sse0`](/.design/bus-smart/research-controlled-sse0.gpt56s.md)).

## Startup sequencing (validated)

The draft's claim: begin with the launch Location; patch-add persisted tab
Session IDs before resolving their Locations; then resolve → patch-add
Locations → hydrate
([`controlled-draft0` client ownership](/.design/bus-smart/controlled-draft0.gpt56s.md)).
Checked against mount order and effect timing, it is **reachable**, with two
clarifications and one strengthening.

Corrected/confirmed sequence:

1. **Initial GET interest = launch Ref.** Passed to `ClientProvider` from
   `Tui.run` (fact 3). No all-events bootstrap needed.
2. **Persisted tab Session adds happen at `SessionTabsProvider` init, not "as
   soon as mounted ... then patch".** Because storage loads synchronously
   (fact 4), the provider can compute its desired session set during init —
   before any effect runs and before the SSE GET opens. Two implementations:
   - *Simple:* issue the patch in init/first effect; the connection layer
     queues commands until the ready frame. There is then a small
     `[ready, patch-applied]` window in which restored tabs' live events are
     dropped — acceptable, because restored tabs are hydrated by HTTP
     (`data.session.sync`, below) and the window closes in one round trip.
   - *Stronger (recommended):* the connection accepts a
     `desiredInterest: () => InterestInput` accessor. `ClientProvider` creates
     the cell; `SessionTabsProvider` populates it during init (same render
     pass); the GET reads it when `connect()` issues the request. By fact 4's
     ordering this is race-free and puts the persisted Session IDs *inside* the
     initial interest, eliminating the window entirely.
3. **Resolve → Location add → hydrate maps onto the existing prefetch effect.**
   [`session-tabs.tsx`](/packages/tui/src/context/session-tabs.tsx#L285-L325)
   already does: sync all tab session info (L293), collect distinct resolved
   Locations (L295-L299), `syncInfo`+`vcs.sync` each (L301-L305), then after a
   300 ms timer fetch messages/pending/permissions/forms for non-visible tabs
   (L307-L320). The policy inserts the Location patch-add at the moment each
   session's `data.session.get(id)?.location` resolves — **before** the 300 ms
   hydration timer, and not gated on it. The existing `connected` gate at L287
   is about hydration, not interest; Session-ID adds must not wait for it.
4. **Startup routes resolve through the same admission path.** `--continue`
   starts on a `dummy` session route
   ([`app.tsx`](/packages/tui/src/app.tsx#L367-L374)) and navigates to the real
   newest session after an HTTP `session.list`
   ([L631-L657](/packages/tui/src/app.tsx#L631-L657)); `--session --fork`
   forks then navigates
   ([L659-L668](/packages/tui/src/app.tsx#L659-L668)). In every case the route
   admission effect (below) adds the Session ID synchronously at navigation,
   before the session route's hydration syncs
   ([`routes/session/index.tsx`](/packages/tui/src/routes/session/index.tsx#L332-L363)).

`tabs.scope: "cwd" | "global"` (default `cwd`,
[`config/index.tsx`](/packages/tui/src/config/index.tsx#L289-L295)) only selects
*which* persisted set is active
([`session-tabs.tsx`](/packages/tui/src/context/session-tabs.tsx#L105-L108));
both scopes produce interest through the same rules. Global scope therefore
means: the interest set spans the Locations of *all open tabs*, whatever
projects they live in — still bounded by open tabs, never "all projects". A
runtime scope switch swaps the tab set; adds are immediate, removals debounce.

## The policy map

Every trigger, its interest change, and its ordering relative to API calls.

| # | Trigger (code site) | Interest change | Order relative to API calls |
| --- | --- | --- | --- |
| S1 | TUI launch ([`app.tsx`](/packages/tui/src/app.tsx#L208-L212)) | GET initial interest = launch Ref | carried by the GET; no patch |
| S2 | Persisted tab restore ([`session-tabs.tsx`](/packages/tui/src/context/session-tabs.tsx#L70-L76)) | patch-add sessions: all active-scope tab IDs | at provider init, before `data.session.sync` (L293); ideally inside the initial GET (accessor, above) |
| S3 | Tab info resolution during prefetch ([L292-L306](/packages/tui/src/context/session-tabs.tsx#L292-L306)) | patch-add locations: each distinct `session.location` | immediately at resolution; before the 300 ms hydration timer |
| S4 | Route → session: tab select/cycle/index, dialog-open select, `--continue`, fork, prompt-submit navigation ([admission effect L191-L227](/packages/tui/src/context/session-tabs.tsx#L191-L227)) | patch-add session **root ID** | synchronous with admission, before session-route hydration syncs |
| S5 | Session route Location resolution ([`session/index.tsx`](/packages/tui/src/routes/session/index.tsx#L195-L198)) | patch-add `session.location` (the visible tab's S3) | same moment the route sets the Location context; before relying on location-owned events there |
| S6 | Home route ([`home.tsx`](/packages/tui/src/routes/home.tsx#L31-L42)) | hold `route.location ?? default()` | when the home target differs from held Locations, add before `location.set` reliance |
| S7 | `/cd` without a session ([`prompt/index.tsx`](/packages/tui/src/component/prompt/index.tsx#L291-L304)) | patch-add validated destination | **after** `location.get` validates (L293), **before** `currentLocation.set` (L302) |
| S8 | `/cd` with a session — initiating move ([L306-L315](/packages/tui/src/component/prompt/index.tsx#L306-L315)) | patch-add resolved destination (provisional); hold source until `session.moved` | destination add **awaited** before the `session.move` POST; source removal only via predicate |
| S9 | Move menu, existing directory ([`move.tsx`](/packages/tui/src/component/prompt/move.tsx#L105-L124)) | patch-add exact destination | add **awaited** before `client.api.session.move` (L115) |
| S10 | Move menu, new worktree ([L29-L64](/packages/tui/src/component/prompt/move.tsx#L29-L64)) | patch-add the new worktree directory | after `worktree.create` (L40) and the `syncInfo` seed (L53), **awaited** before the move POST in `moveExistingSession` |
| S11 | Optimistic session create ([`prompt/index.tsx`](/packages/tui/src/component/prompt/index.tsx#L1219-L1273)) | patch-add {client-minted session ID, known Location} — both known before the POST | **awaited** before `data.session.create` (L1235); the submit path is already async and idempotent |
| S12 | Tab close (`close` → `remove`, [`session-tabs.tsx`](/packages/tui/src/context/session-tabs.tsx#L429-L443), [L349-L372](/packages/tui/src/context/session-tabs.tsx#L349-L372)) | debounced patch-remove session; Locations per predicate | after `remove()` commits; never blocks navigation |
| S13 | `session.deleted` observed ([L341-L347](/packages/tui/src/context/session-tabs.tsx#L341-L347)) | patch-remove session (immediate is safe; idempotent with S12) | event-driven; tab removal already happens here |
| S14 | `session.moved` observed, any initiator ([L327-L332](/packages/tui/src/context/session-tabs.tsx#L327-L332)) | patch-add destination to **requested** (promote derived → requested); source removal via predicate only | on event arrival, before relying on destination location-owned events |
| S15 | Reopen closed tab ([L444-L456](/packages/tui/src/context/session-tabs.tsx#L444-L456)) | re-add session; Location on resolve | at the tab-state write + navigation |
| S16 | Move POST failure / create rollback ([`move.tsx`](/packages/tui/src/component/prompt/move.tsx#L117-L123); rollback at [`data.ts`](/packages/client/src/solid/data.ts#L1373-L1377)) | drop the pending-move hold (and optimistic session hold) | in the catch path, before toast/restore |
| S17 | Reconnect (any cause) | `replace` with the full desired set | connection layer, per the draft's reconnect contract |
| S18 | `tabs.scope` change at runtime | recompute from the new tab set | config effect; adds immediate, removes debounced |

Notes on the awaited-adds rule (S8–S11): "awaited" means awaiting the PATCH
HTTP response, not the SSE control frame — the server installs interest state
inside its critical section before returning
([`controlled-draft0` atomic admission](/.design/bus-smart/controlled-draft0.gpt56s.md)),
which is what mutation ordering needs; the SSE frame gates only client-local
revision tracking.

`/cd` destination caveat: the TUI resolves the directory client-side
(`~`/`~/` expansion, then `path.resolve` against the session's location,
[L284-L290](/packages/tui/src/component/prompt/index.tsx#L284-L290)) and the
server applies the same expansion relative to its fresh read of the session
([`session.ts`](/packages/core/src/session.ts#L463-L466)). The provisional add
is therefore exact in practice, but correctness never depends on it: exact
Session interest plus server-derived move coverage carry the session across
the move even if the provisional Location never matches.

## Move paths in detail

**Initiating TUI** (S8/S9/S10): destination patch-add, awaited, before the
`session.move` admission POST. Feasibility is fact 2. The server does not
commit placement synchronously — it admits a durable move inbox item and wakes
execution ([`session.ts`](/packages/core/src/session.ts#L461-L515)) — so the
source must stay interesting until `session.moved` arrives; the predicate holds
the source as `pendingMoves` entry until the event or POST failure releases it.

A `prepare`-style hook owned by `SessionTabsProvider` needs a release handle,
roughly:

```ts
// exposed by SessionTabsProvider; used by usePromptMove and /cd
admitMove(sessionID: SessionID, destination: LocationRef): Promise<void>  // awaits patch ack, records pendingMove
releaseMove(sessionID: SessionID): void                                  // POST failure path
// session.moved for a pending session clears the entry and promotes destination to requested
```

**Foreign initiator** (app workspace menu
[`session-workspace-menu.tsx`](/packages/app/src/session/timeline/session-workspace-menu.tsx#L52-L79),
plugin adapter, another TUI): the TUI does nothing proactively. Server-derived
coverage keeps the followed session's events flowing and hands the TUI
`session.moved` + `event-feed.effective.changed`; the TUI reacts per S14. This
is the case that justifies exact-Session interest existing at all.

**Immediate move path** (source directory vanished): `Session.move` cancels
pending moves and publishes `session.moved` synchronously inside the request
([`session.ts`](/packages/core/src/session.ts#L495-L504)); the client-side
policy is identical (S14) because it only reacts to the event.

## Optimistic creation and the outbox

`data.session.create` mints the ID client-side, admits a local record, and
remembers the Location chosen by the caller
([`data.ts`](/packages/client/src/solid/data.ts#L1333-L1381); the TUI passes
`directory ? { directory } : currentLocation.ref ?? default`
([`prompt/index.tsx`](/packages/tui/src/component/prompt/index.tsx#L1229-L1243)).
Both facts are therefore known **before** the POST fires, so S11 can add
session + Location with nothing to wait for except the patch ack itself.
`session.created` is Bus-routed to the new session's Location
([`bus.ts`](/packages/core/src/bus.ts#L218-L221)), so the Location add alone
already guarantees the echo; the Session add is belt-and-braces for the
execution stream. Rollback (`removeSession` on unacknowledged create failure,
[L1373-L1377](/packages/client/src/solid/data.ts#L1373-L1377)) drops the hold
(S16); the prompt's recover path closes the tab or navigates home
([`prompt/index.tsx`](/packages/tui/src/component/prompt/index.tsx#L1252-L1271)),
flowing into S12.

One exposure gap: `sessionOutbox` is private to the data layer
([`data.ts`](/packages/client/src/solid/data.ts#L299)). The predicate needs the
optimistic IDs, so the data layer needs an additive read accessor (e.g.
`data.session.outbox(): ReadonlySet<SessionID>`). Purely additive; no non-TUI
client depends on it.

## Edge cases

**Unknown persisted tabs.** The prefetch syncs tolerate failures
(`Promise.allSettled`,
[`session-tabs.tsx`](/packages/tui/src/context/session-tabs.tsx#L293)); a
deleted session's background tab lingers today with a fallback title. Policy:
on a confirmed not-found during prefetch, **unfollow** (remove the session from
desired interest) — the tab itself may keep lingering per current product
behavior, but interest must not retain dead IDs indefinitely. Route-visible
not-found already closes the tab or navigates home
([`routes/session/index.tsx`](/packages/tui/src/routes/session/index.tsx#L343-L361)),
flowing into S12.

**Followed session whose tab closed.** The server keeps derived coverage until
unfollowed (draft: derived entries are removed when the session is unfollowed).
Who unfollows: the `SessionTabsProvider` desired-set effect, via S12's
debounced remove. If this client had admitted a move that has not yet
published, the `pendingMoves` entry keeps the follow (and destination hold)
until `session.moved` or POST failure — the user closing a tab mid-move must
not strand the session in coverage limbo or drop it prematurely.

**Permission/form coverage.** `permission.asked`/`replied` and
`form.created`/`replied`/`cancelled` are **not** SessionEvents
([`session-event.ts` Definitions](/packages/schema/src/session-event.ts#L621-L670);
defined as location-carried ephemerals in
[`permission.ts`](/packages/schema/src/permission.ts#L44-L53) and
[`form.ts`](/packages/schema/src/form.ts#L160-L163)); permission publication
happens from the Location-scoped permission service
([`core/src/permission.ts`](/packages/core/src/permission.ts#L199-L212)). They
are admitted by Location audience (or derived coverage), never by exact-Session
match — matching the draft's open question resolution. Therefore: does the TUI
ever need a permission/form for a session whose Location is *not* in the
interest set? **No**, provided the policy holds:

- every open tab's resolved Location (S3) — which is where its permissions and
  forms are asked;
- pending-move source and destination while a move is in flight (S8–S10);
- server-derived destinations for followed sessions across foreign moves (S14).

A background tab waiting on permission is covered by its own tab Location. The
residual window is the pre-resolution tab (no session info yet), where the
prefetch's HTTP `permission.sync`/`form.sync` (L313-L318) is the only source —
which is exactly why S3 must fire at info resolution, not at the 300 ms timer.
The visible route is additionally covered because the route session is a tab
(S4/S5). Global MCP elicitations (`sessionID: "global"`) are Location-owned and
covered by the route/home holds (S5/S6); Home deliberately surfaces them
([`home.tsx`](/packages/tui/src/routes/home.tsx#L31-L33)).

**Family members.** Tab status reads permissions/forms/busy for the whole
`family(root)` ([`session-tabs.tsx`](/packages/tui/src/context/session-tabs.tsx#L170-L175)),
and members are separate sessions that a move does **not** relocate
(`Session.move` moves one session; only *deletion* cascades to children,
[`session.ts`](/packages/core/src/session.ts#L375-L376)). Members normally
share the root's Location, so tab Location covers them; but after a parent
moves, a still-running member's events still route to the old Location. The
predicate therefore holds resolved Locations of family members of every
followed root while the tab exists — cheap, since `family()` is already
computed for status badges.

**Persistent terminals.** `persistent-pty.added/removed` are session-targeted
and refresh via HTTP
([`session-terminals.tsx`](/packages/tui/src/context/session-terminals.tsx#L50-L59));
covered by the session/route holds.

## Removal hysteresis

Rapid churn: tab open/close flapping, cycling between two projects' tabs,
`/cd` around. Policy is asymmetric:

- **Adds are immediate and synchronous** with the state change (and awaited
  before dependent mutation POSTs).
- **Removes are deferred and coalesced**: a key is removed only when it has
  been absent from the desired set for a continuous debounce window
  (suggest 2–5 s trailing), batched into one patch command. The connection
  layer's command coalescing (draft) merges anything tighter.
- **Route switching between already-held tabs changes nothing**: cycling
  between tabs of projects A and B holds both sessions (both are tabs) and
  both Locations (both tabs resolved) — the single Location-context slot
  flipping is not itself an interest change.
- The launch/default Location is effectively permanent (`data.location.default()`
  is Home's fallback), so `/cd`-style churn never removes it.

Concrete predicate the provider can implement. All inputs already exist except
the two marked additive:

```ts
type InterestFacts = {
  // existing reactive state
  readonly defaultLocation: () => LocationRef                          // data.location.default()
  readonly locationContext: () => LocationRef | undefined              // useLocation().ref
  readonly route: () => Route                                           // route.data
  readonly tabs: () => ReadonlyArray<{ sessionID: SessionID }>          // state().tabs, active scope
  readonly sessionLocation: (id: SessionID) => LocationRef | undefined  // data.session.get(id)?.location
  readonly family: (rootID: SessionID) => readonly SessionID[]          // data.session.family(rootID)
  // additive surfaces (small, local)
  readonly optimisticSessions: () => ReadonlySet<SessionID>             // data-exposed sessionOutbox ids
  readonly pendingMoves: () => ReadonlyMap<SessionID, LocationRef>      // provider-owned, per admitMove/releaseMove
}

function desiredInterest(f: InterestFacts): { locations: Map<LocationKey, LocationRef>; sessions: Set<SessionID> } {
  const locations = new Map<LocationKey, LocationRef>()
  const sessions = new Set<SessionID>()
  const hold = (ref: LocationRef | undefined) => { if (ref) locations.set(locationKey(ref), ref) }

  hold(f.defaultLocation())                       // Home fallback: launch Location, effectively permanent
  hold(f.locationContext())                       // the "current project" slot /cd and routes drive
  if (f.route().type === "home") hold(f.route().location)
  if (f.route().type === "session") sessions.add(root(f.route().sessionID))

  for (const tab of f.tabs()) {
    sessions.add(tab.sessionID)
    hold(f.sessionLocation(tab.sessionID))        // S3: added the moment it resolves
    for (const member of f.family(tab.sessionID)) hold(f.sessionLocation(member))
  }
  for (const id of f.optimisticSessions()) { sessions.add(id); hold(f.sessionLocation(id)) }
  for (const [id, destination] of f.pendingMoves()) {
    sessions.add(id)
    hold(destination)                             // admit-before-POST destination
    hold(f.sessionLocation(id))                   // source until session.moved releases the entry
  }
  return { locations, sessions }
}
```

Removal rule, stated once: a requested key leaves the set only when
`desiredInterest` has not contained it for the whole debounce window, applied
through one batched patch. Nothing else — not a route change, not a tab close,
not a `location.set` — removes synchronously. This makes the draft's "Location
remove only when no route, tab, optimistic creation, or derived move still
requires it" checkable: the predicate above *is* the "still requires it"
relation, with family members added.

## What must NOT change interest

Verified call sites that are interest-neutral:

- **Tab reorder** (`move`, [`session-tabs.tsx`](/packages/tui/src/context/session-tabs.tsx#L457-L465)),
  **cycle/select navigation between existing tabs** (L466-L482), **preview
  promote** (L406-L414) — pure tab-state/layout.
- **Scroll anchors** (L387-L401), **title generation** (rename POST via
  [`context/data.tsx`](/packages/tui/src/context/data.tsx#L28-L39)), **viewed
  acknowledgement** (`session.view` POST, L236-L263), **prompt pulses**
  (L333-L340) — HTTP or display state only.
- **Dialog browsing**: the open dialog's `session.list`/`project.sync` are
  HTTP reads; interest changes only on selection (S4, S6)
  ([`dialog-open.tsx`](/packages/tui/src/component/dialog-open.tsx#L47-L77), [L212-L221](/packages/tui/src/component/dialog-open.tsx#L212-L221)).
- **Hydration itself**: `server.connected` broad hydration
  ([`data.ts`](/packages/client/src/solid/data.ts#L528-L556)) and every
  `data.*.sync` are reads; they never mutate interest. Note hydration reads
  remain server-global (e.g. `session.active()` returns all Locations'
  running sessions), so tab busy-badges bootstrap even before a tab's Location
  resolves; live events then take over.
- **Config reloads** except a `tabs.scope` switch (S18); theme/devtools/editor
  context; plugin routes.
- **The session route setting the Location context** (L198) must never remove
  the previous Location — removals only through the predicate + debounce.
- **Global-audience events** (`tui.prompt.append`, `tui.command.execute`,
  credential events) are always delivered under the draft's model; the
  workspace-filtering the prompt applies
  ([`prompt/index.tsx`](/packages/tui/src/component/prompt/index.tsx#L345-L356))
  is client-side and unrelated to interest.

## Product semantics note: interest is the notification scope

The notifications feature plugin fires on `permission.asked`, `form.created`,
and `session.execution.*` for **whatever arrives on the feed**
([`notifications.ts`](/packages/tui/src/feature-plugins/system/notifications.ts#L44-L71)).
Today that means every session on the server; under this policy it means
sessions in the interest set. This is a real, user-visible behavior change —
arguably the desired one (no more notifications for other projects' agents),
but it should be decided consciously: the TUI's interest set becomes its
attention scope, not merely a rendering optimization. If cross-project
attention must survive, it needs a separate low-rate server-side aggregate,
which is outside this policy.

## Open questions

- Should the initial GET include persisted tab Session IDs (the accessor
  variant), or is the `[ready, patch-applied]` window acceptable given HTTP
  prefetch repairs restored tabs anyway?
- Does the family-member hold belong in the predicate permanently, or only
  while the root tab is busy (`status().busy`)? Holding always is simpler;
  holding while busy is tighter and matches when member events actually matter.
- Should a move whose admission POST succeeded but whose `session.moved` never
  arrives (server restart between admission and the safe boundary) keep its
  `pendingMoves` hold across reconnect, or clear it on reconnect hydration —
  and if kept, with what timeout?
- Is the notifications scope change (above) accepted as product behavior, or
  does it motivate an attention aggregate event?

## Cross-references

- [Controlled SSE draft](/.design/bus-smart/controlled-draft0.gpt56s.md) —
  this document operationalizes its "Client ownership" patch rules and
  validates its startup claim against mount order.
- [Downstream review](/.design/bus-smart/review0.gpt56s.md) — finding 1
  ("the full TUI is not a single-Location subscriber") enumerates the
  multi-Location surfaces; this map is the exhaustive per-surface answer.
- [Controlled-SSE research](/.design/bus-smart/research-controlled-sse0.gpt56s.md) —
  "TUI and reconnect" names `SessionTabsProvider` as interest producer; this
  document supplies the concrete trigger table and the outbox/family gaps that
  research's requested-set sketch missed.
- [Location streams design](/.design/bus-smart/location-streams0.gpt56s.md) —
  its "TUI interest owner" list (launch/current Home Location, visible session
  Location, open-tab Locations, family-member Locations, optimistic and
  move-destination Locations) matches this predicate; the family-member entry
  is validated here against `Session.move`'s non-cascading behavior.
- [Original bus-smart design](/.design/bus-smart/bus-smart.glm53.md) — §5
  ("tabs multiply exposure") is the motivating observation; this map is the
  per-trigger refinement of that exposure.
