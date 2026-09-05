---
type: CodeReview
title: Bus-smart correction recheck — spec and correctness
description: Original reproductions close, but two additional canonical-repair failures are reproduced.
resource: /.design/bus-smart/code-review2-spec.gpt6a.md
status: draft
generated: { by: "openai/gpt-6-astra#xhigh", at: 2026-09-05 }
stale_after: 2026-10-05
review_range: "4396b563 -> 70123449"
runtime_tip: "639fff48"
sources:
  - resource: /.design/bus-smart/draft1.gpt6a.md
  - resource: /.design/bus-smart/implementation1.gpt6a.md
  - resource: /.design/bus-smart/code-review1-spec.gpt6a.md
  - resource: /.design/bus-smart/implementation-review-fixes1.gpt6a.md
  - resource: /.test-agent/bus-smart/spec-review2-gpt6a/README.md
    title: Independent ignored reproductions and executed verification
---

# Recheck outcome

**Original reproductions close; two P2 correctness blockers remain.** Independently executed: preserved original repros **3 pass**, focused Client suites **51 pass**, TUI policy/binding/tab suites **47 pass**. Reviewed the pinned diff and surrounding implementation, not merely the correction report.

## New reproduced failures

1. **P2 — Starting scan two consumes an unfulfilled terminal repair.** Spec: “After incomplete Step failure/interruption, reconcile explicitly observed transcripts from authoritative history” ([implementation1:346–347](/.design/bus-smart/implementation1.gpt6a.md#L346-L347)). During scan one, deliver Step/execution failure; during scan two, enqueue an admit-only prompt. [data.ts:1601](/packages/client/src/solid/data.ts#L1601) clears `repair` at each attempt, then [1648](/packages/client/src/solid/data.ts#L1648) discards the second result. Enqueue is only an `update`, so [1674–1677](/packages/client/src/solid/data.ts#L1674-L1677) schedules nothing. After activity stops, the completed failed assistant permanently retains its ephemeral suffix instead of canonical empty text. Preserve the outstanding terminal-repair obligation across a discarded retry, with bounded scheduling—not a restored spin loop. Existing [tests:584–624](/packages/client/test/solid-transcript.test.ts#L584-L624) put the terminal last; add **terminal-first/update-last** coverage.

2. **P2 — Mutation classification omits durable Skill rows.** Spec: “Relevant observed durable transcript mutations … invalidate it” ([implementation1:341–342](/.design/bus-smart/implementation1.gpt6a.md#L341-L342)). Hold a pre-activation transcript GET; receive `session.skill.activated`; release the old response. [data.ts:2027–2063](/packages/client/src/solid/data.ts#L2027-L2063) ignores this event, although [Core updater:154–165](/packages/core/src/session/message-updater.ts#L154-L165) appends a canonical Skill row. The empty response becomes complete with no repair. [Skill activation with `resume: false`](/packages/core/src/session/session.ts#L240-L253) legitimately emits no later execution terminal. Classify activation as a transcript mutation and ensure observed caches receive its row or authoritative repair, including already-complete caches.

## Closure and limits

Metadata exclusion, historical-boundary preservation and committed-revert fencing fix their original counterexamples. Exhausted-history scans, deleted-anchor probes and cursor-only continuation have meaningful regression coverage; their additional HTTP cost remains explicit. Two scans bound **one job**, not lifetime work under new terminal events. Optimistic-create gating and centralized adoption tests pass.

Both new [isolated reproductions](/.test-agent/bus-smart/spec-review2-gpt6a/README.md) fail canonical-state assertions, not the known baseline Solid-proxy assertions. Production unchanged; no live service, child agents or counterpart review2 read. No experiment graduation or live-workload acceptance: broader performance/overload gates remain open.
