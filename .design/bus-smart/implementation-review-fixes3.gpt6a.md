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

## Cross-references

- [Standards review3](/.design/bus-smart/code-review3-standards.gpt6a.md): definitive
  absence must terminate automatic repair without preventing later explicit retry.
- [Spec review3](/.design/bus-smart/code-review3-spec.gpt6a.md): canonical-positive
  acknowledgment and lifetime fencing of the retained upstream point read.
- [Previous correction report](/.design/bus-smart/implementation-review-fixes2.gpt6a.md):
  persistent-duty/backoff invariants and canonical mutation categories remain the
  baseline, except for the narrowly refined terminal-error policy in this report.
