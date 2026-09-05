---
type: Research
title: TUI interest policy, consumers, and attention scope for draft1
description: Enumerate what the implemented EventInterestProvider covers, which consumers keep or need which event classes, why same-project concurrent sessions remain the dominant overdelivery, and what coarse-vs-detail distinctions the schema and consumers actually support; recommend draft1 scope and a notification default.
resource: /design/bus-smart/research1-interest-policy
tags: [tui, events, interest, notifications, attention, projection, same-project]
status: draft
generated: { by: "agent:glm-5.3#max", at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-12-05
sources:
  - id: draft0
    resource: /design/bus-smart/draft0
    title: Controlled event feed directional draft
  - id: tui-interest0
    resource: /design/bus-smart/research-tui-interest0
    title: TUI interest policy for the controlled SSE
  - id: review0
    resource: /design/bus-smart/review0
    title: bus-smart downstream-patch assessment
  - id: verification0
    resource: /design/bus-smart/verification0
    title: Controlled event feed verification
  - id: event-interest
    resource: /packages/tui/src/context/event-interest.tsx
    title: Implemented TUI desired-interest policy
  - id: controlled-feed-client
    resource: /packages/client/src/solid/controlled-event-feed.ts
    title: Controlled feed client controller
  - id: shared-events
    resource: /packages/client/src/shared-events.ts
    title: Refcounted legacy shared event connection
  - id: tui-notifications
    resource: /packages/tui/src/feature-plugins/system/notifications.ts
    title: TUI attention notifications plugin
  - id: session-tabs
    resource: /packages/tui/src/context/session-tabs.tsx
    title: TUI tabs, family status, retention
  - id: data-projection
    resource: /packages/client/src/solid/data.ts
    title: Solid event projection
  - id: session-event-schema
    resource: /packages/schema/src/session-event.ts
    title: Session event manifest
---

# TUI interest policy, consumers, and attention scope for draft1

## Situation

The controlled feed is implemented and verified
([`verification0`](/.design/bus-smart/verification0.gpt56s.md)): the V2 TUI
declares a desired interest set, the server admits by Location audience plus
exact Session, moves are followed server-side, and legacy consumers are
untouched. Two release gates remain open: the **notification scope product
decision** and a live before/after record. Separately, the motivating user runs
many clients whose activities are frequently in the **same project**, so
Location scoping alone may leave most of the event volume in place. draft1
needs to know what the policy currently buys, what it cannot buy, and where
the TUI's own consumers set the floor.

This document owns the TUI policy/consumer side. SharedEvents mechanics beyond
their role as firehose keepers, server cost internals, and move execution
detail belong to sibling research.

Scope of claims: everything under "Facts" was verified in this worktree at the
cited lines on 2026-09-05 (base: v2@origin port, see verification0 §"Port to
v2@origin"). "Analysis" and "Recommendations" are labeled as such. Unverified
items are listed in [Open questions](#open-questions).

## Facts: the implemented policy

[`eventInterest`](/packages/tui/src/context/event-interest.tsx#L35-L65)
computes one complete set and `setDesired`s it synchronously at provider init
and reactively thereafter
([L17-L31](/packages/tui/src/context/event-interest.tsx#L17-L31)):

| Fact | Locations held | Sessions followed |
| --- | --- | --- |
| Full resolved launch Ref | always (permanent) | none |
| Current Location context (`/cd` slot) | while set | none |
| Home route explicit target | while Home is the route | none |
| Visible session route | root + every family member's known Location | root + family members |
| Every open tab (active scope) | root + every family member's known Location | root + family members |

`follow()` expands a root through `data.session.root()` + `family()` and holds
each member's session ID plus its resolved Location
([L49-L57](/packages/tui/src/context/event-interest.tsx#L49-L57)). `"dummy"`
is skipped (L50). `EventInterestProvider` sits inside `SessionTabsProvider`
and wraps `SessionTerminalsProvider`
([app.tsx:386-432](/packages/tui/src/app.tsx#L386-L432)), receiving the launch
Ref resolved before render.

The client controller
([`controlled-event-feed.ts`](/packages/client/src/solid/controlled-event-feed.ts))
coalesces to the latest transport target, keeps removals for a 3 s grace
(L60), keeps one PUT in flight (L90-L146), installs the initial target at the
ready frame before activation (L157-L182), and falls back to legacy only on a
pre-ready 404 (L162-L174). The TUI connection is wired to it unconditionally
([client.tsx:24-41](/packages/tui/src/context/client.tsx#L24-L41),
`subscribe: interest.subscribe`), so **the TUI already runs Location-scope
attention as implemented behavior** — cross-project notifications are already
suppressed in this stack's TUI; the open gate is sign-off, not code.

## Facts: what each TUI consumer actually needs

Every consumer reads the Solid global emitter
([client.tsx:36-38](/packages/tui/src/context/client.tsx#L36-L38)) or the
projected store; nothing in the TUI process opens its own stream (see
[Firehose keepers](#facts-firehose-keepers)).

### Attention consumers (low-rate, cross-session)

- **Notifications plugin**
  ([notifications.ts:44-75](/packages/tui/src/feature-plugins/system/notifications.ts#L44-L75))
  fires on exactly: `form.created`, `permission.asked`,
  `session.execution.started` (bookkeeping), and
  `session.execution.succeeded|interrupted|failed`. Subagents are detected via
  `session.parentID` from the store (L11-12) and get sound only, no OS
  notification (L16). Titles come from `data.session.get(sessionID)` — a store
  lookup, undefined for never-synced sessions.
- **Tab badges** ([session-tabs.tsx:155-175](/packages/tui/src/context/session-tabs.tsx#L155-L175)):
  `attention` reads `permission.list`/`form.list` for **every family member**;
  `busy` reads `status()` (`store.session.active`, fed by
  `session.execution.*` → `setSessionActive`,
  [data.ts:988-1007](/packages/client/src/solid/data.ts#L988-L1007)) and
  `pending.list` (fed by `session.inbox.*`, data.ts:721-760). `unread` reads
  root `info.time.idle/viewed` (info refreshed on execution end for tracked
  sessions, data.ts:1014-1016).
- **Session terminals**
  ([session-terminals.tsx:50-59](/packages/tui/src/context/session-terminals.tsx#L50-L59)):
  `persistent-pty.added|removed` (Bus-global per draft0's residual-overdelivery
  note) plus `server.connected`; refresh is gated on the session already having
  terminals locally, so foreign PTY events are dropped here.
- **Home** ([home.tsx:36-38](/packages/tui/src/routes/home.tsx#L36-L38)):
  global MCP elicitations (`form.*` with `sessionID: "global"`) for the
  current Location.
- **Location/plugin sync**: `server.connected`
  ([location.tsx:48](/packages/tui/src/context/location.tsx#L48),
  [plugin/context.tsx:510-511](/packages/tui/src/plugin/context.tsx#L510-L511)),
  `plugin.updated`.

### Detail consumers (high-rate, session-scoped)

- The **session transcript** projection: `session.step.*`, `session.text.*`,
  `session.reasoning.*`, `session.tool.*`, `session.compaction.*`,
  `session.message.content.updated`, `session.retry.scheduled`
  (data.ts:818-1105). Streaming edits drop when the target message was never
  loaded — `editAssistant`/`editText`/`editTool` no-op on index miss by design
  ([data.ts:411-419](/packages/client/src/solid/data.ts#L411-L419)) — but every
  one still enters `message.update` → `setStore(...produce(...))`
  ([data.ts:394-401](/packages/client/src/solid/data.ts#L394-L401)), and
  `session.step.started` materializes `draft[sessionID] ??= []` for unknown
  sessions (L819, L399).
- **Transcript retention is tiny**:
  `createSessionRetention` keeps only the current session plus open-tab roots,
  limit 3 ([session-tabs.tsx:142-148](/packages/tui/src/context/session-tabs.tsx#L142-L148)).
  Detail-class events are semantically load-bearing for at most ~4 sessions;
  for every other admitted session they are dead weight that the projection
  already mostly drops after paying the store-write overhead.

### Discovery/lifecycle consumers

- `session.created` → unconditional `session.sync` HTTP read + tracking
  ([data.ts:605-615](/packages/client/src/solid/data.ts#L605-L615));
  `session.renamed` → same (L661-672). This fires for **every** admitted
  foreign session create/rename — under Location scope, every new session any
  other client starts in the same project.
- `permission.asked` materializes `store.session.permission[sessionID]` for any
  arriving session with **no info guard** (L1107-1113); `form.created` the same
  (L1182-1188). For foreign sessions these store entries have no reader other
  than the notifications plugin's title/parentID lookup.
- `session.active` is hydrated **globally across Locations** by HTTP on
  `server.connected` ([data.ts:569-589](/packages/client/src/solid/data.ts#L569-L589)),
  so dialog running badges
  ([dialog-open.tsx:123-124](/packages/tui/src/component/dialog-open.tsx#L123-L124),
  [dialog-session-list.tsx:176-177](/packages/tui/src/component/dialog-session-list.tsx#L176-L177))
  bootstrap for all projects but only update live for admitted sessions.

## Facts: firehose keepers

Who still runs or could run the global feed:

1. **TUI process, controlled mode: nobody.** No TUI source calls
   `api.event.subscribe`; plugins use the TUI emitter, session-terminals uses
   HTTP + emitter, the persistent-PTY client uses HTTP token + websocket
   ([pty.ts:43-46](/packages/client/src/solid/pty.ts#L43-L46)). The promise
   client's `SharedEvents` connection is lazy — it opens only on the first
   iterator pull ([shared-events.ts:93-104](/packages/client/src/shared-events.ts#L93-L104))
   and stops when the last subscriber leaves (L63).
2. **TUI legacy fallback**: the controlled controller's 404 path subscribes to
   `api.event.subscribe` ([controlled-event-feed.ts:173](/packages/client/src/solid/controlled-event-feed.ts#L173)),
   which is the SharedEvents-wrapped legacy feed
   ([promise/client.ts:10-17](/packages/client/src/promise/client.ts#L10-L17)).
   Intended, but it means fallback mode is a full firehose plus SharedEvents
   refcounting.
3. **Latent risk**: any future TUI call to `api.event.subscribe` **or**
   `api.rpc(def).events.on` (rpc event streams iterate the same SharedEvents
   connection, [rpc.ts:68-82](/packages/client/src/promise/rpc.ts#L68-L82))
   silently re-opens the global feed in-process. Nothing guards against this
   today.
4. **CLI**: noninteractive run mode and the ACP adapter subscribe globally
   (line refs from [`review0`](/.design/bus-smart/review0.gpt56s.md) §2:
   noninteractive.ts:70-73, acp/event.ts:85-90 — not re-verified this session).
5. **mini transport**: `client.event.subscribe` directly
   ([stream-v2.transport.ts:1426](/packages/tui/src/mini/stream-v2.transport.ts#L1426))
   — always global, separate process.
6. **App/desktop**: default adapter, no `subscribe` option
   ([app/runtime/server/client.tsx:80-93](/packages/app/src/runtime/server/client.tsx#L80-L93));
   app notifications listen on the SDK stream
   ([notification.tsx:273](/packages/app/src/shell/notifications/notification.tsx#L273)).
   Global by design; converting app is a draft0 non-goal.
7. **Upstream comparison**: the local archive
   (`~/archive/anomalyco/opencode`) predates both the upstream SharedEvents
   wrapper and this stack (no `promise/client.ts`, no `event-interest.tsx`),
   so parity facts come from verification0's port section: the wrapper arrived
   from upstream during the rebase and this stack overrides only `subscribe`.

## Facts: the same-project concurrent sessions issue

This is the central remaining gap for the motivating workload:

- The launch Location is held **permanently**
  ([event-interest.tsx:59](/packages/tui/src/context/event-interest.tsx#L59)),
  and the admission predicate is Location-audience-based (draft0 §2). Every
  event Bus routes to that directory — **every token of every session of every
  client working in the same project**, including other TUIs' sessions and
  their subagent families — is admitted.
- The policy's Session dimension only *adds* recipients; it never narrows the
  Location dimension. Holding the project is not optional, either:
  `permission.asked`/`form.created` are **not** `SessionEvent.All` — they are
  Location-routed ephemerals (absent from
  [session-event.ts:623-672](/packages/schema/src/session-event.ts#L623-L672);
  published from the Location-scoped permission service). Exact-Session
  interest does not admit them. Dropping the Location hold would break this
  TUI's own background-tab permission/form badges and notifications.
- What the TUI pays per foreign same-project session under the current
  projection:
  - every `session.step.started` materializes an empty message array
    (Solid store write, [data.ts:399](/packages/client/src/solid/data.ts#L399));
  - every `session.text.delta`/`tool.input.delta`/`reasoning.delta` enters
    `setStore(produce(...))` and drops at index miss;
  - `session.created`/`renamed` trigger a full `session.sync` HTTP round trip
    and store tracking, then retention eviction churn;
  - `permission.asked`/`form.created`/`execution.*` materialize store entries
    whose only reader is the notification title lookup.
- Cross-Location (other-project) noise is already eliminated; **same-project
  noise is bounded only by how much work happens in the launch project**. For
  a user with many clients concentrated in few projects, this plausibly
  remains the dominant TUI CPU path — this is analysis, not a measurement;
  the live before/after gate (verification0) has not produced numbers.

## Facts: viable coarse-vs-detail distinctions from schema and consumers

The event manifest supports a clean split because **no cross-session consumer
reads the detail class**:

| Class | Members (from session-event.ts Definitions + data.ts consumers) | Consumers |
| --- | --- | --- |
| Detail (streaming) | `session.step.*`, `session.text.*`, `session.reasoning.*`, `session.tool.*`, `session.compaction.*`, `session.message.content.updated`, `session.retry.scheduled` | transcript projection only; load-bearing only for visible/retained sessions (≤ current + 3 tab roots) |
| Summary (lifecycle) | `session.created/deleted/renamed/forked/moved/viewed`, `session.usage.updated`, `session.agent.selected`, `session.model.selected`, `session.execution.*`, `session.inbox.*`, `session.instructions.updated`, `session.synthetic`, `session.skill.activated`, `session.shell.started/ended`, `session.revert.*` | notifications, tab badges, dialogs, store tracking |
| Attention (Location-routed, not SessionEvents) | `permission.asked/replied`, `form.created/replied/cancelled` | notifications, tab badges, Home global forms, prompt |
| Location/config | `shell.*`, `persistent-pty.*`, project/config/catalog/agent/command/skill/integration/credential/plugin/reference/vcs/mcp/websearch/filesystem/tui/installation/server/worktree/workspace events | various scoped UIs; mostly low-rate |

Three implementable shapes follow:

- **(a) Client-side projection guard** (no wire change): drop detail-class
  handlers for sessions that are not tracked (not in `store.session.info`,
  outbox, route, tabs, or retention-kept). `editAssistant` already drops the
  payloads; the guard removes the per-event `produce()` cost and empty-array
  materialization. Notifications are unaffected (they consume the emitter and
  the summary/attention classes). This is review0's recommended first patch,
  and it is **still unimplemented** — verified by reading the handlers; no
  tracking guard exists in data.ts.
- **(b) Per-session fidelity tiers in admission**: extend `EventInterest`
  sessions to carry `{ id, fidelity: "detail" | "summary" }`; the server
  admits summary-tier sessions' events from the summary class only. This is
  an event-type filter scoped per followed session — draft0 made event-type
  filters a non-goal for *authorization*, but same-project load may justify
  reopening it as a *volume* mechanism. Kills foreign same-project streaming
  at the wire, not just the projection. Requires Protocol/Server change
  (sibling agent's ownership) with the TUI declaring tiers.
- **(c) Server-side attention aggregate** (draft0's server-wide option): a new
  low-rate event summarizing running/idle/attention across the server.
  Out of TUI scope; noted for completeness.

## Analysis: blind spots in the current policy

1. **Same-project overdelivery** (above) — the policy has no lever for it.
2. **Foreign `session.created`/`renamed` HTTP sync churn** — unconditional,
   includes sessions this TUI will never display outside a dialog.
3. **Foreign permission/form store materialization** — write-only state whose
   only reader is the notification title; if (a) is implemented, decide
   deliberately whether foreign-session notifications carry titles (keep sync)
   or go titleless (drop sync for untracked sessions).
4. **Residual global events**: `persistent-pty.added/removed` for every server
   session (handler drops foreign ones, but wire + parse remain),
   `tui.prompt.append`/`tui.command.execute` (client-injected, always global),
   plus the config/catalog family. Low rate; acceptable.
5. **Dialog running-badge staleness**: `store.session.active` hydrates
   globally at `server.connected` but updates live only for admitted sessions,
   so a foreign-project session's badge can go stale while its dialog is open.
   Pre-existing controlled-mode behavior; worth a release note, not a fix.
6. **Legacy fallback is the firehose**: on old servers the TUI silently
   returns to global delivery (mode is observable — `interest.mode()` — but
   nothing in the UI surfaces it).
7. **Nothing prevents a future in-process `api.event.subscribe`/rpc-events
   call from silently reopening the global feed** (SharedEvents is lazy and
   refcounted, not interest-aware).
8. **Hidden tabs and subagents are correctly covered**: every open tab's
   root+family is followed regardless of visibility, so hidden-tab badges,
   subagent sounds (`subagent_done`), and pending-inbox badges keep working —
   verified policy shape, exercised by the interest tests per verification0.
   Tightening attention to "visible only" would break these; any tighter
   predicate must retain the family-of-open-tabs dimension.

## Recommendations for draft1

### Scope

1. **Keep the controlled transport and policy as implemented.** Do not widen
   or narrow the interest vocabulary in draft1.
2. **Add the projection guard (shape (a))** for detail-class session events of
   untracked sessions, with review0's regression test (flood an unknown
   session: no HTTP reads, no store materialization; tracked sessions and
   optimistic creates unaffected). This is the TUI-scope answer to the
   same-project issue and removes the largest remaining per-event CPU cost
   without any wire change. Default-safe: it changes no user-visible surface
   (detail events for untracked sessions are already semantically dropped
   after the store write).
3. **Make the attention predicate explicit** in the notifications plugin
   (see below) so transport scope and product attention stop being the same
   accidental line of code.
4. **Delegate same-project wire reduction (shape (b)) to the server-side
   draft1 work** as an option with concrete input: the tier split in the
   table above, the constraint that permission/form must stay Location-
   admitted, and the TUI's willingness to declare `{route, tabs, family}`
   sessions as `detail` and everything else Location-borne as `summary`.
   Do not implement (b) from the TUI side in draft1.
5. Leave (c), dialog staleness (#5), and app/CLI conversion explicitly out.

### Notification product choice — recommendation with safe default

No user approval of attention loss has been given; nothing below claims it.

- **Default (recommended): Location/project attention, made explicit.** Keep
  exactly today's implemented behavior — notify for any session Bus routes to
  a held Location (own tabs/families, plus same-project foreign sessions) —
  but move the decision into a named predicate in the notifications plugin so
  it survives legacy fallback unchanged and is auditable. Same-project foreign
  notifications are arguably correct: another client's agent finishing in
  this project is information this terminal's user chose to enter.
- **Opt-in tightening (recommended as an experiment): tracked-family
  attention.** Same predicate, plus `sessionID ∈ followed families ∪ {global}`
  gating. Loses same-project foreign notifications (their owning client still
  notifies) and keeps tabs/subagents/Home global forms. Ship behind the
  TUI experiments registry (`dialog-experiments.tsx` + `config.experimental`
  per package AGENTS), not as a silent default.
- **Server-wide attention stays open** as the third draft0 option; requires
  the aggregate event (c) and is not part of the TUI decision.

The release-gate resolution draft1 should record: default = Location scope
with the explicit predicate; family scope available behind an experiment;
server-wide deferred. Final sign-off remains the user's.

## Open questions

- What does `dialog-open.tsx:50`'s `client.event.listen` do with non-session
  events (does any dialog rely on live detail-class updates)?
- Does `tabs.tabs()` (consumed by `eventInterest`) return exactly the
  active-scope tab set, including `tabs.scope: "global"` cross-project tabs?
  (Intent per research0 S18; accessor not re-verified.)
- Which `session.*` definitions are durable vs ephemeral was not re-derived
  per-item; the detail/summary split here is by consumer function, which is
  the split draft1 needs, but a tier enum on the wire would need the
  durability flags checked.
- Does the footer's "other running sessions" count
  ([prompt/footer.tsx:24](/packages/tui/src/feature-plugins/prompt/footer.tsx#L24))
  iterate family members only, or a broader set? Affects nothing in the
  recommendations but should be pinned before tightening attention.
- Measurement: no live numbers exist yet for how much same-project foreign
  streaming costs (verification0's live gate). The projection guard's payoff
  and the case for shape (b) both hang on it.
- CLI consumer line numbers (noninteractive, ACP) are cited from review0 and
  not re-verified this session.

## Cross-references

- [Draft0](/.design/bus-smart/draft0.gpt56s.md) — §"Notification scope:
  release gate" and Open item 1 are what this document resolves into a
  recommendation; §"Known residual overdelivery" anticipated the
  persistent-PTY global case verified here.
- [TUI interest research 0](/.design/bus-smart/research-tui-interest0.glm53.md) —
  the S1-S18 trigger map and the "interest is the notification scope" note;
  this document confirms its family/unread/readership predictions against the
  implemented policy and adds the consumer-class analysis it lacked.
- [Review0](/.design/bus-smart/review0.gpt56s.md) — finding 5 ("the hottest
  client work is understated") and the recommended first patch; this document
  verifies the projection costs remain unguarded post-transport-work and
  carries the recommendation into draft1 scope.
- [Verification0](/.design/bus-smart/verification0.gpt56s.md) — implementation
  and port state; source for the SharedEvents-wrapper drift and the two open
  release gates this document addresses.
- [Controlled feed client](/packages/client/src/solid/controlled-event-feed.ts)
  and [event interest policy](/packages/tui/src/context/event-interest.tsx) —
  the implemented surfaces this research measured against.
