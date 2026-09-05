---
type: CodeReview
title: Bus-smart persistent repair recheck — spec and correctness
description: Previous findings close and trailing scheduling checks pass; two adjacent acknowledgment/lifetime gaps remain.
resource: /.design/bus-smart/code-review3-spec.gpt6a.md
status: draft
generated: { by: "openai/gpt-6-astra#xhigh", at: 2026-09-05 }
stale_after: 2026-10-05
review_range: "42ae8a07 -> a8435585"
runtime_tip: "958b7a1c"
sources:
  - resource: /.design/bus-smart/draft1.gpt6a.md
  - resource: /.design/bus-smart/implementation1.gpt6a.md
  - resource: /.design/bus-smart/code-review2-spec.gpt6a.md
  - resource: /.design/bus-smart/implementation-review-fixes2.gpt6a.md
  - resource: /.test-agent/bus-smart/spec-review3-gpt6a/README.md
    title: Isolated reproduction commands and results
---

# Recheck outcome

**Review2 findings close.** Independently executed **89 passing tests**: all five preserved reviewer reproductions plus 84 browser-conditioned Client tests. The full pinned diff, direct handlers and Core canonical counterparts were reviewed. Two adjacent pre-existing seams remain incorrect; these are not regressions introduced by the backoff implementation.

## Remaining supporting-seam defects

1. **P2 — Successful canonical hydration does not acknowledge an optimistic input.** Spec requires “eventual canonical state … after relevant durable activity settles and a fresh read succeeds” ([implementation1:356–357](/.design/bus-smart/implementation1.gpt6a.md#L356-L357)). Start an optimistic prompt POST; miss its enqueue across disconnect; observe delivery. The new outbox-aware classifier correctly repairs the row, but [data.ts:1675–1696](/packages/client/src/solid/data.ts#L1675-L1696) leaves its outbox marker intact. A later POST transport failure invokes [1566–1569](/packages/client/src/solid/data.ts#L1566-L1569), deleting the **already-confirmed canonical message**. The reproduction verifies canonical content before rejecting the POST, then observes an empty transcript. Acknowledge fetched canonical input IDs in the outbox before permitting later optimistic rollback; preserve canonical-payload reconciliation.

2. **P2 — Retained model-selection point hydration bypasses lifetime fencing.** Spec: “Eviction/delete cancel eligibility and reject late response resurrection” ([implementation1:350](/.design/bus-smart/implementation1.gpt6a.md#L350)). Load a transcript; receive `session.model.selected`; hold its single-message GET; evict/delete; release the response. [data.ts:687–695](/packages/client/src/solid/data.ts#L687-L695) unconditionally updates/appends the row, resurrecting cleared state. Disposal likewise permits late writes. This is the upstream point-read path explicitly retained by the audit, not the protected paginated scan. Fence its publication using existing row/observation ownership and disposal state; no new read framework is needed.

## Verified boundaries and qualifications

Persistent duty now survives discarded scans and HTTP errors; [data.ts:1690–1712](/packages/client/src/solid/data.ts#L1690-L1712) clears it only on current-version publication and schedules one exponentially delayed retry. Flood/slow-read tests establish one automatic observer; original jobs retain their two-scan bound. Timer cancellation, disconnect suspension and quiet trailing convergence pass. The 1,000 ms cap is source-verified; request cost still includes boundary probes/pages. All 43 durable categories are explicit, with Skill and unknown/optimistic delivery authoritative.

The four new [isolated assertions](/.test-agent/bus-smart/spec-review3-gpt6a/README.md) fail on actual state, not baseline Solid-proxy matchers. No production edits, live service, children or counterpart review3 read. Default-off performance/overload gates remain open; no graduation or live-workload acceptance follows.
