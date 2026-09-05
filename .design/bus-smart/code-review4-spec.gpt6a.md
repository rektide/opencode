---
type: CodeReview
title: Bus-smart narrow final spec closure
description: Review3 acknowledgment and point-read lifetime findings close; no direct new blocker found in the corrective range.
resource: /.design/bus-smart/code-review4-spec.gpt6a.md
status: draft
generated: { by: "openai/gpt-6-astra#xhigh", at: 2026-09-05 }
stale_after: 2026-10-05
review_range: "55005115 -> 5a253fbd"
runtime_tip: "e497e886"
sources:
  - resource: /.design/bus-smart/code-review3-spec.gpt6a.md
  - resource: /.design/bus-smart/implementation-review-fixes3.gpt6a.md
  - resource: /packages/client/src/solid/data.ts
  - resource: /packages/client/test/solid-transcript-mutations.test.ts
  - resource: /packages/client/test/solid-transcript.test.ts
  - resource: /.test-agent/bus-smart/spec-review3-gpt6a/reproduction.test.ts
---

# Narrow closure outcome

**Both review3 spec findings are closed. No direct new blocker found in the requested corrective range.** Review stayed within the three changed seams and their regressions.

- **Canonical input acknowledgment — closed.** [data.ts:1676–1688](/packages/client/src/solid/data.ts#L1676-L1688) acknowledges matching local user/synthetic inputs only after the scan's identity/version checks. Preserved reproduction now retains the confirmed canonical message when its original POST fails. Executed [positive and negative tests:425–549](/packages/client/test/solid-transcript-mutations.test.ts#L425-L549) also verify canonical payload precedence, observable POST rejection, unconfirmed rollback after absent/failed/superseded reads, and another Session's read not acknowledging this input.

- **Model-selection point-read lifetime — closed.** [data.ts:688–700](/packages/client/src/solid/data.ts#L688-L700) captures the original row object, checks disposal/current identity, and never recreates an absent target. All preserved eviction/deletion/disposal cases pass. The [six-case matrix:364–423](/packages/client/test/solid-transcript-mutations.test.ts#L364-L423) additionally passes same-ID recreation and healthy current/load-more enrichment; index rebuilding does not invalidate a still-owned row.

- **Declared absence — narrow regression check passed.** [data.ts:1714–1721](/packages/client/src/solid/data.ts#L1714-L1721) ends the matching automatic episode on decoded `SessionNotFoundError`, rethrowing it without pruning/completing the cache. [Executed tests:532–618](/packages/client/test/solid-transcript.test.ts#L532-L618) cover page/probe absence, later explicit/reconnect retry, and transient arbitrary-404/transport recovery.

## Actual verification and limits

From `packages/client`, ran `bun test --conditions=browser` across all three preserved reviewer scratch suites and the transcript, transcript-mutation, controlled-feed and connection package suites: **109 pass, 0 fail, 0 skip**, seven files (Bun 1.4.1). This includes all **nine** earlier reviewer cases unchanged.

No production edits, new broad audit, child agents, counterpart review4 access or live-service operations. This closes the specified findings—not broader performance/overload gates or live-workload acceptance. The experiment remains default off; no graduation claim.
