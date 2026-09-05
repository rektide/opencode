---
type: ImplementationReport
title: Bus-smart third-review localized corrections
description: Declared-absence repair termination, canonical input acknowledgment, and model-selection point-read lifetime fencing.
resource: /.design/bus-smart/implementation-review-fixes3.gpt6a.md
status: draft
generated: { by: "openai/gpt-6-astra#xhigh", at: 2026-09-05 }
stale_after: 2026-10-05
sources:
  - resource: /.design/bus-smart/code-review3-standards.gpt6a.md
  - resource: /.design/bus-smart/code-review3-spec.gpt6a.md
  - resource: /packages/client/src/solid/data.ts
  - resource: /.test-agent/bus-smart/spec-review3-gpt6a/README.md
---

# Third-review localized corrections

## Baseline and scope

Clean checkpoint `55005115`, following standards review `faccf10c`. Both review3
reports and the scratch README/reproductions were read in full. The previous lost
duty and Skill findings are closed; their bounded scheduling regressions remain.

Only the three authorized seams are in scope. The declared-absence retry loop is
a regression of persistent automatic repair. Canonical input acknowledgment and
the unfenced model-selection point read are **pre-existing adjacent defects**, not
new backoff regressions. No new audit, generic request framework, pruning, permanent
tombstone, Protocol/Core/Server change, live-service operation, child agent, history
rewrite, or push. The experiment stays default off.

## Planned correction boundaries

1. Stop automatic continuation of a repair episode on the generated client's
   decoded `SessionNotFoundError`, for both list pages and boundary probes. Keep
   the cache incomplete, preserve user state, and allow explicit reads/reconnect
   to try again. Arbitrary HTTP 404 and transport failures remain transient.
2. At the accepted canonical reconciliation cut, acknowledge matching local
   optimistic user/synthetic input IDs. Preserve the server's first-admission
   payload, unresolved optimistic rows, and the original POST's rejection result.
   Do not acknowledge from discarded or failed snapshots.
3. Capture ownership of the model-selection row being enriched. Before applying
   the point response, require that same live row and a non-disposed data owner;
   eviction/deletion/recreation must not bless an old response. Use existing row
   ownership rather than adding another epoch map or changing the public API.

## Execution and verification

Each seam is committed independently with red/green package tests. Earlier scratch
suites and review3's originals remain intact.

### Declared Session absence terminates one episode

- The offline-deletion fixture failed before the correction at **five failed
  requests in 180 ms**, both for a message-list GET and a retained-boundary probe.
- The job's rejection handler uses generated `isSessionNotFoundError`, not status
  codes or message text. It clears `repair` and resets backoff for that observation
  identity before the scheduler runs, then **rethrows the original error**. It
  does not complete the cache, delete rows, prune metadata, or retain a tombstone.
- The fixed episode makes **one failed request**. A later explicit sync is allowed
  and may fail once again; a later reconnect likewise starts a new episode. When
  the endpoint becomes available, another explicit sync succeeds without replacing
  the data provider or observation. Existing user-visible rows survive absence.
- Arbitrary JSON HTTP 404 (no declared absence tag) and a transport error mentioning
  404 retain the normal transient backoff and recover. `MessageNotFoundError` still
  means a missing historical anchor, not an absent Session.
- Browser transcript suite **43 pass**, Client typecheck passed. This is the
  review3 standards regression correction; it does not reopen the broader scheduler.
- Commit: `dcdfac6b`.

### Canonical input acknowledgment cut

- Promoted the missing-enqueue/observed-delivery fixture. User and synthetic
  canonical input cases both failed before the fix: a later POST transport failure
  removed the already-verified canonical row.
- Only after the **whole scan** passes its existing identity/disposal/version
  checks, canonical user/synthetic rows acknowledge outbox IDs that match a local
  user/synthetic row **in that Session**. Nothing is acknowledged from discarded,
  partial, failed, or absent snapshots, unrelated IDs or another Session's read.
- Canonical payload wins over the local guess, including a synthetic first
  admission conflicting with a later optimistic user retry. This does not add a
  synthetic-admission API. The original POST still rejects with its transport
  error; only its now-ineligible optimistic rollback is suppressed.
- No pending-delivery event is invented and no pending/control mechanism changes.
  The observed delivery already consumed pending state in the reproduction.
  Genuinely unconfirmed rows remain optimistic after absent/failed/superseded
  reads and are still removed from pending/transcript when their POST fails.
- Six targeted acknowledgment tests pass. Combined browser transcript/mutation
  suites passed before the final cross-Session negative addition (**73 pass**),
  and Client typecheck passed. This repairs the authorized **pre-existing** seam.
- Commit: `0bd27da1`.

### Model-selection point-read ownership

- Four promoted cases failed before the fix: eviction, deletion, disposal, and
  eviction followed by recreation of the **same Session and message IDs**. Healthy
  current-row hydration and prepend/load-more controls already passed.
- The retained single-message GET captures the actual row it will enrich. Its
  response may publish only while the data owner is not disposed and the indexed
  row is still that same object. It no longer appends when its target is absent.
  No new epoch, tombstone, request registry, or domain-wide fencing layer is added.
- Capturing row ownership rather than the whole index identity preserves a healthy
  point response across load-more's index rebuild. Recreated IDs refer to a new
  row and cannot renew old ownership. The original point endpoint and canonical
  enrichment payload remain unchanged.
- All six lifetime/control cases pass; complete browser mutation suite **37 pass**
  and Client typecheck passed. This is the second authorized **pre-existing** seam.
- Commit: `e497e886`.

## Final policy and carry boundaries

### Repair episodes

`SessionNotFoundError` terminates the **current automatic episode**, not Session
identity or local cache ownership. The next explicit `message.sync` remains
eligible because the entry is still incomplete; reconnect or a new qualifying
durable fact can establish a new duty. The original declared error is observable
to its caller/error handler. There is no suppression based on HTTP status alone,
no global absent-ID set, and no automatic deletion of visible state.

Transient failures still retain the prior one-job/one-timer obligation with capped
backoff. Historical-anchor `MessageNotFoundError` still permits the existing
bounded anchor search. Both page and probe errors reach the same narrow episode
policy. No scheduler rate, pagination, or transport-interface redesign is included.

### Canonical confirmation

The confirmation cut is the same synchronous, accepted-scan cut that reconciles
the transcript. Before it, returned rows are only tentative; after its identity
and version checks, matching user/synthetic rows are positive server facts. Only
the corresponding local input's optimistic rollback eligibility is removed. The
canonical payload replaces the guess, not vice versa. A later POST rejection is
still reported but cannot retract that confirmed row. Unconfirmed input, another
Session's input, and rejected snapshots retain their existing rollback semantics.

### Point-read lifetime

The point response must still own the **same live model-selection row object**,
not merely the same ID strings. Disposal independently revokes eligibility. An
index rebuild that preserves the row is healthy, whereas eviction and recreation
create a different row. The HTTP request itself may still finish; this correction
fences its publication rather than introducing generic request cancellation.

All runtime edits remain in `packages/client/src/solid/data.ts`: one generated
error helper import and a rejection branch, one accepted-input acknowledgment
pass, and a row-identity/disposal check on the retained model point read. There is
no new state map, registry, public API, durable fact, framework, or broader audit.
The acknowledgment pass is linear in fetched rows and adds no network request.
Protocol, Server, Core, Schema, generated surfaces, SharedEvents, and TUI production
are unchanged. These are unconditional Client paths, so the ordinary/default
transport suites are part of verification, not only focused SSE.

## Closure verification

Commands ran from package directories; raw results and invocations are preserved
in the ignored [review-fixes3 verification directory](/.test-agent/bus-smart/review-fixes3/README.md).

| Scope | Check | Result |
| --- | --- | --- |
| Client | `bun run test` | **243 pass, 11 skip, 0 fail**, 17 files |
| Client browser | transcript, mutation, controlled feed and connection suites | **100 pass, 0 skip, 0 fail**, 4 files |
| Client | `bun typecheck` | Passed |
| Reviewer scratch | all three preserved spec-review suites, browser conditions | **9 pass, 0 fail**, 3 files |
| TUI focused | policy/binding/tabs, app lifecycle and data suites | **129 pass, 0 fail**, 5 files |
| TUI | `bun run test` | **1,311 pass, 4 skip, 0 fail**, 143 files, 2 snapshots |
| TUI | `bun typecheck` | Passed |
| Broader browser data | `bun test --conditions=browser test/solid-data.test.ts` | **22 pass, 2 fail**, unchanged known baseline assertions |

The broader-browser failures remain `preserves assistant content replacement
events across an active message read` and `projects background user shell metadata
from durable shell data`. They are the previously confirmed Solid-proxy assertion
pair, not a green suite or new failures of these corrections. Existing TUI
event-only fixtures also log handled refresh errors for missing fixture endpoints;
they are not declared Session absence and were not hidden by the new error policy.

Prettier checks passed for the three changed runtime/test files. VCS confirms no
changes to Core, Protocol, Server, Schema, SharedEvents, generated clients, or TUI
production. No generation was needed. Local-link verification is recorded below.
The link check passed: **75 local Markdown destinations across three documents**
(this report, its predecessor, and the index).

| Commit | Scope |
| --- | --- |
| `9255cb57` | Pin review3 baseline and the three authorized seams |
| `dcdfac6b` | Declared Session absence terminates automatic repair, without pruning |
| `0bd27da1` | Canonical input confirmation protects against late optimistic rollback |
| `e497e886` | Retained model-selection point read publishes only to its live row |

## Limits and handoff

This is narrow closure/regression work, not another open-ended audit. No broader
adjacent defect was pursued. The experiment stays **default off**; prior mixed
metadata/repair CPU and foreground-latency, overload, many-observer and remaining
movement/history race release gates are unchanged. No new performance claim is
made from fewer missing-Session retries or the older delta-heavy benchmark.
Parent owns the requested narrow independent closure check. No child agents,
live elected service operation, history rewrite, squash, reset, or push was used.

Correction base: `55005115`; runtime/test tip: `e497e886`. The final report/navigation
commit follows that tip. Neither reviewer conclusions nor scratch reproductions
were rewritten. Only minimal navigation links are added to the preceding report
and index.

## Cross-references

- [Standards review3](/.design/bus-smart/code-review3-standards.gpt6a.md): definitive
  absence must terminate automatic repair without preventing later explicit retry.
- [Spec review3](/.design/bus-smart/code-review3-spec.gpt6a.md): canonical-positive
  acknowledgment and lifetime fencing of the retained upstream point read.
- [Previous correction report](/.design/bus-smart/implementation-review-fixes2.gpt6a.md):
  persistent-duty/backoff invariants and canonical mutation categories remain the
  baseline, except for the narrowly refined terminal-error policy in this report.
