---
type: ImplementationReport
title: Bus-smart independent-review corrections
description: Astra correction commits, read bounds, pagination semantics, verification, and upstream carry assessment.
resource: /.design/bus-smart/implementation-review-fixes1.gpt6a.md
status: draft
generated: { by: "openai/gpt-6-astra#xhigh", at: 2026-09-05 }
sources:
  - resource: /.design/bus-smart/code-review1-standards.gpt6a.md
  - resource: /.design/bus-smart/code-review1-spec.gpt6a.md
  - resource: /.test-agent/bus-smart/spec-review1-gpt6a/README.md
---

# Independent-review corrections

## Baseline and scope

- GPT-6 Astra xhigh; no child agents. Both independent reviews read in full.
- Clean starting working change `kytyxwqv / c2e6bdc9`, parent `4396b563`;
  standards review `df0541f2`, spec review `4396b563` already committed.
- Fix the four reproduced P2 defects and assess the P3 duplicated adoption policy.
  Keep Protocol, Server/index, Core and SharedEvents unchanged. No live service,
  history rewriting, squash, or push. Reviewer artifacts and scratch repros remain.
- Promote regressions into package tests and demonstrate failures before fixes.
  Scope stays in the existing Client read owner and TUI adoption facade.

## Finding-to-commit and verification record

Implementation in progress; exact read bounds, pagination contract, commits and
test outcomes are recorded below as each correction lands.

### Standards P2: optimistic creation ownership

- Two promoted held-POST fixtures failed before the fix: both issued **two message
  GETs while creation was unresolved**, including after explicit invalidation.
- `message.sync` now consults the existing `creating` owner before allocating any
  transcript entry. It returns without reading while a local creation is pending;
  after success the next explicit read hydrates normally; failure leaves no row.
- Removed the abandoned `session.message:*` completions/invalidations from
  `createSync`. Foreign `session.created` still does not register transcript repair.
- Browser-conditioned transcript suite: **14 pass**; Client `bun typecheck` passed.

## Cross-references

- [Standards review](/.design/bus-smart/code-review1-standards.gpt6a.md): optimistic
  creation ownership and duplicated TUI adoption sequence.
- [Spec review](/.design/bus-smart/code-review1-spec.gpt6a.md): unbounded dirty reads,
  retained history loss and committed-revert pending resurrection.
- [Original implementation report](/.design/bus-smart/implementation-report1.gpt6a.md):
  candidate implementation and measurements; this report corrects its read-repair
  claims rather than restating delta-only benchmarks as repair-cost evidence.
