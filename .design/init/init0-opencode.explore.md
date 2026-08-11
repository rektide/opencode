---
type: Research
title: OpenCode V2 quiescence observability
description: Assessment of whether an external client can prove that OpenCode has no remaining session, subagent, or background work.
tags: [opencode, sessions, subagents, quiescence, shutdown]
status: draft
generated: { by: ai:explore, at: 2026-08-11 }
verified: { by: ai:gpt5, at: 2026-08-11 }
stale_after: 2026-11-11
sources:
  - id: v2-api
    resource: https://opencode.ai/v2/docs/api
    title: OpenCode V2 API
  - id: v2-client
    resource: https://opencode.ai/v2/docs/build/client
    title: OpenCode V2 client guide
---

# OpenCode V2 Quiescence Observability

## Question

Can an external TypeScript CLI become certain that one OpenCode V2 server has
no running sessions, subagents, queued work, background shells, or other work
before it powers off the host?

## Verdict

No current public API can prove global quiescence. The public API can support a
conservative, continuously reconciled estimate, but a truthful certainty claim
requires a new server-global activity barrier.

The limitation is deeper than a missing convenience endpoint:

- Session execution, durable inboxes, process-local jobs, location-owned
  shells, PTYs, and human requests have different owners.
- The global event stream is explicitly volatile and cannot repair gaps.
- Several snapshots are location- or session-scoped and cannot be read
  atomically.
- The process-local Job registry, which owns background subagents and shell
  tools, has no public HTTP surface.
- A new admission can race the last zero snapshot.
- One managed server cannot inventory standalone, remote, or other-channel
  OpenCode processes on the host.

## Public Surface

### Active sessions

`GET /api/session/active` is the strongest existing snapshot. Its contract is
deliberately narrow: it returns foreground Session drains currently owned by
the serving process, and an absent Session is inactive for that process
([`packages/protocol/src/groups/session.ts:198-206`](/packages/protocol/src/groups/session.ts#L198-L206)).
The handler directly snapshots `SessionExecution.active`
([`packages/server/src/handlers/session.ts:157-164`](/packages/server/src/handlers/session.ts#L157-L164)).

Child subagents execute as ordinary Sessions, so they appear while their child
drain is active. This does not cover durable queued inputs, process-local Jobs,
or non-Session operations. `POST /api/session/:id/wait` has the same per-Session
execution boundary ([`packages/protocol/src/groups/session.ts:445-456`](/packages/protocol/src/groups/session.ts#L445-L456)).

### Durable pending work

Prompt admission and execution wake are separate operations. An input may be
durably admitted without an active drain, especially when `resume: false` is
used. `GET /api/session/:id/pending` is the authority for unconsumed user and
synthetic inputs and compaction barriers
([`packages/protocol/src/groups/session.ts:509-519`](/packages/protocol/src/groups/session.ts#L509-L519)).

There is no global pending count. A client must first paginate all Sessions and
then query each Session, which is expensive and non-atomic.

### Subagents and Jobs

The subagent tool creates a child Session with `parentID`, starts a process-local
Job keyed by that child ID, and may background it
([`packages/core/src/tool/plugin/subagent.ts:168-225`](/packages/core/src/tool/plugin/subagent.ts#L168-L225)).
`parentID` alone is not a subagent-kind discriminator because other child and
fork relationships use the same Session model.

The Job registry is the decisive visibility gap. It is intentionally
process-local and non-durable, and restart loses its live status
([`packages/core/src/job.ts:129-138`](/packages/core/src/job.ts#L129-L138)).
Internally it can list, wait, background, and cancel work
([`packages/core/src/job.ts:91-100`](/packages/core/src/job.ts#L91-L100)), but
there is no Job HTTP group or generated client method.

There is also a handoff race: a background Job can settle after its child
Session leaves the active set but before the completion-notification fiber
admits a synthetic input to the parent. Public snapshots can briefly look idle
in that interval
([`packages/core/src/tool/plugin/subagent.ts:86-110`](/packages/core/src/tool/plugin/subagent.ts#L86-L110)).

### Shells and PTYs

`GET /api/shell` lists running commands for one Location
([`packages/protocol/src/groups/shell.ts:13-26`](/packages/protocol/src/groups/shell.ts#L13-L26)).
Shell state is Location-owned, and exited commands are excluded from `list()`
([`packages/core/src/shell.ts:40-63`](/packages/core/src/shell.ts#L40-L63),
[`packages/core/src/shell.ts:124-128`](/packages/core/src/shell.ts#L124-L128)).

`GET /api/debug/location` can enumerate loaded Locations
([`packages/protocol/src/groups/debug.ts:6-16`](/packages/protocol/src/groups/debug.ts#L6-L16)),
but the Location list and per-Location shell lists are not one snapshot. A
Location can load between calls. Direct Session shell commands are another
reason an empty Session active map is insufficient: they wait outside the
Session drain while a Location shell runs
([`packages/core/src/session.ts:650-695`](/packages/core/src/session.ts#L650-L695)).

PTYs are independently running processes and need an explicit product policy.
If they gate poweroff, they have the same per-Location enumeration problem
([`packages/protocol/src/groups/pty.ts:21-49`](/packages/protocol/src/groups/pty.ts#L21-L49)).

### Human waits

Permission, question, and form requests have list endpoints:

- [`packages/protocol/src/groups/permission.ts:23-35`](/packages/protocol/src/groups/permission.ts#L23-L35)
- [`packages/protocol/src/groups/question.ts:20-49`](/packages/protocol/src/groups/question.ts#L20-L49)
- [`packages/protocol/src/groups/form.ts:24-65`](/packages/protocol/src/groups/form.ts#L24-L65)

These are useful blockers, but some are in-memory Location services rather than
one durable global queue. They should be counted separately in diagnostics even
when an associated Session drain is also active.

## Event Semantics

The global SSE route is advisory. Its contract says disconnected consumers
miss events and slow consumers overflow
([`packages/protocol/src/groups/event.ts:34-42`](/packages/protocol/src/groups/event.ts#L34-L42)).
The server uses a dropping queue with capacity 4,096 for each subscriber
([`packages/server/src/event-feed.ts:8-13`](/packages/server/src/event-feed.ts#L8-L13),
[`packages/server/src/event-feed.ts:66-81`](/packages/server/src/event-feed.ts#L66-L81)).

The handler attaches the subscriber before emitting `server.connected`, so a
client can use that event as a subscribe-before-snapshot marker
([`packages/server/src/handlers/event.ts:14-24`](/packages/server/src/handlers/event.ts#L14-L24)).
There is no resumable global cursor. Every disconnect, overflow, server restart,
or decode failure must invalidate derived state and force fresh reconciliation.

Per-Session durable logs are stronger and expose a synchronization marker, but
they still do not cover Jobs or provide a global barrier. See
[`packages/protocol/src/groups/session.ts:628-644`](/packages/protocol/src/groups/session.ts#L628-L644).

## Best-Effort Public-API Algorithm

This algorithm can establish only **observed quiescence under one selected
server's public API**:

1. Discover an already-running managed service. Do not use an ensure operation
   that may start a new empty server.
2. Open `client.event.subscribe()` and wait for `server.connected`.
3. Buffer relevant subsequent events; invalidate the attempt on stream failure
   or disconnect.
4. Paginate every Session and fetch each Session's pending inputs and request
   state.
5. Fetch `session.active()`.
6. Enumerate loaded Locations, then query running shells, PTYs, and request
   lists for each Location.
7. Enumerate loaded Locations again and restart the round if the set changed.
8. Repeat until two full rounds agree and no relevant buffered event occurred
   between their boundaries.
9. Continue periodic authoritative snapshots throughout the holdoff. Any
   unknown response or server instance change means busy, never zero.

This crawl still cannot observe the Job registry or close the final admission
race. It is appropriate for an explicitly experimental v0, not a certainty
claim.

## Required Server Enhancement

A useful first increment is one aggregate read model:

```ts
type ActivitySnapshot = {
  instanceID: string
  generation: number
  observedAt: string
  accepting: boolean
  counts: {
    sessionExecutions: number
    pendingInputs: number
    jobs: number
    shells: number
    ptys: number
    permissions: number
    questions: number
    forms: number
    completionNotifications: number
    total: number
  }
}
```

This makes polling bounded and diagnostics honest, but it is not sufficient for
certainty. A true barrier needs a server-global activity registry and an atomic
fence or lease that:

1. Stops or rejects new admissions for the selected server instance.
2. Covers Session drains and doorbells, durable inboxes, Jobs, completion
   notification fibers, shells, PTYs, human waits, transient generation, and
   plugin-owned registered fibers.
3. Waits until every registered blocker reaches zero.
4. Returns an instance-bound lease token that remains valid until explicitly
   released or the server exits.

Exposing `GET /api/job` alone improves visibility but does not eliminate races
between independently owned subsystems or new admissions after the final read.

## References

- [OpenCode V2 API](https://opencode.ai/v2/docs/api)
- [OpenCode V2 client guide](https://opencode.ai/v2/docs/build/client)
- [OpenCode V2 OpenAPI document](https://opencode.ai/v2/openapi.json)

## Cross-References

- [`/docs/design/service-lifecycle.md`](/docs/design/service-lifecycle.md)
  explains that active execution recovery and background Job continuity are
  intentionally outside current service lifecycle guarantees.
- [`/AGENTS.md`](/AGENTS.md) records the process-local Session execution and
  post-crash continuation constraints that make a server restart an unknown,
  not an all-clear observation.
