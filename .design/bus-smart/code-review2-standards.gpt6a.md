---
type: CodeReview
title: Bus-smart standards and upstream-carry correction recheck
description: Independent closure verification of the original standards findings and assessment of the expanded Client repair seam.
resource: /.design/bus-smart/code-review2-standards.gpt6a.md
status: draft
generated: { by: "openai/gpt-6-astra#xhigh", at: 2026-09-05 }
review_range: { from: 4396b563, to: 70123449 }
runtime_tip: 639fff48
sources:
  - resource: /.design/bus-smart/code-review1-standards.gpt6a.md
  - resource: /.design/bus-smart/implementation-review-fixes1.gpt6a.md
  - resource: /AGENTS.md
  - resource: /CONTRIBUTING.md
  - resource: /packages/tui/AGENTS.md
---

# Standards correction recheck

Reviewed the pinned correction diff and the cumulative Client/TUI changes from `d37d1b99`. No counterpart recheck was consulted.

## Original findings

- **P2 closed — optimistic-create ownership.** [`packages/client/src/solid/data.ts:1587–1594`](/packages/client/src/solid/data.ts#L1587-L1594) registers explicit observation before consulting the real `creating` owner. Independently reran the original held-POST experiment, including invalidation: **zero premature message GETs**, then one GET after successful creation. The abandoned `session.message:*` bookkeeping is gone. Registration occurs only in `message.sync`; eviction/deletion remove it. [1450–1456](/packages/client/src/solid/data.ts#L1450-L1456) resumes coalesced terminal repair after the creation gate clears, with executed tests covering terminal events on both sides of settlement and failed creation.
- **P3 closed — duplicated adoption policy.** [`packages/tui/src/context/event-interest-binding.ts:41–53`](/packages/tui/src/context/event-interest-binding.ts#L41-L53) now owns barrier, filtered invalidation, and synchronization. Both [`rows.ts:100–104`](/packages/tui/src/routes/session/rows.ts#L100-L104) and [`session-tabs.tsx:307–310`](/packages/tui/src/context/session-tabs.tsx#L307-L310) delegate while retaining caller-specific cancellation/membership. The two-method `Pick` dependency is proportionate actual reuse, not a new framework.

## New findings

**No new material standards/carryability findings or hard documented-rule violations found.** The footer fixture change preserves the same-length index-shift oracle through canonical deletion and separately tests retained history; it does not merely relax expectations. Empty-page exhaustion agrees with [`server/src/handlers/message.ts:57–59`](/packages/server/src/handlers/message.ts#L57-L59).

## Upstream-carry verdict

**Reasonably carryable as a default-off candidate; both original findings are resolved.** The unconditional Client repair remains the largest maintenance burden: creation, pagination, eviction, and settlement share one existing read owner. Its additional `loaded`/`repair` state and boundary probes address demonstrated failures without expanding Protocol, Server, Core, or SharedEvents.

[`data.ts:2027–2065`](/packages/client/src/solid/data.ts#L2027-L2065)'s explicit mutation classifier must track future upstream transcript events. That is a real carry obligation, but preferable here to refactoring every upstream projection handler or introducing a generic replay/repair framework. Read-amplification and acceptance stress gaps remain release gates, not newly proven runtime errors. No history restructuring is requested.

## Independent verification

Client browser-conditioned controller/connection/transcript suites: **51 pass**. TUI binding/policy/tab suites: **47 pass**; both changed footer renderer cases: **2 pass**. Client and TUI package typechecks passed. No production edits, child agents, or live-service operations.

## Sources

- [Original standards review](/.design/bus-smart/code-review1-standards.gpt6a.md): the two findings rechecked here.
- [Correction implementation report](/.design/bus-smart/implementation-review-fixes1.gpt6a.md): claimed fixes, costs, and broader verification; independently checked against production code and focused tests above.
- [`/AGENTS.md`](/AGENTS.md), [`/CONTRIBUTING.md`](/CONTRIBUTING.md), [`/packages/tui/AGENTS.md`](/packages/tui/AGENTS.md), and supplied `/home/rektide/src/rekon/AGENTS.md`: applicable standards.
- Pinned command: `jj diff --from 4396b563 --to 70123449 --git`; cumulative ownership review: `jj diff --from d37d1b99 --to 70123449 --git packages/client/src/solid/data.ts`.
