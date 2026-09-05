---
type: Research
title: TUI interest policy and attention consumers — same-project scoping for draft1
description: Inventory the shipped EventInterestProvider policy, every TUI/CLI/app consumer that depends on or keeps alive the event firehose, the same-project concurrent-sessions overdelivery, and the viable coarse-summary vs session-detail cuts; recommend draft1 scope and an explicit notification product choice with a safe default.
resource: /design/bus-smart/research1-interest-policy
tags: [tui, events, interest, notifications, attention, projection, same-project, draft1]
status: draft
generated: { by: "agent:glm-5.3#max", at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-12-05
sources:
  - id: directional-design
    resource: /design/bus-smart/draft0
    title: Controlled event feed directional draft
  - id: tui-interest-research
    resource: /design/bus-smart/research-tui-interest0
    title: TUI interest policy for the controlled SSE
  - id: downstream-review
    resource: /design/bus-smart/review0
    title: bus-smart downstream-patch assessment
  - id: verification
    resource: /design/bus-smart/verification0
    title: Controlled event feed verification
  - id: event-interest
    resource: /packages/tui/src/context/event-interest.tsx
    title: EventInterestProvider desired-set policy
  - id: controlled-feed-client
    resource: /packages/client/src/solid/controlled-event-feed.ts
    title: Controlled feed controller (grace, fallback, generations)
  - id: shared-events
    resource: /packages/client/src/shared-events.ts
    title: Refcounted shared legacy event connection
  - id: solid-data
    resource: /packages/client/src/solid/data.ts
    title: Solid projection event handlers
  - id: session-tabs
    resource: /packages/tui/src/context/session-tabs.tsx
    title: Tab model, family status, retention
  - id: notifications-plugin
    resource: /packages/tui/src/feature-plugins/system/notifications.ts
    title: TUI attention notifications
  - id: session-event-schema
    resource: /packages/schema/src/session-event.ts
    title: Session event manifest (detail vs summary classes)
---

# TUI interest policy and attention consumers — same-project scoping for draft1

## Situation

The controlled event feed is implemented and ported to `v2@origin`
([verification0](/.design/bus-smart/verification0.gpt56s.md)): the TUI declares a
desired interest set, the server admits global events plus requested/derived
Locations and exact Sessions, and two release gates remain — the notification
scope decision and a live before/after record. Meanwhile the motivating user
runs many clients and many activities, frequently **in the same project**, so
Location-scoped admission still admits every foreign same-project session's
full token stream. This document owns the TUI policy and consumer side of
draft1: what the shipped policy includes, which consumers depend on which event
classes, what keeps firehoses alive, and which coarse-summary versus
session-detail cuts the actual schema and consumers support. Server admission
mechanics, SharedEvents/transport cost internals, and move execution detail are
owned by other draft1 threads and only referenced here as boundaries.

Everything below marked **Fact** was verified against this worktree
(`opencode-bus-smart`, post-port). Recommendations are explicitly separated.

## Facts: the shipped interest policy

`EventInterestProvider` sits inside `SessionTabsProvider`
([app.tsx:385-386](/packages/tui/src/app.tsx#L385-L386)) and computes one
declarative set
([event-interest.tsx:17-31](/packages/tui/src/context/event-interest.tsx#L17-L31)):

| Held fact | Locations | Sessions |
| --- | --- | --- |
| Launch Location (`props.launch`, resolved pre-render in `Tui.run`) | always | — |
| Current Location context (`location.ref`) | while set | — |
| Home route target (`route.location`) | while on home | — |
| Session route root + family | every member's resolved Location | root + all family members |
| Every open tab root + family (active scope) | every member's resolved Location | root + all family members |

`follow()` at
[event-interest.tsx:49-57](/packages/tui/src/context/event-interest.tsx#L49-L57)
expands any root to its whole family and holds each member's Location the
moment it resolves in the store; `"dummy"` is skipped. Removals are never
synchronous: the controller wraps removals in a 3-second grace
(`removalGrace` at
[controlled-event-feed.ts:60](/packages/client/src/solid/controlled-event-feed.ts#L60),
`heldLocations`/`heldSessions` plus `scheduleRemovals`), and the launch
Location is effectively permanent because Home falls back to it. The provider
runs once synchronously at init and then reactively
([event-interest.tsx:30-31](/packages/tui/src/context/event-interest.tsx#L30-L31));
persisted tabs load synchronously before the stream opens, and first execution
waits for the optimistic-session interest PUT
([verification0](/.design/bus-smart/verification0.gpt56s.md) closeout items 1–2).

What the policy therefore achieves today: hidden/background tabs keep full
state (family + Locations held), subagents of tabbed or routed sessions keep
full state (family expansion), and cross-Location noise — other projects'
sessions — is excluded. What it cannot achieve: excluding **other sessions at
held Locations** (see [Same-project](#facts-the-same-project-concurrent-sessions-issue)).

## Facts: consumer inventory and event classes

The Session event manifest
([session-event.ts:623-672](/packages/schema/src/session-event.ts#L623-L672))
splits cleanly by rate and by who needs it:

- **Detail (transcript) class** — ephemeral, high-rate, only useful when a
  transcript is loaded: `step.started/streamed/ended/failed`,
  `text.started/delta/ended`, `reasoning.started/delta/ended`,
  `tool.input.started/delta/ended`, `tool.called/progress/success/failed`,
  `compaction.started/delta/ended/failed`, `message.content.updated`,
  `retry.scheduled`.
- **Summary (lifecycle) class** — low-rate: `created/deleted/renamed/forked/
  moved/viewed`, `usage.updated`, `agent/model.selected`, `execution.*`,
  `inbox.*`, `instructions.updated`, `synthetic`, `skill.activated`,
  `shell.started/ended`, `revert.*`.
- **Location-routed attention** (not SessionEvents, so exact-Session interest
  can never admit them): `permission.asked/replied`
  ([permission.ts:44-53](/packages/schema/src/permission.ts#L44-L53)),
  `form.created/replied/cancelled`
  ([form.ts:160-163](/packages/schema/src/form.ts#L160-L163)), `shell.*`.
- **Bus-global residuals**: `persistent-pty.added/removed` (published without
  Location; core
  [persistent-pty/index.ts:152-174](/packages/core/src/persistent-pty/index.ts#L152-L174)),
  `tui.prompt.append`/`tui.command.execute`, config/catalog/agent/credential/
  plugin/project/vcs/mcp/websearch families.

Which consumer needs which class:

| Consumer | Needs | Code |
| --- | --- | --- |
| Notifications plugin | summary `execution.*`; location-routed `permission.asked`, `form.created` (plus replied/cancelled for dedup sets) | [notifications.ts:44-75](/packages/tui/src/feature-plugins/system/notifications.ts#L44-L75) |
| Tab badges (busy/attention/unread) | summary `execution.*`, `inbox.*`; location-routed permission/form per **family member** of every open tab | [session-tabs.tsx:155-175](/packages/tui/src/context/session-tabs.tsx#L155-L175) |
| Solid projection | everything for tracked sessions; detail class only for sessions with loaded transcripts | [data.ts:567-1235](/packages/client/src/solid/data.ts#L567-L1235) |
| Session terminals | Bus-global `persistent-pty.*` (gated on already-tracked sessions), `server.connected` | [session-terminals.tsx:50-67](/packages/tui/src/context/session-terminals.tsx#L50-L67) |
| Home | global MCP forms (`form.created`, sessionID `"global"`) at the current Location | [home.tsx:36-38](/packages/tui/src/routes/home.tsx#L36-L38) |
| Open dialog | HTTP `session.list`; wildcard `event.listen` used only as a deleted/moved race guard while the list is in flight | [dialog-open.tsx:47-71](/packages/tui/src/component/dialog-open.tsx#L47-L71) |
| Plugin context | `plugin.updated`, `server.connected` via the TUI emitter | [plugin/context.tsx:510-511](/packages/tui/src/plugin/context.tsx#L510-L511) |

Two structural facts follow. First, **no TUI consumer needs the detail class
for a session whose transcript is not loaded** — and transcript retention is
tiny: `createSessionRetention` keeps the current session plus open tab roots,
limit 3
([session-tabs.tsx:142-148](/packages/tui/src/context/session-tabs.tsx#L142-L148)).
Second, the notifications plugin and the dialog race guard ride the **TUI
emitter** (`client.event.on/listen`, fed by the controlled connection at
[client.tsx:36-41](/packages/tui/src/context/client.tsx#L36-L41)), while the
Solid projection subscribes through `config.event.listen`
([data.ts:1850-1851](/packages/client/src/solid/data.ts#L1850-L1851)). A
projection-side guard therefore cannot silence notifications; the two surfaces
are independently policy-able.

## Facts: firehose keepers

**Inside the TUI process (controlled mode): none today.**
`SharedEvents` ([shared-events.ts](/packages/client/src/shared-events.ts)) is a
lazily-connected, refcounted legacy `GET /api/event` connection; the promise
client wraps `event.subscribe` with it
([promise/client.ts:12-16](/packages/client/src/promise/client.ts#L12-L16)).
In the TUI, the only subscriber is the controlled feed's legacy fallback path
([controlled-event-feed.ts:167-173](/packages/client/src/solid/controlled-event-feed.ts#L167-L173)),
taken only when the server 404s the controlled endpoint. TUI plugins ride the
Solid emitter, not the promise stream
([plugin/context.tsx](/packages/tui/src/plugin/context.tsx)); the persistent
terminal client uses HTTP token + socket, not the event feed
([solid/pty.ts:43-46](/packages/client/src/solid/pty.ts#L43-L46)); the RPC
event streams that do ride SharedEvents
([promise/rpc.ts:70](/packages/client/src/promise/rpc.ts#L70)) have no TUI
caller. The residual risk is silent: any future `api.event.subscribe` or
`api.rpc(...).events.on` call in the TUI process opens a second, **global**
SSE with no warning.

**Sibling clients that remain firehose consumers:**

- mini transport: unconditional global stream
  ([stream-v2.transport.ts:1426](/packages/tui/src/mini/stream-v2.transport.ts#L1426));
- CLI noninteractive and ACP: global by design
  ([noninteractive.ts:70-73](/packages/cli/src/run/noninteractive.ts#L70-L73),
  [acp/event.ts:85-90](/packages/cli/src/acp/event.ts#L85-L90));
- app/desktop: default adapter, no controlled feed
  ([client.tsx:80-93](/packages/app/src/runtime/server/client.tsx#L80-L93)); its
  notification surface listens on the SDK stream
  ([notification.tsx:273](/packages/app/src/shell/notifications/notification.tsx#L273)),
  so the app retains server-wide attention today.

The upstream archive checkout (`~/archive/anomalyco/opencode`) predates both
SharedEvents and this stack (no `promise/client.ts`, no `event-interest.tsx`),
so the port notes in
[verification0](/.design/bus-smart/verification0.gpt56s.md#L83-L108) remain the
authoritative upstream comparison: SharedEvents arrived from upstream during
the rebase; `EventInterestProvider` is this stack's addition.

## Facts: the same-project concurrent-sessions issue

This is the dominant residual cost for a many-clients user, and it is
structural: **the Location dimension cannot exclude foreign sessions, and the
Location dimension cannot be dropped.**

1. Permission and form events are Location-routed, never `SessionEvent.All`
   ([session-event.ts Definitions](/packages/schema/src/session-event.ts#L623-L672)
   excludes them). Exact-Session interest alone cannot admit a followed
   session's own `permission.asked`. So every followed session's Location must
   be held — the policy holds it — and holding a Location admits **every**
   session Bus routes there.
2. With several clients working in one repo, each TUI therefore receives every
   other client's full stream. Projection consequences, all unguarded:
   - foreign `session.created` and `session.renamed` trigger HTTP `session.sync`
     and store tracking
     ([data.ts:605-615](/packages/client/src/solid/data.ts#L605-L615),
     [data.ts:661-672](/packages/client/src/solid/data.ts#L661-L672));
   - `session.step.started` calls `message.update`, which materializes an empty
     message array for the unknown session
     ([data.ts:818-850](/packages/client/src/solid/data.ts#L818-L850);
     `draft[sessionID] ??= []` at
     [data.ts:399](/packages/client/src/solid/data.ts#L399));
   - every text/tool/reasoning/compaction delta then enters a Solid
     `setStore(...produce(...))` even though `editAssistant`/`editText`/`editTool`
     drop the write because the target row was never loaded
     ([data.ts:411-419](/packages/client/src/solid/data.ts#L411-L419));
   - foreign `permission.asked`/`form.created` materialize permission/form store
     entries with no tracking guard
     ([data.ts:1107-1113](/packages/client/src/solid/data.ts#L1107-L1113),
     [data.ts:1182-1188](/packages/client/src/solid/data.ts#L1182-L1188));
   - foreign `execution.*` update the global active map
     ([data.ts:988-990](/packages/client/src/solid/data.ts#L988-L990)).
3. [review0](/.design/bus-smart/review0.gpt56s.md) finding 5 predicted exactly
   this ("foreign deltas are not merely cheap no-ops") and recommended a
   tracked-session projection guard as the **first** patch. That guard was
   never implemented: `handleEvent` today has no interest/tracking predicate
   (verified — no guard exists in
   [data.ts](/packages/client/src/solid/data.ts)); the stack went straight to
   transport scoping, which fixes cross-project volume but leaves same-project
   projection work intact.

So today's matrix: cross-project noise — gone at the transport; same-project
noise — fully present on the wire **and** in the projection.

## Facts: coarse summary vs session detail — what is viable

Given the schema split and the consumer table, three cuts are real:

- **(a) Client-side projection guard** (no wire change). Drop detail-class
  handling for sessions without a loaded transcript or tracked info, and gate
  the unguarded HTTP revalidations (`session.created`/`renamed` sync, with the
  review0 caveat about keeping optimistic and explicitly-synced sessions
  working). Removes store writes and HTTP churn for foreign same-project
  sessions; events still cross the wire, so parse and emitter fan-out cost
  remains. This is review0's first patch, still missing.
- **(b) Tiered session fidelity in `EventInterest`** (wire change; reopens
  draft0's "no event-type filters" non-goal deliberately). The interest's
  `sessions` dimension gains a fidelity tier — full for route/tab families,
  summary for everything else at held Locations. The server admits only the
  summary class for summary-tier sessions. Permission/form are unaffected
  (Location-routed). This is the only option that removes same-project token
  volume from the wire while keeping background notifications and badges
  intact, because the summary class is exactly what those consumers read.
- **(c) Server aggregate attention event.** A new low-rate event (for example
  a per-session attention state change) that replaces even the summary stream
  for unfollowed sessions; draft0 already names this as the mechanism if
  machine-wide attention is ever required. Largest change, server-owned, out
  of TUI scope.

A "coarse summary" that keeps per-token deltas for followed sessions and none
for foreign same-project sessions is precisely (b); (a) is its projection-side
subset and needs no protocol work.

## Blind spots (enumerated)

1. **Same-project detail flood** — the central gap; see above.
2. **Foreign created/renamed HTTP churn** — every new session another client
   creates in a held Location costs this TUI a full `session.sync` read.
3. **Foreign attention ambiguity** — another client's `permission.asked` /
   `form.created` / `execution.*` in the same project fires this TUI's
   notification (sound always; OS notification unless the session is a
   subagent — [notifications.ts:11-18](/packages/tui/src/feature-plugins/system/notifications.ts#L11-L18)).
   Nobody chose this; it fell out of Location scoping.
4. **Notification metadata dependency** — `notify()` reads `data.session.get`
   for title and `parentID`; a projection guard that stops tracking foreign
   sessions entirely would degrade foreign notifications to title-less pings.
   The guard must keep summary-class tracking for held-Location sessions.
5. **Stale dialog badges cross-project** — the open dialog's running check
   reads the store's active map
   ([dialog-open.tsx:123-124](/packages/tui/src/component/dialog-open.tsx#L123-L124),
   [dialog-session-list.tsx:176-177](/packages/tui/src/component/dialog-session-list.tsx#L176-L177));
   the map is hydrated globally at `server.connected` via `session.active()`
   ([data.ts:573-585](/packages/client/src/solid/data.ts#L573-L585)) but live
   foreign execution events no longer arrive, so a foreign session's state can
   go stale between reconnects while the dialog is open.
6. **Dialog race guard scope** — the deleted/moved guard
   ([dialog-open.tsx:50-53](/packages/tui/src/component/dialog-open.tsx#L50-L53))
   now misses foreign-project deletions; worst case is a stale row until the
   dialog reopens.
7. **Bus-global residuals** — `persistent-pty.*` for every session, `tui.*`,
   and the config/catalog families still reach every subscriber regardless of
   interest (session-terminals ignores foreign PTYs; nobody else chokes on
   them, but they are unscoped volume).
8. **Silent SharedEvents reopen** — any future in-process `api.event.subscribe`
   or RPC-events subscriber reopens the global firehose with no diagnostic.
9. **Legacy fallback is a behavior cliff** — on an older elected server the
   TUI silently returns to the full firehose (mode-visible, but a real
   performance regression for this user's server fleet during rollout).
10. **`tabs.scope: "global"` widens correctly** — restored tabs across projects
    hold all their Locations (intended per
    [research-tui-interest0](/.design/bus-smart/research-tui-interest0.glm53.md));
    worth stating in draft1 so it is not mistaken for a leak.

## Recommendations for draft1

- **R1 — In scope (client/TUI): implement the tracked-session projection
  guard.** Review0's first patch, still missing. Guard the detail-class
  handlers and the unguarded created/renamed revalidations on "transcript
  materialized or session tracked (info present, outbox, sync in flight)",
  keep summary-class handling unguarded so notifications, titles, and badges
  keep working, and add review0's flood regression test. This is the
  same-project CPU fix that needs no protocol change.
- **R2 — In scope (TUI): make the attention predicate explicit in the
  notifications plugin.** Default preserves today's behavior exactly (fire on
  everything admitted). Ship a tighter "tracked families only" predicate as an
  opt-in experiment via the TUI experiments registry
  (`dialog-experiments.tsx`, gated by `config.experimental`), not as a
  default. This converts draft0's open notification gate from an implicit
  transport consequence into an explicit, reversible product choice.
- **R3 — Decision item for draft1 (cross-agent seam): tiered session fidelity
  in `EventInterest`.** Specify the vocabulary (`sessions` with
  `full`/`summary` tiers; TUI declares full for route/tab families, summary
  for everything else at held Locations) and pin the summary-class list from
  the table above. Admission mechanics belong to the server-owning thread;
  this is the upstreamable fix for same-project wire volume if measurement
  after R1 still shows material transport cost.
- **R4 — Out of scope, recorded:** server-wide attention aggregate (only if
  machine-wide attention becomes a requirement), app/CLI/mini conversion to
  the controlled feed, and `persistent-pty` reclassification (producer-side
  fix per draft0's residual-overdelivery rule).

## Notification product choice — explicit, with a safe default

| Policy | Meaning | Consequence |
| --- | --- | --- |
| **Location/project scope (safe default)** | Notify for any session at a retained Location | Current post-controlled behavior; no user-visible change; same-project foreign sessions still notify |
| Tracked families only (opt-in experiment) | Notify only for route/tab session families | Tighter and quieter; implemented as a client-side predicate in the notifications plugin, independent of transport and stable in legacy fallback |
| Server-wide attention | Notify for every session on the server | Requires a new low-rate aggregate event; server-owned; not justified by current demand |

**Recommended default: Location/project scope with R2's predicate explicitly
preserving it.** The tighter scope is an experiment the user can enable; the
default ships no behavior loss, and no approval of notification loss is
claimed here — cross-project notifications are already gone under the shipped
controlled feed, and same-project scoping remains the user's explicit choice.

## Open / unverified questions

- `session.usage.updated` rate (per step? per execution?) — affects summary-class
  sizing for R3; not measured here.
- Whether prompt footer's running count
  ([footer.tsx:24](/packages/tui/src/feature-plugins/prompt/footer.tsx#L24))
  reads family members or a wider set — partially read, unverified.
- Whether the app's SharedEvents connection is per-window or process-wide in
  desktop builds — the default-adapter fact stands, topology unverified.
- Live before/after CPU numbers remain blocked by the environment startup
  issue ([verification0](/.design/bus-smart/verification0.gpt56s.md) gate 2);
  R1's effect on the same-project reproduction is therefore predicted from
  code, not measured.
- Whether any v1 compatibility events (`message.part.*`) still reach the TUI —
  excluded from current Protocol per the schema package rules, assumed absent.

## Cross-references

- [Directional draft](/.design/bus-smart/draft0.gpt56s.md) — §5 defined this
  policy's shape and left the notification scope as its open gate; R2 answers
  it without transport change.
- [TUI interest research](/.design/bus-smart/research-tui-interest0.glm53.md) —
  the S1–S18 trigger map this implementation collapsed into one declarative
  function; its removal-hysteresis and family-hold conclusions are confirmed
  in code here.
- [Downstream review](/.design/bus-smart/review0.gpt56s.md) — finding 5 is the
  same-project projection cost; its first-patch recommendation became R1.
- [Verification](/.design/bus-smart/verification0.gpt56s.md) — implementation
  and port state; its two release gates frame this wave.
- [Bus audience research](/.design/bus-smart/research-bus-audience0.glm53.md) —
  why permission/form events are Location-routed and cannot be followed by
  exact-Session interest (the constraint that forces Location holds).
