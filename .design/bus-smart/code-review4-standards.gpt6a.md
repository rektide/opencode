---
type: CodeReview
title: Bus-smart narrow standards closure
description: Final verification of declared-absence retry termination and the three localized correction seams.
resource: /.design/bus-smart/code-review4-standards.gpt6a.md
status: draft
generated: { by: "openai/gpt-6-astra#xhigh", at: 2026-09-05 }
review_range: { from: 55005115, to: 5a253fbd }
runtime_tip: e497e886
sources:
  - resource: /.design/bus-smart/code-review3-standards.gpt6a.md
  - resource: /.design/bus-smart/implementation-review-fixes3.gpt6a.md
  - resource: /packages/client/src/solid/data.ts
---

# Narrow closure outcome

**Review3’s declared-absence P2 is closed.** This review covers only the pinned three-seam correction; earlier standards findings remain closed. No counterpart review4 was consulted.

## Confirmed behavior

[`packages/client/src/solid/data.ts:1714–1726`](/packages/client/src/solid/data.ts#L1714-L1726) handles generated `SessionNotFoundError` before automatic scheduling: it clears the current observation’s repair obligation/backoff, keeps the cache incomplete, and rethrows the original error. It neither deletes cached rows nor creates a permanent absent-ID marker.

Independently executed tests through `OpenCode.make` and the actual generated response decoder confirm:

- Both message-page and retained-boundary-probe absence produce **one failed request**, with no additional automatic requests during the 180-ms observation window.
- Subsequent explicit synchronization and reconnect each permit another attempt; later successful reads recover without provider replacement. Existing rows remain visible.
- Arbitrary HTTP 404 and Transport errors still retry and recover. Historical `MessageNotFoundError` still advances the surviving-anchor search.

## Direct carry/cleanup check

No new material findings or documented-rule violations in these changes. The acknowledgment pass at [1681–1689](/packages/client/src/solid/data.ts#L1681-L1689) uses the existing accepted-scan boundary, adds no request, and preserves unconfirmed-input rollback. The point-read guard at [688–700](/packages/client/src/solid/data.ts#L688-L700) uses live row identity plus disposal, preserving healthy hydration across index rebuilding without another registry or epoch map.

## Verification and verdict

**18 focused browser-conditioned Client tests passed**, including explicit retry/reconnect, transient errors, historical probes, canonical acknowledgment negatives, and point-read lifetime controls. Client `bun typecheck` passed. No production edits, children, or live-service operations.

**Standards/carry closure approved for this correction range**, conditional on the existing default-off acceptance gates. The fixes remain local to the Client owner; no new public dependency surface or broader abstraction is warranted. This is not experiment graduation or a new performance claim.

## Sources

- [Review3 standards finding](/.design/bus-smart/code-review3-standards.gpt6a.md): the precise retry-loop regression closed here.
- [Localized correction report](/.design/bus-smart/implementation-review-fixes3.gpt6a.md): scope and claims checked against the diff and executed tests.
- [`solid-transcript.test.ts`](/packages/client/test/solid-transcript.test.ts) and [`solid-transcript-mutations.test.ts`](/packages/client/test/solid-transcript-mutations.test.ts): focused generated-client regression fixtures.
- Pinned command: `jj diff --from 55005115 --to 5a253fbd --git`.
