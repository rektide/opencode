---
type: EvidenceValidation
title: Watchman v2 re-add v4 evidence validation and next research wave
description: Cross-check of E01, E03, E04, E05, E11, and E12, with factual corrections and the next bounded research assignments.
resource: /.design/watchman/v2-readd/v2-readd4-validation0.gpt56solxh.md
tags: [opencode, watchman, watchwoman, v2, validation, research]
status: draft
generated: { by: model:openai/gpt-5.6-sol-xhigh, at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-10-05
sources:
  - id: e01
    resource: /.design/watchman/v2-readd/v2-readd4-e01-daemon0.glm53max.md
    title: E01 daemon target identity
  - id: e03
    resource: /.design/watchman/v2-readd/v2-readd4-e03-protocol-ordering0.glm53max.md
    title: E03 protocol ordering
  - id: e04
    resource: /.design/watchman/v2-readd/v2-readd4-e04-interleavings0.gpt56solmax.md
    title: E04 controller interleavings
  - id: e05
    resource: /.design/watchman/v2-readd/v2-readd4-e05-native-failure0.glm53max.md
    title: E05 Native failure semantics
  - id: e11
    resource: /.design/watchman/v2-readd/v2-readd4-e11-acquisition0.gpt56solmax.md
    title: E11 acquisition circuit and topology
  - id: e12
    resource: /.design/watchman/v2-readd/v2-readd4-e12-lifecycle0.gpt56solmax.md
    title: E12 resource lifecycle
---

# Watchman v2 re-add v4 evidence validation and next research wave

## Result

The six reports agree on their shared source facts and expose three load-bearing
problems in the current v4 premise: the deployed Watchwoman protocol is not a
drop-in match for the selected JavaScript transport, the proposed controller has
no source-proven pre-return or physical-shutdown ownership, and the donor circuit
does not implement v4's blanket stale-result fencing or a coherent
connection-failure predicate.

This document validates research. It does not select architecture, amend v4, or
revise the execution prompt.

## Source identity agreement

All six reports converge on the same source pins where their scopes overlap:

| Source | Validated identity |
| --- | --- |
| OpenCode | `v2@origin` `4306c07b340b9a0504e65785f366d2793cd1b169` |
| Effect | `effect@4.0.0-rc.112`, commit `2600f62f4532026928454dcea8d1c48557b3f942` |
| JavaScript transport | `@superbfowle/fb-watchman-esm@3.0.0`, content commit `3a463955acf6843301ceae387f7a1a0f187e4a65` |
| Stock Watchman source | `923b0935155590be54c0fc052fdca0201f8ebc4b` |
| Deployed Watchwoman | `a1e16cbf35b6bb1e4b429af53d65e738f955c32b`, hash-equal source, installed binary, and running process |
| Carrier generic seam | committed W1 `620fc620b67f`; no production Watchman controller exists |

## Cross-report agreements

1. **The deployed target is known.** E01 proves the active daemon, source,
   binary, process, unit, and socket all resolve to Watchwoman `a1e16cbf`.
2. **Watchwoman and stock subscription protocols materially differ.** E03
   proves merged versus separate initial results, different unsubscribe response
   keys, absent Watchwoman cancellation PDUs, and different fresh-instance
   semantics.
3. **The selected transport is incompatible with the target's unsubscribe
   response.** The transport treats any object carrying `subscription` as
   unilateral. Watchwoman's unsubscribe acknowledgement carries that key, so
   the command callback does not settle. E03 reproduced the resulting stall.
4. **Current OpenCode has no recoverable Native failure surface.** E05 proves
   that pending acquisition blocks readiness, `undefined` ends streams, and
   defects or unconverted typed failures terminate unjoined owner fibers with
   little or no recovery.
5. **Pre-return ownership is the common E04/E12 gap.** OpenCode owns and joins
   the lookup fiber, but it cannot invoke a returned Native finalizer before
   `Native.subscribe` returns. V4 places sentinel, client, route, and command
   work on that earlier side without an executable bracket.
6. **Physical transport shutdown is not joinable.** E04 and E12 independently
   find that `Client.end()` returns `void`, does not await socket close, and
   cannot cancel or join an in-flight `get-sockname` child.
7. **The single-command-timeout release bound is not derivable.** A current
   command plus a separately admitted joined unsubscribe can approach two
   command deadlines; detached unsubscribe violates no-survivor semantics; and
   the outer OpenCode Promise has no timeout.
8. **Root cardinality is operationally material.** E11 finds a directly
   observed 13 exact-client/socket high-water and a separate 34-physical-root
   inotify run. The latter is a v4 topology counterfactual, not a measured 34
   Watchman sockets.
9. **The donor circuit is bounded but not the stated v4 circuit.** It fences
   queued candidates and stale connection failures, but an older already-running
   ordinary success or non-connect result can close a newer open/half-open
   circuit. Its stage labels also classify the same socket failure differently
   depending on whether it occurs during capabilities or `watch`.

## Corrections and qualification

| Record | Text requiring qualification | Validated reading |
| --- | --- | --- |
| E03 | “No stock binary exists on this host.” | No stock binary owns `/usr/local/bin/watchman`; that path is Watchwoman. E01 proves an inactive stock fallback exists at `/usr/local/bin/watchman-facebook`, built from an older revision than the inspected stock source. |
| E11 | “No evidence says this exact [Watchwoman] revision is the deployed binary” and “deployed revision is unknown.” | Superseded by E01 and E03: `/proc` hashing, symlink provenance, source status, and the live version query identify deployed `a1e16cbf`. |
| E11 summary | “13 concurrent exact-root sockets.” | Proven for donor run `d757966f`. The 34-root run used inotify and only projects what v4's one-client-per-exact-root rule would imply. |
| E04/E12 | Route-clear and release ordering described as donor-derived. | The donor completes the closed fence, calls `client.end()`, and only then clears all routes; detached daemon unsubscribe is not joined. V4 states a different order but has no implementation. |

These are cross-report qualifications, not edits to another agent's append-only
record.

## Evidence-gate status after wave one

| Gate | Research status | What remains |
| --- | --- | --- |
| E01 | Factual identity closed | Human scope confirmation: deployed pin only versus moving branch; whether stock remains a required target. |
| E03 | Target source/live evidence strong | Stock live baseline is absent; target/transport incompatibilities need bounded confirmation across the whole command surface. |
| E04 | Negative audit complete | End-to-end safety cannot be proved until an executable controller or state-machine harness owns the missing transitions. More prose inspection will not close it. |
| E05 | Consequence research complete | Permanent-failure behavior is a product/design decision, not another source lookup. |
| E11 | Substantial but open | Adversarial circuit cases, exact failure classification, target pressure, and topology acceptability remain unmeasured. |
| E12 | Negative proof complete | Raw transport lifecycle behavior needs direct experiments; final controller ownership still requires executable composition. |

## Next research wave: daemon and transport closure

All assignments below are GX. They are bounded primary-source or controlled
experiment tasks; none may select architecture or edit production code.

| Wave ID | Output | Question |
| --- | --- | --- |
| N1 / E07+E15 | `v2-readd4-e07-transport-conformance0.glm53max.md` | Does the exact package import and run under the carrier's Bun, and how does its key-based response classifier handle every Watchwoman command response, binary override, `WATCHMAN_SOCK`, cancellation, and actor fault control? |
| N2 / target delta | `v2-readd4-watchwoman-delta0.glm53max.md` | Between deployed `a1e16cbf`, the newer local `systemd` branch, and repository tips, were unsubscribe, same-name routing, ack ordering, root registration, or fresh-instance differences changed or tested? |
| N3 / E12 follow-up | `v2-readd4-e12-transport-lifecycle0.glm53max.md` | In controlled Bun experiments, what child processes, sockets, callbacks, and active handles survive `Client.end()`, interruption, and delayed or failed locator discovery, and for how long? |
| N4 / E11 follow-up | `v2-readd4-e11-circuit-races0.glm53max.md` | In an isolated executable harness, what actually happens when an active half-open probe is interrupted and when an older ordinary success/non-connect result completes in a newer circuit epoch? |
| N5 / E11+E20 | `v2-readd4-e11-pressure0.glm53max.md` | Against an isolated Watchwoman instance, what descriptors, tasks, latency, CPU, and root behavior result from 1, 4, 13, and 34 simultaneous client connections and reconnect bursts? |
| N6 / E03 follow-up | `v2-readd4-e03-stock-live0.glm53max.md` | Can the installed `watchman-facebook` fallback run as an isolated private daemon, and what protocol transcript does that exact binary produce for subscribe, initial delivery, unsubscribe, disconnect, and safe loss? |
| N7 / E06 | `v2-readd4-e06-expression0.glm53max.md` | Which expression terms require capabilities on both daemons, and does the cookie `name` term match basenames at root and nested depth? |
| N8 / E09 | `v2-readd4-e09-row-shapes0.glm53max.md` | What exact `name`/`exists`/`new`/`type` rows do both daemons emit for file and directory create, modify, rename, and delete? |

## Deferred until the following wave

E08 literal-ignore parity, E10 symlink sentinel topology, and E14 Skill
anti-loop behavior remain promotion blockers, but they do not clarify the newly
discovered daemon/transport mismatch or the E11/E12 physical-lifecycle claims.
They should form the path-and-owner wave after N1–N8 are validated.

## Cross-references

- [`v2-readd4-e01-daemon0.glm53max.md`](v2-readd4-e01-daemon0.glm53max.md) — deployed identity and stock fallback provenance.
- [`v2-readd4-e03-protocol-ordering0.glm53max.md`](v2-readd4-e03-protocol-ordering0.glm53max.md) — source/live protocol differences and the reproduced unsubscribe stall.
- [`v2-readd4-e04-interleavings0.gpt56solmax.md`](v2-readd4-e04-interleavings0.gpt56solmax.md) — concurrency audit and missing transition ownership.
- [`v2-readd4-e05-native-failure0.glm53max.md`](v2-readd4-e05-native-failure0.glm53max.md) — current failure consequence matrix.
- [`v2-readd4-e11-acquisition0.gpt56solmax.md`](v2-readd4-e11-acquisition0.gpt56solmax.md) — circuit, topology, root-count, and classification evidence.
- [`v2-readd4-e12-lifecycle0.gpt56solmax.md`](v2-readd4-e12-lifecycle0.gpt56solmax.md) — resource ownership and release-bound proof attempt.
