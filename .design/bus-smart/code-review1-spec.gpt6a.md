---
type: CodeReview
title: Bus-smart draft1 independent spec and correctness review
description: Three reproduced read-repair defects against the pinned runtime candidate; production unchanged.
resource: /.design/bus-smart/code-review1-spec.gpt6a.md
status: draft
generated: { by: "openai/gpt-6-astra#xhigh", at: 2026-09-05 }
stale_after: 2026-10-05
review_range: "d37d1b99 -> bb625dec"
reviewer_note: GX could not complete because of its provider cap; Astra performed this independent review without child agents or the counterpart standards report.
sources:
  - resource: /.design/bus-smart/draft1.gpt6a.md
  - resource: /.design/bus-smart/implementation1.gpt6a.md
  - resource: /.design/bus-smart/implementation-report1.gpt6a.md
  - resource: /.test-agent/bus-smart/spec-review1-gpt6a/README.md
    title: Ignored local reproduction commands and outcomes
---

# Findings

## Implemented incorrectly

1. **P2 — Dirty-read repair is unbounded, including for metadata.** Spec: “do not spin until a snapshot matches a continuously mutating Session” ([implementation1:353–354](/.design/bus-smart/implementation1.gpt6a.md#L353-L354)). [data.ts:1931–1938](/packages/client/src/solid/data.ts#L1931-L1938) increments transcript versions for every durable Session event; [1584–1600](/packages/client/src/solid/data.ts#L1584-L1600) immediately retries every mismatch. Ten `session.viewed` events overlapping successive GETs cause **eleven GETs**, despite unchanged transcript data. Continued overlap prevents completion indefinitely. Restrict invalidation to transcript-affecting events and bound/coalesce retries across durable activity rather than repeatedly seeking a quiet snapshot.

2. **P2 — Reconnect repair loses previously loaded history after offline growth.** Spec: “Preserve optimistic local admissions, message indexes and already-loaded pagination” ([implementation1:350–352](/.design/bus-smart/implementation1.gpt6a.md#L350-L352)). [data.ts:1586–1616](/packages/client/src/solid/data.ts#L1586-L1616) preserves only the old **row count**, not its historical boundary. Load messages 1–40, miss 20 additions while disconnected, then invalidate/read: repair replaces the cache with 21–60, discarding 1–20 and regressing the exhausted cursor. Read through the retained oldest boundary, with explicit deletion/revert handling. The existing pagination oracle uses unchanged membership ([test:143–159](/packages/client/test/solid-transcript.test.ts#L143-L159)), so cannot detect this loss.

## Supporting repair remains partial

3. **P2 — Pending hydration can resurrect committed-revert input.** Spec: “Before reconcile, discard superseded results” ([implementation1:343](/.design/bus-smart/implementation1.gpt6a.md#L343)). Start inbox GET; receive `session.revert.committed`; release its pre-revert response. [data.ts:1933–1935](/packages/client/src/solid/data.ts#L1933-L1935) omits revert from pending invalidators, so [1364–1385](/packages/client/src/solid/data.ts#L1364-L1385) restores the deleted input into both pending and transcript. Core explicitly deletes affected inbox rows without cancellation events ([projector.ts:739–747](/packages/core/src/session/projector.ts#L739-L747)). Dirty the active pending read on this mutation and add its late-response fixture. This is an uncovered pre-existing race, not a newly introduced revert regression.

## Verification and limits

All three isolated production-data/generated-client reproductions fail their contract assertions; [README](/.test-agent/bus-smart/spec-review1-gpt6a/README.md) records the package-local browser-conditioned command. They affect legacy operation too. Full pinned diff and surrounding logic reviewed; no additional concrete profile/index/controller/TUI defect established. No production edits or live-service testing. No quiet platform expansion identified. Default-off performance, overload and remaining lifecycle matrix gates are explicitly acknowledged in [the execution report:226–246](/.design/bus-smart/implementation-report1.gpt6a.md#L226-L246), not surprise bugs or evidence of graduation.
