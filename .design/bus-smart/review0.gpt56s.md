---
type: DesignReview
title: bus-smart downstream-patch assessment
description: Review the location-scoped event-feed design with patch carry cost and the TUI's multi-Location behavior as primary constraints.
resource: /design/bus-smart/review0
tags: [server, events, tui, performance, sse, downstream-patch]
status: draft
generated: { by: "agent:gpt-5.6-sol#xhigh", at: 2026-08-31 }
verified: { by: unassigned, at: never }
stale_after: 2026-11-30
sources:
  - id: proposed-design
    resource: /design/bus-smart
    title: bus-smart location-scoped event feed
  - id: bus
    resource: /packages/core/src/bus.ts
    title: Bus routing implementation
  - id: event-feed
    resource: /packages/server/src/event-feed.ts
    title: Server event feed
  - id: client-data
    resource: /packages/client/src/solid/data.ts
    title: Solid client projection
  - id: tui-tabs
    resource: /packages/tui/src/context/session-tabs.tsx
    title: TUI multi-session tabs
---

# bus-smart downstream-patch assessment

## Verdict

The [original design](/.design/bus-smart/bus-smart.glm53.md) is directionally
right about the structural problem and the ownership of routing semantics:

- The public SSE feed is global.
- The Bus already owns the difficult Session-to-Location routing rules.
- Filtering before events reach the client is the eventual architectural fix.
- Unscoped subscribers must remain global for compatibility.

It should **not be implemented end-to-end as written** for a long-lived
downstream patch. Its proposed full-TUI opt-in assumes one stable Location, but
the TUI intentionally follows sessions and tabs across Locations. The protocol
change also expands a small behavior change into generated-client and call-site
churn across six packages.

The best downstream sequence is:

1. Make the Solid projection ignore high-rate Session events for Sessions it is
   not tracking, then measure the original reproduction.
2. Stop if that removes the CPU problem and queue overflow does not occur.
3. If transport volume remains material, design an interest-set subscription
   for all Locations represented by the active route and open tabs. Treat that
   larger contract as an upstreamable feature, not as the first downstream
   patch.

## What holds up

### The diagnosis is structurally credible

[`EventFeed.layer`](/packages/server/src/event-feed.ts#L83-L88) observes
[`bus.listen`](/packages/core/src/bus.ts#L161-L162), the deliberately global,
deprecated callback surface. In contrast, [`Bus.subscribe()`](/packages/core/src/bus.ts#L121-L134)
applies the existing Location filter through [`local()`](/packages/core/src/bus.ts#L726-L762).

The Bus's route snapshots correctly cover the difficult cases: cold Session
ownership, forks, moves to both old and new owners, batched durable events, and
slow subscribers. Re-deriving those rules in the server would be a mistake.

### Filtering at the feed is the right eventual seam

Filtering before queue admission would reduce network traffic, client parsing,
Solid work, and overflow pressure together. The current EventFeed also has
useful properties worth preserving: public-event filtering before capacity is
consumed, one bounded queue per subscriber, per-subscriber overflow failure,
and encode-once fan-out.

### Global fallback is necessary

Desktop, SDK, plugin, and other consumers can legitimately need the global
stream. Location scoping should remain an explicit subscription choice rather
than silently changing the existing endpoint's default.

## Blocking findings

### 1. The full TUI is not a single-Location subscriber

The proposed `useLocation().ref` handoff cannot be wired where the design puts
it. [`ClientProvider`](/packages/tui/src/app.tsx#L376-L424) wraps
`DataProvider` and `LocationProvider`, while
[`LocationProvider`](/packages/tui/src/context/location.tsx#L14-L18) itself
depends on both client and data.

More importantly, a static launch Location would be wrong even if the provider
tree were rearranged:

- A Session route follows the Session's Location
  ([`routes/session/index.tsx`](/packages/tui/src/routes/session/index.tsx#L195-L198)).
- Home can navigate to another project Location
  ([`routes/home.tsx`](/packages/tui/src/routes/home.tsx#L31-L42)).
- The Open dialog can select Sessions and projects outside the launch Location
  ([`dialog-open.tsx`](/packages/tui/src/component/dialog-open.tsx#L212-L220)).
- Tabs load and retain Sessions from every represented Location
  ([`session-tabs.tsx`](/packages/tui/src/context/session-tabs.tsx#L276-L320)).
- `tabs.scope = "global"` is supported, even though `cwd` is the default
  ([`config/index.tsx`](/packages/tui/src/config/index.tsx#L289-L295)).

A single-Location stream would make a visible foreign Session and background
foreign tabs stale. This is ordinary supported navigation, not only the rare
`session.moved` edge case described by the proposal.

Reconnecting whenever the active Location changes is also unattractive. Each
new stream emits `server.connected`, which performs broad hydration
([`data.ts`](/packages/client/src/solid/data.ts#L528-L556)); connection loss
invalidates every cached read ([`data.ts`](/packages/client/src/solid/data.ts#L1980-L1983)).
Without an interest-set design, scope switching can replace the firehose with a
refetch storm.

### 2. `LocationQuery` creates generated and source-call churn

The current Promise client has the convenient signature
`event.subscribe(requestOptions?)`
([`generated/client.ts`](/packages/client/src/promise/generated/client.ts#L1597-L1602)).
Adding optional endpoint input changes it to
`event.subscribe(input?, requestOptions?)` because of the generator's argument
rule ([`httpapi-codegen`](/packages/httpapi-codegen/src/index.ts#L906-L947)).

Existing calls that pass `{ signal }` in the first position must all change,
including:

- [`client/src/solid/connection.ts`](/packages/client/src/solid/connection.ts#L63-L74)
- [`tui/src/mini/stream-v2.transport.ts`](/packages/tui/src/mini/stream-v2.transport.ts#L1400-L1409)
- [`cli/src/run/noninteractive.ts`](/packages/cli/src/run/noninteractive.ts#L70-L73)
- [`cli/src/acp/event.ts`](/packages/cli/src/acp/event.ts#L85-L90)

The change also regenerates the Promise client/types and Effect client/shape
trees. Those generated files change for unrelated protocol work and are poor
long-lived patch surfaces. The wire fallback can be compatible while the SDK
source interface is still disruptive.

Request options already support arbitrary headers
([`generated/client.ts`](/packages/client/src/promise/generated/client.ts#L264-L305)).
If a private fixed-Location experiment is needed, existing
`x-opencode-directory` and `x-opencode-workspace` headers avoid protocol and
codegen churn.

### 3. `requestRef` cannot represent "unscoped"

[`requestRef`](/packages/server/src/location.ts#L69-L78) always returns a Ref,
defaulting the directory to `process.cwd()`. Calling it unconditionally from
the event handler would scope old clients to the server working directory and
violate the design's global fallback.

The raw handler must first detect an explicitly supplied location query or
header. Only that branch may call `requestRef`; absent or empty location input
must remain global.

### 4. `Bus.deliversTo` is identity-sensitive, not pure

The route table is an instance-local `WeakMap` keyed by the exact event payload
object ([`bus.ts`](/packages/core/src/bus.ts#L182-L207)). A cloned, decoded, or
JSON-round-tripped event has no route snapshot. Calling the proposed fallback
on such an unlocated Session event would incorrectly classify it as global.

The current EventFeed listener receives the same object after route
installation, so the narrow implementation path is valid. The concern is the
proposed public interface: `deliversTo` exposes hidden identity and timing
constraints and is not the pure predicate the design claims.

If transport scoping proceeds, prefer a behavior-oriented Bus interface such
as an explicit routed subscription over exposing the route-table lookup. If
preserving EventFeed's encode-once implementation is more important than that
interface quality, keep the identity-sensitive predicate instance-owned and
document its narrow contract; do not export it as a general module helper.

### 5. The hottest client work is understated

Foreign deltas are not merely cheap no-ops after the first one. Every call to
[`message.update`](/packages/client/src/solid/data.ts#L390-L399) enters a Solid
`setStore(...produce(...))` and creates an empty per-Session message array when
none exists. High-rate text, reasoning, tool-input, and tool-progress events
all call it ([`data.ts`](/packages/client/src/solid/data.ts#L851-L975)).

Foreign `session.created` also starts an HTTP read unconditionally, and
`session.renamed` does the same
([`data.ts`](/packages/client/src/solid/data.ts#L561-L571),
[`data.ts`](/packages/client/src/solid/data.ts#L620-L626)). Guarding only create
and rename, as the proposal's sixth commit suggests, misses the repeated Solid
store work.

This is also the best first downstream seam. Open tabs and visible Sessions
explicitly sync their metadata and transcript, so they become tracked without
relying on unrelated global events
([`session-tabs.tsx`](/packages/tui/src/context/session-tabs.tsx#L285-L320),
[`routes/session/index.tsx`](/packages/tui/src/routes/session/index.tsx#L332-L353)).

### 6. Causality still needs a before/after result

The firehose and projection work are strong suspects, but code inspection does
not prove how much of the observed CPU they explain. The proposed verification
is good, but it belongs before committing to the multi-package transport
change. The existing devtools bar already measures process CPU and event-loop
p99 ([`devtools-bar.tsx`](/packages/tui/src/component/devtools-bar.tsx#L110-L141)).

## Patch-carry comparison

| Approach | Downstream surface | Preserves current TUI behavior | Removes wire volume | Recommendation |
| --- | --- | --- | --- | --- |
| Original single-Location design | Core, Protocol, Server, Client, TUI, CLI, generated outputs | No | Yes | Do not implement as written |
| Tracked-Session projection guard | Client data + focused test | Yes, with explicit interest rules | No | First patch |
| Header-scoped fixed-Location consumer | Core/Server plus that consumer; no codegen | Only for genuinely fixed consumers | Yes | Optional experiment for mini/noninteractive clients |
| Multi-Location interest-set feed | Core, Server, Client, TUI; Protocol only if made public | Yes | Yes | Eventual upstream design |

The first patch touches a high-churn file, but only in a few localized hunks.
That is still easier to carry than coordinated signature and generated changes
across six packages. The test should encode the interest rule so rebases fail
loudly rather than silently restoring foreign projection work.

## Recommended first patch

Change the Solid projection so unknown, unrequested Sessions do not become
tracked merely because their events appeared on the global feed.

The exact interest predicate needs implementation-level validation, but it
should recognize at least:

- a Session already present in `store.session.info`;
- an optimistic local Session in `sessionOutbox`;
- an explicit Session or message synchronization currently in flight;
- a Session whose transcript/pending/permission/form state was explicitly
  loaded for an open tab or visible route.

Apply that interest rule to:

- `session.created` and `session.renamed` HTTP revalidation;
- transcript-producing Session event families before `message.update`;
- any other high-rate event that materializes state for an unknown Session.

Keep low-rate global lifecycle behavior initially unless a test demonstrates
it is safe to drop. In particular, permission/form attention and active-Session
discovery have product semantics beyond transcript rendering.

Add a focused regression test that floods an unknown Session with stream
events and asserts:

- no Session HTTP reads;
- no transcript or message index is materialized;
- an explicitly synchronized or remembered Session still updates normally;
- optimistic creation still receives its durable live events.

Then compare the same two-project reproduction before and after using process
CPU, event-loop p99, and received event counts. The last metric may require
temporary logging or a small devtools counter; it distinguishes "events still
arrive but are cheap" from actual transport filtering.

## If transport scoping remains necessary

Revise the contract around a **set of interested Locations**, not one current
Location. The set should include the visible route and every open tab whose
Session metadata has resolved. Adding interest must not leave the route stale;
removing interest can be conservative so tab churn does not repeatedly reopen
the stream.

For a downstream-only experiment:

- Use request headers rather than `LocationQuery` to avoid generated outputs.
- Opt in only consumers that are genuinely fixed to one Location, such as the
  mini transport when supplied `input.location`.
- Keep absent headers global.
- Reuse Bus routing behavior; do not infer ownership from event payloads.

For an upstream-quality full-TUI change:

- Define the interest-set lifecycle first, including bootstrap and reconnect.
- Prefer a routed-subscription Bus interface over a public WeakMap predicate.
- Decide whether multiple Locations are represented by one stream or merged
  streams, including global-event deduplication.
- Only then decide whether the public endpoint deserves typed protocol input
  and generated-client churn.

## Decision gates

1. Does the tracked-Session guard flatten TUI CPU and event-loop delay during
   foreign streaming?
2. Does the scoped queue still overflow, reconnect, or consume material
   bandwidth after projection work is removed?
3. Which clients are truly fixed-Location, and which need an interest set?
4. Is the transport change intended for upstream acceptance? If yes, optimize
   the interface for coherent multi-Location semantics. If no, optimize the
   downstream patch for localized, non-generated changes.

## Cross-references

- [Original bus-smart design](/.design/bus-smart/bus-smart.glm53.md) provides
  the diagnosis, routing matrix, and proposed single-Location transport change
  reviewed here.
- [Bus Session routing tests](/packages/core/test/bus-session-routing.test.ts)
  are the behavioral oracle for any later server-side routing work; reuse their
  cases rather than duplicating routing logic in Server.
- [EventFeed tests](/packages/server/test/event-feed.test.ts) capture the
  encode-once, bounded-queue, overflow, and public-event properties a transport
  revision should preserve or explicitly trade away.
