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
- `message.sync` consults the existing `creating` owner and returns without a GET
  while a local creation is pending. After success an explicit read can hydrate;
  failure leaves no row. The final observation-registration refinement is below.
- Removed the abandoned `session.message:*` completions/invalidations from
  `createSync`. Foreign `session.created` still does not register transcript repair.
- Browser-conditioned transcript suite: **14 pass**; Client `bun typecheck` passed.
- Commit: `1f5b413e`.
- Self-review of the creation/repair composition then reproduced a related hole:
  skipping the GET must not forget that this particular transcript was explicitly
  observed. A failure after creation otherwise had no registered repair owner.
  Explicit `message.sync` now registers its observation **before** consulting the
  creation gate, whereas foreign creation still registers nothing. A failed create
  deletes that entry. If a terminal arrives while the POST response is held, one
  coalesced repair resumes after `creating` releases its gate. Tests exercise both
  terminal-before-POST-settlement and terminal-after-settlement, with zero premature
  GETs and one canonical repair. This remains the same cache-ownership correction.
- Refinement commit `93ba6f88`; browser transcript suite **29 pass** and Client
  typecheck passed.

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
- Browser-conditioned transcript suite **18 pass** and Client typecheck passed;
  commit `e3182f01`.
- A separate settlement-overlap fixture sends `session.text.ended` during each
  of the two initial scans, then holds the re-armed job's first response. The
  original sync resolves while that later response is still held. A final failure
  during the held response repairs canonically with no later event. This fails
  against pre-budget `1f5b413e` (loaded in memory, production untouched) and passes
  against the correction, directly distinguishing an event-rearmed job from an
  original promise that spins until quiescence. The constant is **per job**, not
  an assertion that continuous new terminal events have zero or constant cost.

### Spec P2: retained historical boundary

- The promoted 1–40 plus 20-offline-additions repro failed with 21–60 retained.
  Bounded-window fixtures also lost their old prefix. A strict cursor fixture
  exposed a directly related existing error: repair combined `cursor` with `order`,
  which the real Server rejects. All four failed before this correction.
- The read owner now distinguishes a successfully loaded transcript from foreign
  event-built rows. A new adoption still loads one default page. A repair retains
  the **oldest surviving authoritative row**, excluding pending/outbox rows.
- Server order uses a private sequence; public IDs are not sortable anchors.
  For a bounded retained window, the existing single-message endpoint locates its
  oldest surviving row (at most one probe per previously retained row; ordinarily
  one probe). A previously exhausted window needs no probe and reads to exhaustion.
  Pages are followed through the anchor, keeping the entire last page and its
  opaque cursor; page-boundary overshoot is at most 19 rows. No cursor is decoded
  or invented, and `order` is sent only on the first page.
- If every bounded retained row was deleted, only the default latest page is
  adopted; the code does not search all older unobserved history for a missing ID.
  A live committed revert first truncates retained state, so an erased suffix
  supplies no stale anchor. Eviction/deletion and observed durable mutations retain
  the existing request-identity/version fences during both probes and page reads.
- Deterministic costs: 40 exhausted rows + 20 additions require **three repair
  pages** and retain 1–60; a 20-row bounded window + 20 additions requires **one
  probe + two pages**; deleting its oldest row requires **two probes + two pages**.
  Deleting all 20 bounded rows requires **20 probes + one page**, not a scan of the
  older 980 unobserved rows. This is an explicit correctness cost, not free repair.
- Fixtures cover exhaustion, a deleted anchor, a deleted entire retained window,
  committed revert, continued load-more, and message IDs opposite to Server order.
  Browser-conditioned transcript suite **25 pass**; Client typecheck passed.
- This remains a client-local repair, not a transaction across multiple HTTP
  reads. Observed mutations invalidate it; no new guarantee is made for a boundary
  concurrently deleted without its durable notification being observed.
- Commit: `dd6fa0d9`.
- Full TUI verification caught an old footer fixture expecting reconnect to
  discard the loaded older pair even though the fixture still served it. It now
  covers two actual renderer paths: retain all six rows when the old pair still
  exists, and retain the same-length index-shift oracle only when the fixture
  canonically removes that pair. Footer metrics and committed revert remain
  asserted in both cases. Both targeted renderer cases pass.

### Spec P2: committed-revert pending hydration

- The review's promoted delayed-inbox fixture failed by restoring the reverted
  input into both pending and transcript. Committed revert now dirties the active
  pending read, just as inbox mutations and compaction consumption already do.
- Exercising the supporting read loop also reproduced the same 11-GET continuation
  problem under repeated real inbox delivery changes. A pending sync now makes at
  most **two GETs**, discards both if superseded, and invalidates its `createSync`
  completion key so a later explicit sync remains possible. There is no automatic
  pending-read retry job or timer. Live inbox/revert handlers remain authoritative
  for mutations observed during the read; stale snapshots never materialize rows.
- The committed-revert case takes **two GETs** and leaves both collections empty.
  The continued-mutation case takes two GETs, then a later explicit quiet sync takes
  one. This completes the existing pending-fencing repair, not a claim that the
  pre-existing revert race was introduced by this feature.
- Browser-conditioned transcript suite **27 pass**; Client typecheck passed.
- Commit: `da99e4da`.

### Standards P3: one TUI transcript-adoption operation

- Added `adoptTranscript` to the existing TUI policy binding. It owns synchronous
  pull-policy/flush, filtered-interest cache invalidation, and `message.sync`.
  Visible rows and hidden-tab prefetch each supply their own current-membership
  predicate and cancellation signal; their post-read stale checks remain intact.
- Filtered adoption uses acknowledged installed interest, not a race with the
  diagnostic mode update. Intentional legacy/fallback preserves its cache.
- The facade test failed before the operation existed, then passed with real
  Client data and the generated GET. It covers acknowledgment-before-read, stale
  membership after the barrier, repeat filtered adoption, legacy cache reuse, and
  cancellation while installation is pending. Actual visible/hidden reader and
  event-toggle renderer fixtures remain green.
- TUI policy/binding/tab suites **47 pass**; TUI typecheck passed. This adds a
  small named operation but removes the transport-dependent read policy from both
  high-churn callers. No registry, provider rearrangement or second policy owner.
- Commit: `1c0575c5`.

## Cross-references

- [Standards review](/.design/bus-smart/code-review1-standards.gpt6a.md): optimistic
  creation ownership and duplicated TUI adoption sequence.
- [Spec review](/.design/bus-smart/code-review1-spec.gpt6a.md): unbounded dirty reads,
  retained history loss and committed-revert pending resurrection.
- [Original implementation report](/.design/bus-smart/implementation-report1.gpt6a.md):
  candidate implementation and measurements; this report corrects its read-repair
  claims rather than restating delta-only benchmarks as repair-cost evidence.
