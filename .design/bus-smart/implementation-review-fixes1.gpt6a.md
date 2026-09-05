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
- Commit: `1f5b413e`.

### Spec P2: bounded transcript repair

- Promoted metadata repro failed at **11 reads** instead of one. A real
  `session.text.started` mutation on every response drove **11 scans in one sync**
  before the fixture stopped mutating. The tests now require that sync to settle
  after **two scans**, preserve live state, and repair after the final failure.
- Added an explicit Client-owned classification of transcript mutations. View,
  rename, usage and other metadata changes no longer dirty a transcript read;
  ephemeral streaming remains excluded. Instructions with no rendered text do not
  dirty the transcript either.
- One read job admits at most **two scans** (initial + one superseded-result repair).
  Concurrent calls join. If both overlap ordinary ongoing transcript mutations,
  they discard their responses and settle with the cache still incomplete—there
  is no retry timer and no attempt to keep reading until activity becomes quiet.
- A new settlement or reconnect coalesces into one `repair` flag. A flag received
  during the final scan earns one later bounded job; this is essential when the
  last terminal event arrives during that scan and no further event will follow.
  Ordinary mutations do not re-arm jobs. With `R` explicit/reconnect jobs and `S`
  later coalesced settlement batches, there are at most `2 × (R + S)` scans, not a
  constant lifetime bound under infinitely many new terminal events. Failed HTTP
  reads reject rather than starting their own automatic retry.
- A further fixture reproduced a terminal event between store publication and
  promise cleanup. Successful jobs now relinquish ownership before checking the
  latest repair flag; such events cannot join a completed promise and lose repair.

## Cross-references

- [Standards review](/.design/bus-smart/code-review1-standards.gpt6a.md): optimistic
  creation ownership and duplicated TUI adoption sequence.
- [Spec review](/.design/bus-smart/code-review1-spec.gpt6a.md): unbounded dirty reads,
  retained history loss and committed-revert pending resurrection.
- [Original implementation report](/.design/bus-smart/implementation-report1.gpt6a.md):
  candidate implementation and measurements; this report corrects its read-repair
  claims rather than restating delta-only benchmarks as repair-cost evidence.
