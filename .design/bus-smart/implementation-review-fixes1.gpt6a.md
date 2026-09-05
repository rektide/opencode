---
type: ImplementationReport
title: Bus-smart independent-review corrections
description: Astra correction commits, read bounds, pagination semantics, verification, and upstream carry assessment.
resource: /.design/bus-smart/implementation-review-fixes1.gpt6a.md
status: draft
generated: { by: "openai/gpt-6-astra#xhigh", at: 2026-09-05 }
stale_after: 2026-10-05
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

All four P2 corrections and the P3 adoption consolidation are implemented.
The following records preserve failures before fixes as well as later regression
coverage. This is a correction candidate awaiting the parent's review recheck,
not acceptance or graduation of the default-off experiment.

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
- Settlement-overlap regression commit: `189e9901`.

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
  nonempty pages** and retain 1–60; a 20-row bounded window + 20 additions requires **one
  probe + two pages**; deleting its oldest row requires **two probes + two pages**.
  Deleting all 20 bounded rows requires **20 probes + one page**, not a scan of the
  older 980 unobserved rows. This is an explicit correctness cost, not free repair.
- The real Server emits `next` for every nonempty page, so confirming exhaustion
  also takes a final **empty page**. Both early-end and empty-page-end cursor
  fixtures are covered: the latter takes **four repair GETs**, not three. Both
  fixtures fail the old count-preservation implementation loaded from `1f5b413e`.
  Empty-page regression commit: `639fff48`.
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
- Renderer fixture commit: `b2405f26`.

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

## Final verification

Commands run from the named package directory, never the repository root:

| Scope | Command / coverage | Result |
| --- | --- | --- |
| Client | `bun run test` | **197 pass, 8 skip, 0 fail**, 16 files |
| Client | `bun test --conditions=browser test/solid-transcript.test.ts test/solid-controlled-event-feed.test.ts test/solid-connection.test.ts` | **51 pass, 0 skip, 0 fail**, 3 files; executes the browser-only fixtures |
| Client | `bun typecheck` | Passed after the final test-only addition |
| TUI | `bun run test` | **1,311 pass, 4 skip, 0 fail**, 143 files, 2 snapshots |
| TUI | `bun test test/context/event-interest-binding.test.ts test/context/event-interest.test.ts test/context/session-tabs.test.tsx test/app-lifecycle.test.tsx test/cli/tui/data.test.tsx` | **129 pass, 0 fail**, 5 files |
| TUI | `bun typecheck` | Passed after the full package suite |
| Preserved review repro | Client: `bun test --conditions=browser ../../.test-agent/bus-smart/spec-review1-gpt6a/reproduction.test.ts` | **3 pass, 0 fail**; scratch originals untouched |
| Broader browser data baseline | Client: `bun test --conditions=browser test/solid-data.test.ts` | **22 pass, 2 fail**, same previously baseline-confirmed Solid-proxy assertions |

The two broader browser failures are `preserves assistant content replacement
events across an active message read` and `projects background user shell metadata
from durable shell data`. They are **not** counted as green. The prior report's
baseline confirmation against `9843c21f` remains available; this pass reran the
candidate and found the same pair, not new failure names.

The TUI package suite also logs handled failed refreshes for event-only fixtures
without transcript HTTP endpoints (`session-retry`, `session-manual`, and
`session-compaction-queued`). The retry fixture already logged this on the earlier
green baseline; the two additional notices are consistent with re-armed settlement
reads after unavailable first snapshots. These are not silently successful reads,
nor unhandled test failures. Production intentionally surfaces HTTP failures and
does not turn them into an automatic retry loop.

Raw outputs and direct-source commands live in the ignored
[correction verification directory](/.test-agent/bus-smart/review-fixes1/README.md).
No Protocol, Server `HttpApi`, generated Client, Schema, Core, or SharedEvents file
changed in this correction range, so no generator or unrelated Server/Core suite
was required. Prettier checks passed on all seven changed runtime/test files.
The local-link check verified **42 Markdown destinations across three documents**
(this report, the original report and the index). Reviewer reports were untouched;
the original report and index received only minimal navigation links.

## Repair workload recheck and precise limits

The existing isolated **real HTTP Server / Bus / generated controlled wrapper /
Core projector** fixture was rerun from `packages/server`:

```sh
bun --conditions=browser ../../.test-agent/bus-smart/bench/snapshot.ts
```

It exits successfully and compares the repaired Client row with actual canonical
Core `Session.messages`: failed non-durable partial text is empty, not the live
suffix. This run records **three transcript-page GETs plus two boundary lookups**.
The measured trace is [review-fixes-snapshot.jsonl](/.test-agent/bus-smart/bench/review-fixes-snapshot.jsonl).
The fixture counter was extended to expose point lookups separately; its existing
canonical oracle and native HTTP abort/cleanup remain unchanged.

- A **scan** is up to `K` point probes for `K` retained authoritative rows, followed
  by descending pages through the oldest surviving anchor, or to exhaustion when
  the already-loaded window was exhausted. It is **not one GET**. Each new adoption
  with no loaded window takes one default page. Replacements preserve outbox and
  admitted pending rows, and never splice stale retained rows back into the result.
- A bounded retained window plus `N` new rows must fetch the new prefix to its
  retained anchor. There is no honest constant request bound independent of `N`.
  The code avoids scanning older unobserved history just because its old anchor
  was deleted; normal cost is one probe, worst deleted-window probe cost is `K`.
- Two scans bound one transcript job, and two GETs bound one pending job. Continued
  ordinary mutations can leave a dirty cache after that budget. New terminal
  batches may start later bounded jobs; infinitely many new terminal events imply
  continuing event-driven work, not a global constant read budget. No timer, retry
  service, replay log, or spin-until-quiet promise was introduced.
- Eventual canonical repair still requires quiescent durable activity **and a
  fresh successful read**. HTTP failure does not guarantee automatic convergence;
  later explicit adoption, reconnect or a qualifying terminal event can retry.
  This is not replay of missed streaming prefixes or a cross-request transaction.
- The old delta-heavy many-client CPU result was **not** rerun or reused as proof
  of zero repair cost. The new point probes and history-span pages are explicitly
  additional work. A representative mixed metadata/repair/notification CPU and
  foreground-latency workload remains a release gate, not a result of this pass.

## Carry footprint, commit sequence, and remaining gates

Corrections start after reviewer checkpoint `4396b563`. The logical commits are:

| Commit | Change |
| --- | --- |
| `20d1ef5d` | Record correction baseline and scope |
| `1f5b413e` | Gate transcript GETs on actual optimistic creation ownership |
| `e3182f01` | Classify transcript mutations and bound coalesced read jobs |
| `dd6fa0d9` | Preserve historical boundaries; correct opaque-cursor requests |
| `da99e4da` | Fence committed-revert pending hydration and bound its read job |
| `93ba6f88` | Preserve explicit observation while the creation gate is held |
| `1c0575c5` | Centralize TUI transcript adoption |
| `b2405f26` | Cover actual renderer history retention and canonical deletion |
| `189e9901` | Verify original-sync completion under continued terminal overlap |
| `639fff48` | Cover real empty-page exhaustion semantics |

The runtime diff remains in one existing Client data owner, the existing TUI
binding, and its two actual callers. Client adds two transcript flags (`loaded`,
`repair`) and a named event classifier; it does not add a cache for foreign Session
creation or another provider/registry. The existing single-message API avoids a
Protocol/Server carry change at the cost of bounded point probes. The repeated
transport-dependent policy leaves the two higher-churn renderer callers.

The independent reviewers have **not** rechecked these commits yet. Parent owns
that next wave. The experiment stays default off. Prior release gates still apply:
no live-user trial, 32-client stress, sustained RPC overload, representative repair
CPU matrix, cross-process grace-removal cohort, full tool/reasoning/retention race
matrix, or already-busy real-model move through completion is claimed. There was
no live elected service operation, child agent, history rewrite, squash, reset,
discard of reviewer work, or push.

Runtime/test correction tip: `639fff48`; the final report/navigation commit follows
that tip in the same history. For recheck, compare from `4396b563`; do not infer an
accepted or graduated experiment from this report's completed verification.

## Cross-references

- [Second-review corrections](/.design/bus-smart/implementation-review-fixes2.gpt6a.md):
  preserves unfulfilled terminal duty with bounded trailing scheduling and audits
  every canonical mutation; supersedes this report's per-scan repair-flag claims.
- [Standards review](/.design/bus-smart/code-review1-standards.gpt6a.md): optimistic
  creation ownership and duplicated TUI adoption sequence.
- [Spec review](/.design/bus-smart/code-review1-spec.gpt6a.md): unbounded dirty reads,
  retained history loss and committed-revert pending resurrection.
- [Original implementation report](/.design/bus-smart/implementation-report1.gpt6a.md):
  candidate implementation and measurements; this report corrects its read-repair
  claims rather than restating delta-only benchmarks as repair-cost evidence.
