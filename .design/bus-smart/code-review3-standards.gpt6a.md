---
type: CodeReview
title: Bus-smart persistent-repair standards and carry review
description: Independent assessment of repair ownership, exhaustive mutation classification, cleanup, and unconditional Client carry cost.
resource: /.design/bus-smart/code-review3-standards.gpt6a.md
status: draft
generated: { by: "openai/gpt-6-astra#xhigh", at: 2026-09-05 }
review_range: { from: 42ae8a07, to: a8435585 }
runtime_tip: 958b7a1c
sources:
  - resource: /.design/bus-smart/code-review2-standards.gpt6a.md
  - resource: /.design/bus-smart/code-review2-spec.gpt6a.md
  - resource: /.design/bus-smart/implementation-review-fixes2.gpt6a.md
  - resource: /AGENTS.md
  - resource: /CONTRIBUTING.md
  - resource: /packages/tui/AGENTS.md
---

# Standards and carry recheck

Reviewed the pinned correction and cumulative Client footprint from `d37d1b99`; no counterpart review3 consulted.

## Closure

Original held-create P2 and centralized-adoption P3 remain closed. Both preserved review2 counterexamples now pass independently. [`data.ts:1690–1693`](/packages/client/src/solid/data.ts#L1690-L1693) clears duty only at successful publication; [`2064–2119`](/packages/client/src/solid/data.ts#L2064-L2119) includes Skill and exhaustively classifies all 43 generated durable Session events. Direct terminal-field additions match Core’s updater rather than relying on another content-replacement event.

## New material finding

**P2 — Definitive missing Sessions retain an automatic repair loop.** [`packages/client/src/solid/data.ts:1700–1712`](/packages/client/src/solid/data.ts#L1700-L1712) reschedules after every rejection, including declared `SessionNotFoundError`. A Session deleted while disconnected supplies no replayed deletion event to revoke ownership. Reconnect [603–608](/packages/client/src/solid/data.ts#L603-L608) establishes duty anyway; each unsuccessful read then emits another handled error and schedules again.

**Reproduced with the generated client:** hydrate, disconnect, make the message endpoint return declared Session-not-found, reconnect. Candidate: **five failed GETs within 180 ms**, gaps **10/20/40/80 ms**; `42ae8a07`: **one**. The inspected loop subsequently caps at one attempt per second per missing observation, indefinitely without eviction/disposal. This affects legacy/default-off clients too.

Treat declared Session absence as terminal for that repair episode rather than transient failure; stop its automatic rescheduling while allowing explicit adoption/reconnect to try again. Keep transient-failure backoff. Add the offline-deletion regression. This needs a narrow error-policy branch, not general pruning or another retry framework.

## Rules and carry verdict

No substantive hard documented-rule violations found. **Carryable after the terminal-error correction; not ready unchanged.** Persistent duty plus one timer/delay is justified by the no-later-event counterexample. Pending-job suppression bounds automatic observers; identity checks and eviction/delete/dispose/disconnect cleanup are appropriately local.

The exhaustive classifier improves upstream maintenance; extracting a generic framework would increase carry burden. The cumulative unconditional Client patch remains substantial, and probes/pages multiply each retry’s cost. Core, Protocol, Server, Schema, SharedEvents, and TUI production remain unchanged this round. Mixed-workload performance gates are separate from the reproduced error loop; no history restructuring requested.

## Independent verification

**84** focused Client tests, **2** preserved originating repros, **47** TUI policy/binding/tab tests, and **2** footer cases passed; Client/TUI typechecks passed. Production read-only; no children or live-service work.

## Sources

- [Previous standards recheck](/.design/bus-smart/code-review2-standards.gpt6a.md): original closure and carry baseline.
- [Originating spec recheck](/.design/bus-smart/code-review2-spec.gpt6a.md) and [correction report](/.design/bus-smart/implementation-review-fixes2.gpt6a.md): the two reproduced defects, audit, claimed bounds, and limits.
- [`SessionNotFoundError`](/packages/protocol/src/errors.ts#L103-L110): the declared terminal absence response used in the isolated comparison, not an arbitrary transport 404.
- [`Core terminal snapshot/text projection`](/packages/core/src/session/message-updater.ts#L22-L28), [`text settlement`](/packages/core/src/session/message-updater.ts#L273-L280): direct-field comparison.
- [`/AGENTS.md`](/AGENTS.md), [`/CONTRIBUTING.md`](/CONTRIBUTING.md), [`/packages/tui/AGENTS.md`](/packages/tui/AGENTS.md), and supplied `/home/rektide/src/rekon/AGENTS.md`: applicable standards.
- Pinned diff: `jj diff --from 42ae8a07 --to a8435585 --git`. The missing-Session comparison used an in-memory Bun loader for baseline source, generated Promise clients, reactive connection status, and an injected HTTP response; disposal stopped all later requests.
