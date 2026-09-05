---
type: CodeReview
title: Ordered epilogue selector — parent and independent review
description: Review of the pure selector contract, coding standards and remaining verification limits before display integration.
resource: /.design/term-v2/selection-review0.gpt6a.md
tags: [epilogue, sessions, selection, review, termination]
status: draft
generated: { by: "model:gpt-6-astra", at: 2026-09-06 }
stale_after: 2026-10-06
extensions:
  ticket: rekon-session-mementos-display-selection
sources:
  - { resource: /.design/term-v2/selection-checkpoint0.gpt6a.md, title: Author checkpoint and focused verification }
  - { resource: "file:///home/rektide/src/rekon/design/session-mementos/checkpoint0.gpt6a.md", title: Authorized pure-selector contract }
  - { resource: "urn:opencode:session:ses_f86a1f42cffextF5dX4fG2ZbNn", title: Independent Standards review }
  - { resource: "urn:opencode:session:ses_f86a1f327ffeA18OO3139hvHOX", title: Independent Spec review }
---

# Review scope

Reviewed jj baseline `d78bdbf39eee` through executable revision
`1b1ff39bb787`, comprising initial kernel commit `aef3a916a5c6` and uniform
termination-authority follow-up `1b1ff39bb787`:

```sh
jj diff --git --from d78bdbf39eee --to 1b1ff39bb787 \
  packages/tui/src/epilogue/selection.ts \
  packages/tui/test/epilogue/selection.test.ts
```

The parent read the complete implementation, tests and author checkpoint.
Separate root-level reviewers independently assessed standards and specification;
neither read the other's review or reran the author's focused checks. This
completes the independent review unavailable at the implementation agent's depth.

## Standards

**0 documented-standard violations; 0 actionable heuristic findings.**

The reviewer found the domain grouping, explicit TypeScript imports, one-time
numeric-policy validation and small supporting operations consistent with
repository guidance. Generator loops and their mutable stage index serve actual
lazy iteration and termination; replacing them with eager array operations would
undermine the contract. Tests instrument the exported implementation rather than
reimplementing its policy. No speculative shared framework was introduced.

## Spec

**0 actionable findings within the authorized pure-selector slice.**

Current pinning and deduplication, running-first activity order, stable ID ties,
stage-local counting, inclusive activity cutoff and separate stop grants match
the specification. An unauthorized stop retains its ordinary keep/drop meaning.
An authorized final item rejected downstream still allows its terminating
predecessor to close rather than reading the tail. Zero limits honor their grant:
granted means no upstream acquisition; denied means consuming and dropping.

Qualification: safety depends on the documented ordered-source and stable-facts
contract, not defensive validation of deliberately malformed internal callers.
Inventory, configuration, visit recording, batches, lookers and marking are
intentionally outside this slice, not missing implemented features.

**Two-axis summary: Standards 0 findings, no worst finding; Spec 0 findings,
no worst finding.** The package typecheck limitation is separate from both axes.

## Parent architectural judgment

Accept the kernel as the basis for the next integration checkpoint. The small
interface carries meaningful behavior: selection order, stopping authority,
current-session preservation and iterator closure concentrate in one module.
The host-internal predicate is a concrete epilogue seam, not a public arbitrary
plugin rules engine. The separate metadata preparation step makes its eager
scan/sort cost visible rather than disguising it as lazy discovery.

This is **parent acceptance of a bounded implementation**, not human acceptance
of every proposed feature or permission to install anything. No additional code
changes are requested by this review. The human-facing review direction is:
inspect this contract, then proceed to visible-tab inventory and retained batch
wiring; keep the distinct visit-record and bookmark contracts separately gated.

## Verification state at review

- Author reports **44 passed / 0 failed / 92 assertions** across selector,
  existing retained-row and presentation tests. Both reviewers trusted that run.
- `bun typecheck` is **blocked**, not green: unchanged
  [`packages/core/src/util/process-lock-ffi.bun.ts:49`](/packages/core/src/util/process-lock-ffi.bun.ts#L49)
  reports `bigint | Pointer` not assignable to `Pointer`. Parent jj comparison
  independently confirmed the source file is unchanged from the review baseline.
- The full TUI package suite subsequently passed on its single run in followup
  session `ses_f86a08d88ffelHI2NGDyybi24e`: **1,291 passed, 4 skipped, 0 failed**
  across 141 files, exit code 0. Invocation was `bun run test` from `packages/tui`.
  The suite reported 2 snapshots and 107,648 assertions. No restart, focused-test
  rerun or typecheck rerun was performed by that verifier.
- No interactive TUI, live-service, bookmark-store or multi-session output
  verification is claimed: the kernel is not yet connected to those surfaces.

## Full-suite receipt

The verifier confirmed the selector has no production importer: its only import
under `packages/` is the selector test. No known baseline timing failure surfaced
in this run. Non-fatal output included existing renderer resize-listener warnings,
a mini keymap `leader` warning, and a caught client-refresh `UnexpectedStatus`
log; all associated tests passed. This is one successful sample, not a claim that
existing flakes or warnings have been repaired.

Raw output and the verifier's report are retained in the local scratch directory
`.test-agent/epilogue-selection-review/` (`full-suite.log`, `report.md`, `README.md`).
They are local verification artifacts, not distributed product documentation.
The unchanged Core typecheck blocker remains; this passing runtime suite does not
make the package typecheck green or finish the multi-session display feature.

## Cross-references

- [Executable checkpoint](/.design/term-v2/selection-checkpoint0.gpt6a.md) —
  actual interface, detailed edge cases and author verification history.
- [Rekon work overview](file:///home/rektide/src/rekon/design/session-mementos/README.md)
  — capability ownership and unresolved marking semantics.
- [Composition memento](file:///home/rektide/src/rekon/design/ordered-pipelines/memento0.gpt6a.md)
  — preserves the broader architecture without making it an implementation
  prerequisite or flattening different composition laws.
