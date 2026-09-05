---
type: CodeReview
title: Bus-smart independent standards and upstream-carry review
description: Astra review of the pinned runtime diff, separating documented rules from maintainability judgments.
resource: /.design/bus-smart/code-review1-standards.gpt6a.md
status: draft
generated: { by: "openai/gpt-6-astra#xhigh", at: 2026-09-05 }
sources:
  - resource: /AGENTS.md
  - resource: /CONTRIBUTING.md
  - resource: /packages/tui/AGENTS.md
  - resource: /.design/bus-smart/implementation-report1.gpt6a.md
review_range: { from: d37d1b99, to: bb625dec }
---

# Standards and upstream carryability

GX could not complete because its provider was quota-capped. Astra independently read the full pinned diff and relevant surrounding implementation; no counterpart review was consulted.

## Hard documented-rule violations

None substantive found. Dependency direction and the TUI experiment registry/gate conform to the applicable rules. Generated-client provenance is reported by the implementation record, not independently rerun here. Tooling-enforced trivia is excluded.

## Judgment findings

1. **P2 — Incomplete cache-ownership migration; possible Shotgun Surgery.** [`packages/client/src/solid/data.ts:1576–1580`](/packages/client/src/solid/data.ts#L1576-L1580) replaces message `createSync` ownership with `transcripts`, but creation still marks the abandoned `session.message:*` key complete at [632](/packages/client/src/solid/data.ts#L632) and [1430](/packages/client/src/solid/data.ts#L1430). Those upstream guards now do nothing. **Reproduced:** hold the creation POST, call `message.sync(created.id)`; the candidate sends a message GET while `creating()` remains true, whereas `d37d1b99` sends only the POST. This affects default/legacy behavior too and permits reads against a Session not yet created. Preserve the creation guard in the actual completion owner, without enrolling every foreign `session.created` in transcript repair; remove obsolete completion/invalidation bookkeeping and add this held-create regression test. Do not merely delete the old comments.

2. **P3 — Possible Duplicated Code / scattered adoption policy.** [`packages/tui/src/routes/session/rows.ts:100–105`](/packages/tui/src/routes/session/rows.ts#L100-L105) and [`packages/tui/src/context/session-tabs.tsx:307–310`](/packages/tui/src/context/session-tabs.tsx#L307-L310) both implement `flush → controlled-mode invalidation → message.sync`. The new binding owns the barrier, but readers still own its transport-dependent cache policy. Put that repeated sequence behind one TUI-owned transcript-adoption operation; retain reader-specific membership checks/cancellation at the callers. This is a carryability improvement, not a proven runtime failure.

## Carryability verdict

**Carryable with localized corrections, not ready unchanged.** Protocol negotiation and Server indexing stay narrow; Core and public SharedEvents are untouched. The principal carry risk is the unconditional Client cache-ownership change, not commit history. No history restructuring is requested.

## Verification

Independently reran the three browser-conditioned Client suites: **31 pass, 0 fail**. The held-create counterexample was exercised against candidate and baseline using an in-memory Bun loader; no production edits or live-service operations occurred. Broader verification remains the implementation report’s claims.

## Sources

- [`/AGENTS.md`](/AGENTS.md), [`/CONTRIBUTING.md`](/CONTRIBUTING.md), and [`/packages/tui/AGENTS.md`](/packages/tui/AGENTS.md): repository standards; supplied `/home/rektide/src/rekon/AGENTS.md` rules also applied.
- [`Implementation report`](/.design/bus-smart/implementation-report1.gpt6a.md): claimed verification and acknowledged release limits.
- [`Implementation plan`](/.design/bus-smart/implementation1.gpt6a.md): context for ownership and adoption seams, not the spec-review axis.
- Pinned commands: `jj diff --from d37d1b99 --to bb625dec --git`; `jj log --no-graph -r 'd37d1b99..bb625dec'`.
